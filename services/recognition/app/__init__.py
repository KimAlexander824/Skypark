import os

# Предел OpenCV на размер декодируемой картинки (защита от «фото-бомбы»).
# Должен быть задан ДО первого import cv2 — поэтому здесь, в самом начале пакета.
# Основная проверка — по заголовку файла в engine.check_image_size; это второй рубеж.
os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", str(50_000_000))
