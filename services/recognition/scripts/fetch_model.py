"""Скачать веса модели и проверить контрольную сумму (используется в Dockerfile).

    python scripts/fetch_model.py URL SHA256 ПАПКА [ФАЙЛ.onnx ...]

Если sha256 архива не совпал — ошибка, образ не соберётся: подменённая или
повреждённая модель в продакшен не попадёт. Из архива извлекаются только
перечисленные файлы (для поиска лиц нужны детектор и распознаватель).

URL может быть и локальным: file:///путь/buffalo_l.zip.
"""

import hashlib
import shutil
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path


def main() -> None:
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    url, expected, target, *names = sys.argv[1:]
    target = Path(target)
    with tempfile.TemporaryDirectory() as tmp:
        archive = Path(tmp) / "model.zip"
        print(f"Скачиваю {url}")
        with urllib.request.urlopen(url, timeout=600) as response, archive.open("wb") as out:
            shutil.copyfileobj(response, out, length=1024 * 1024)
        digest = hashlib.sha256()
        with archive.open("rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != expected.lower():
            sys.exit(f"sha256 не совпал!\n  ожидалось: {expected}\n  получено:  {digest.hexdigest()}")
        print("sha256 совпал")
        target.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive) as zf:
            members = names or zf.namelist()
            for name in members:
                if Path(name).name != name:  # без путей внутри архива (защита от ../)
                    sys.exit(f"Подозрительное имя в архиве: {name}")
                with zf.open(name) as src, (target / name).open("wb") as dst:
                    shutil.copyfileobj(src, dst)
                print(f"  {target / name}")


if __name__ == "__main__":
    main()
