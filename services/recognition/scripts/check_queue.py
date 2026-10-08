"""Живая проверка сервиса распознавания через очередь — так, как его вызывает backend.

Подготовьте папку: одна подпапка = один человек, внутри 2+ фото этого человека.

    photos/
      alex/   1.jpg 2.jpg 3.jpg
      akmal/  1.jpg 2.jpg

Запуск (docker compose уже поднят, из папки services/recognition):

    python -m scripts.check_queue photos

Что делает:
  1. регистрирует каждого человека по ПЕРВОМУ фото (задача enroll, child_id = 900001, 900002, ...);
  2. ищет по ОСТАЛЬНЫМ фото (задачи identify, все сразу — как очередь посетителей);
  3. печатает, кого нашёл, с какой уверенностью и сколько это заняло;
  4. в конце удаляет тестовые лица (delete_faces), чтобы не засорять базу.

Фото людей — персональные данные: используйте фото с согласия и не коммитьте папку photos.
"""

import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from client.recognition_client import RecognitionClient  # noqa: E402

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
FIRST_ID = 900001  # тестовые child_id, чтобы не пересечься с настоящими детьми


def load(folder: Path) -> list[tuple[str, list[Path]]]:
    people = []
    for sub in sorted(p for p in folder.iterdir() if p.is_dir()):
        photos = sorted(p for p in sub.iterdir() if p.suffix.lower() in IMAGE_EXT)
        if photos:
            people.append((sub.name, photos))
    return people


async def main() -> None:
    parser = argparse.ArgumentParser(description="Проверка распознавания через очередь BullMQ")
    parser.add_argument("folder", type=Path)
    parser.add_argument("--redis", default=os.environ.get("REDIS_URL", "redis://localhost:6379"))
    parser.add_argument("--keep", action="store_true", help="не удалять тестовые лица в конце")
    parser.add_argument("--timeout", type=float, default=180, help="ожидание одной задачи, с")
    args = parser.parse_args()

    people = load(args.folder)
    if not people:
        sys.exit(f"В {args.folder} нет подпапок с фото")
    rc = RecognitionClient(args.redis)
    ids = {name: FIRST_ID + i for i, (name, _) in enumerate(people)}

    print(f"Очередь: {args.redis}, людей: {len(people)}")
    print("Первая задача может идти до минуты: воркер загружает нейросеть.\n")
    try:
        # 0. есть ли эти люди в базе уже (тогда поиск честно ответит ambiguous)
        for name, photos in people:
            r = await rc.identify(photos[0].read_bytes(), timeout=args.timeout)
            if r["ok"] and r["status"] != "not_found":
                ids_found = [c["child_id"] for c in r["candidates"] if c["is_match"]]
                print(f"  ВНИМАНИЕ: {name} уже есть в базе (child_id {ids_found}).")
                print("  После тестовой регистрации он будет «дважды» → ответ ambiguous.")
                print("  Удалить старые лица: DELETE /api/recognition/faces/{child_id} в Swagger.\n")

        # 1. регистрация
        print("Регистрация (enroll):")
        t = time.time()
        enrolled = set()
        for name, photos in people:
            r = await rc.enroll(ids[name], photos[0].read_bytes(), timeout=args.timeout)
            if r["ok"]:
                enrolled.add(name)
                print(f"  {name:<15} child_id={ids[name]}  шард {r['shard']}  ({photos[0].name})")
                if r.get("warning"):
                    print(f"  {'':<15} ! {r['warning']}")
            else:
                print(f"  {name:<15} НЕ ЗАРЕГИСТРИРОВАН: {r['error']} — {r['message']}")
                print(f"  {'':<15} (регистрируется первое по алфавиту фото — {photos[0].name}. "
                      "Поставьте первым чёткое фото с одним лицом крупным планом, например назовите его 0.jpg)")
        print(f"  заняло {time.time() - t:.1f} с\n")

        # 2. поиск: все задачи сразу
        queries = [(name, p) for name, photos in people for p in photos[1:]]
        if not queries:
            print("Нет фото для поиска: положите каждому человеку 2+ фото")
            return
        print(f"Поиск (identify), {len(queries)} фото одновременно:")
        t = time.time()
        jobs = [(name, p, await rc.submit_identify(p.read_bytes())) for name, p in queries]
        correct = 0
        for name, p, job_id in jobs:
            r = await rc.wait(job_id, timeout=args.timeout)
            if not r["ok"]:
                verdict = f"ошибка фото: {r['error']}"
            elif name not in enrolled:
                ok = r["status"] == "not_found"
                correct += ok
                verdict = f"{r['status']} — не зарегистрирован, " + ("ожидаемо" if ok else "НЕ ДОЛЖЕН НАЙТИСЬ  ← ОШИБКА")
            elif r["status"] == "found":
                who = next((n for n, i in ids.items() if i == r["child_id"]), r["child_id"])
                ok = r["child_id"] == ids[name]
                correct += ok
                verdict = f"найден {who} ({r['confidence']:.2f})" + ("" if ok else "  ← ОШИБКА")
            else:
                best = r["candidates"][0]["confidence"] if r["candidates"] else 0
                verdict = f"{r['status']} (лучшее сходство {best:.2f})"
                if r["status"] == "ambiguous":
                    verdict += f", кандидаты {[c['child_id'] for c in r['candidates'] if c['is_match']]}"
            print(f"  {name:<15} {p.name:<15} → {verdict}")
        took = time.time() - t
        print(f"\n  верно: {correct} из {len(queries)}, заняло {took:.1f} с ({took / len(queries):.2f} с на фото)")
    finally:
        if not args.keep:
            for name in ids:
                await rc.submit_delete_faces(ids[name])
            print("\nТестовые лица отправлены на удаление.")
        await rc.close()


if __name__ == "__main__":
    asyncio.run(main())
