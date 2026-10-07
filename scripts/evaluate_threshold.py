"""Подбор порога сходства MATCH_THRESHOLD на реальных фотографиях.

Подготовьте папку: одна подпапка = один ребёнок, внутри 2+ фото этого ребёнка
(лучше снятые в разные дни, как это будет на ресепшене):

    photos/
      anna/    1.jpg 2.jpg 3.jpg
      maxim/   1.jpg 2.jpg
      ...

Запуск (нужен insightface — проще всего внутри Docker):

    docker compose run --rm -v ./photos:/photos api python -m scripts.evaluate_threshold /photos

Скрипт НЕ трогает базу данных. Он считает сходство всех пар фото и для каждого
порога показывает:
  * ложные совпадения (FAR) — доля пар РАЗНЫХ детей, признанных одним ребёнком.
    Это самая опасная ошибка: в системе откроется чужая карточка;
  * пропуски (FRR) — доля пар ОДНОГО ребёнка, которые не узнаны.
    Не опасно: сотрудник найдёт ребёнка по телефону, но это неудобно;
  * точность поиска — как часто identify() нашёл бы правильного ребёнка, если в
    базе лежит первое фото каждого ребёнка, а ищем по остальным.

Фото детей — персональные данные: не коммитьте папку photos в git.
"""

import argparse
import itertools
import sys
from pathlib import Path

import numpy as np

from app.config import get_settings
from app.recognition.engine import InsightFaceEngine, extract_face
from app.recognition.errors import FaceError

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def load_embeddings(root: Path) -> dict[str, list[np.ndarray]]:
    s = get_settings()
    print(f"Загружаю модель {s.face_model}…", file=sys.stderr)
    engine = InsightFaceEngine(s.face_model, s.face_det_size)
    people: dict[str, list[np.ndarray]] = {}
    for folder in sorted(p for p in root.iterdir() if p.is_dir()):
        for path in sorted(folder.iterdir()):
            if path.suffix.lower() not in IMAGE_EXT:
                continue
            try:
                face = extract_face(engine, path.read_bytes(), require_single=False)
            except FaceError as exc:
                print(f"  пропуск {path}: {exc.code} — {exc.message}", file=sys.stderr)
                continue
            people.setdefault(folder.name, []).append(face.embedding)
    return {name: embs for name, embs in people.items() if embs}


def pair_scores(people: dict[str, list[np.ndarray]]) -> tuple[np.ndarray, np.ndarray]:
    genuine, impostor = [], []
    items = [(name, e) for name, embs in people.items() for e in embs]
    for (n1, e1), (n2, e2) in itertools.combinations(items, 2):
        (genuine if n1 == n2 else impostor).append(float(np.dot(e1, e2)))
    return np.array(genuine), np.array(impostor)


def identification(people: dict[str, list[np.ndarray]], threshold: float, margin: float):
    """Галерея = первое фото каждого ребёнка, запросы = остальные фото.
    Логика та же, что в service.identify_embedding()."""
    names = list(people)
    gallery = np.stack([people[n][0] for n in names])
    found = wrong = ambiguous = not_found = 0
    for true_name in names:
        for q in people[true_name][1:]:
            sims = gallery @ q
            order = np.argsort(-sims)
            matches = [i for i in order if sims[i] >= threshold]
            if not matches:
                not_found += 1
            elif len(matches) >= 2 and sims[matches[0]] - sims[matches[1]] < margin:
                ambiguous += 1
            elif names[matches[0]] == true_name:
                found += 1
            else:
                wrong += 1
    return found, wrong, ambiguous, not_found


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder", type=Path)
    parser.add_argument("--from", dest="lo", type=float, default=0.20)
    parser.add_argument("--to", dest="hi", type=float, default=0.75)
    parser.add_argument("--step", type=float, default=0.05)
    args = parser.parse_args()

    people = load_embeddings(args.folder)
    genuine, impostor = pair_scores(people)
    n_photos = sum(len(v) for v in people.values())
    print(f"\nДетей: {len(people)}, фото с лицом: {n_photos}")
    print(f"Пар одного ребёнка: {len(genuine)}, пар разных детей: {len(impostor)}")
    if len(genuine) == 0 or len(impostor) == 0:
        sys.exit("Нужно минимум 2 ребёнка и у кого-то из них 2+ фото")

    print(
        f"Сходство одного ребёнка:  мин {genuine.min():.3f}  медиана {np.median(genuine):.3f}\n"
        f"Сходство разных детей:    медиана {np.median(impostor):.3f}  макс {impostor.max():.3f}\n"
    )

    margin = get_settings().ambiguity_margin
    current = get_settings().match_threshold
    print(" порог | ложные совп. (FAR) | пропуски (FRR) | поиск: верно / ЧУЖОЙ / неоднозн. / не найден")
    print("-------+--------------------+----------------+--------------------------------------------")
    good = []  # пороги без ложных совпадений и с пропусками не больше 5%
    for t in np.arange(args.lo, args.hi + 1e-9, args.step):
        far = float((impostor >= t).mean())
        frr = float((genuine < t).mean())
        found, wrong, amb, nf = identification(people, t, margin)
        mark = "  <- сейчас" if abs(t - current) < 1e-6 else ""
        print(f" {t:.2f}  | {far:17.2%}  | {frr:13.2%}  | {found:5} / {wrong:5} / {amb:10} / {nf:9}{mark}")
        if far == 0 and wrong == 0 and frr <= 0.05:
            good.append(float(t))

    print()
    if not good:
        print("Нет порога без ложных совпадений и с пропусками ≤5% — нужно больше/качественнее фото.")
    else:
        mid = (good[0] + good[-1]) / 2
        print(f"Хорошие пороги: от {good[0]:.2f} до {good[-1]:.2f} (FAR = 0, FRR ≤ 5%).")
        print(f"Рекомендация — середина диапазона: MATCH_THRESHOLD={mid:.2f}")
        print("Чем больше детей в наборе, тем надёжнее вывод. Братья/сёстры — особенно полезны.")


if __name__ == "__main__":
    main()
