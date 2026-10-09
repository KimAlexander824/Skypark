"""Состояние очереди распознавания: python -m app.stats

Для мониторинга (и вручную, и из системы мониторинга через GET /api/recognition/stats):
  waiting   — ждут воркера. Постоянно растёт → воркеров не хватает (--scale).
  active    — выполняются сейчас.
  failed    — упали после всех повторов за последний час. Растёт → сбой базы/модели.
  completed — выполнены за последние 10 минут.
"""

import asyncio
import json

from bullmq import Queue

from app.config import get_settings

TYPES = ("waiting", "prioritized", "active", "delayed", "failed", "completed")


async def queue_stats() -> dict:
    s = get_settings()
    queue = Queue(s.queue_name, {"connection": s.redis_url})
    try:
        counts = await queue.getJobCounts(*TYPES)
    finally:
        await queue.close()
    # В BullMQ задачи с приоритетом лежат в отдельном списке, но для человека это тоже «ждут».
    counts["waiting"] = counts.get("waiting", 0) + counts.pop("prioritized", 0)
    return {"queue": s.queue_name, **counts}


if __name__ == "__main__":
    print(json.dumps(asyncio.run(queue_stats()), ensure_ascii=False, indent=2))
