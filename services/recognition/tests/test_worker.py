"""Очередь BullMQ: воркер + клиент для backend (настоящий Redis)."""

import asyncio

from app.recognition import service
from client.recognition_client import RecognitionJobFailed
from tests.conftest import ANNA, DARK, MAXIM, photo


def test_enroll_identify_delete_through_queue(queue_env):
    async def scenario(rc):
        r1 = await rc.enroll(101, photo(ANNA))
        r2 = await rc.enroll(202, photo(MAXIM))
        found = await rc.identify(photo(ANNA))
        deleted = await rc.delete_faces(101)
        after = await rc.identify(photo(ANNA))
        return r1, r2, found, deleted, after

    r1, r2, found, deleted, after = queue_env(scenario)
    assert r1["ok"] and r1["child_id"] == 101 and r1["shard"] == 1 and r1["faces_count"] == 1
    assert r2["ok"] and r2["shard"] == 0
    assert found["ok"] and found["status"] == "found" and found["child_id"] == 101
    assert found["message"] == "Ребёнок найден"
    assert found["candidates"][0] == {"child_id": 101, "confidence": found["confidence"], "is_match": True}
    assert deleted == {"ok": True, "child_id": 101, "deleted": 1}
    assert after["status"] == "not_found"


def test_polling_like_on_diagram(queue_env):
    """POST кладёт задачу и отдаёт job_id, GET спрашивает результат."""

    async def scenario(rc):
        job_id = await rc.submit_identify(photo(ANNA))
        states = []
        for _ in range(200):
            info = await rc.get_result(job_id)
            states.append(info["state"])
            if info["state"] == "completed":
                return job_id, states, info
            await asyncio.sleep(0.05)

    job_id, states, info = queue_env(scenario)
    assert isinstance(job_id, str)
    assert info["result"]["status"] == "not_found"


def test_bad_photo_is_result_not_failure(queue_env):
    async def scenario(rc):
        return await rc.identify(photo(DARK)), await rc.enroll(5, b"not an image")

    no_face, bad = queue_env(scenario)
    assert no_face["ok"] is False and no_face["error"] == "no_face" and no_face["message"]
    assert bad["ok"] is False and bad["error"] == "bad_image"


def test_invalid_jobs_fail_without_retries(queue_env):
    async def scenario(rc):
        results = []
        for name, data in [
            ("unknown", {}),
            ("enroll", {"child_id": "7", "photo": "eA=="}),
            ("enroll", {"child_id": 7, "photo": "%%%"}),
            ("enroll", {"child_id": 7, "photo": "eA==", "source": "x"}),
        ]:
            job_id = await rc.submit(name, data)
            try:
                await rc.wait(job_id, timeout=10)
                results.append("completed")
            except RecognitionJobFailed as exc:
                from bullmq import Job

                job = await Job.fromId(rc.queue, job_id)
                results.append((str(exc), job.attemptsMade))
        return results

    results = queue_env(scenario)
    assert all(r != "completed" for r in results)
    assert all(attempts == 1 for _, attempts in results)  # без повторов
    assert "Неизвестная задача" in results[0][0]


def test_infra_failure_is_retried(queue_env, monkeypatch):
    calls = {"n": 0}
    original = service.identify

    def flaky(image, **kw):
        calls["n"] += 1
        if calls["n"] == 1:
            raise ConnectionError("база недоступна")
        return original(image, **kw)

    monkeypatch.setattr(service, "identify", flaky)
    monkeypatch.setattr("client.recognition_client.DEFAULT_BACKOFF", {"type": "fixed", "delay": 100})

    async def scenario(rc):
        return await rc.identify(photo(ANNA), timeout=20)

    result = queue_env(scenario)
    assert calls["n"] == 2 and result["status"] == "not_found"


def test_unknown_job_id(queue_env):
    async def scenario(rc):
        return await rc.get_result("no-such-job")

    assert queue_env(scenario) == {"state": "unknown"}


def test_frequent_polling_never_sees_empty_result(queue_env):
    """Регрессия: результат не должен быть пустым, даже если опрашивать очень часто
    и задача завершается ровно между чтением статуса и данных."""

    async def scenario(rc):
        results = []
        for _ in range(40):
            job_id = await rc.submit_identify(photo(ANNA))
            results.append(await rc.wait(job_id, timeout=20, poll=0.001))
        return results

    results = queue_env(scenario)
    assert all(r is not None and r["ok"] for r in results)
