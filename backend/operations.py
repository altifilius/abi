"""Durable, content-free worker status and bounded dependency readiness checks."""

import asyncio
import ipaddress
import json
import os
import shutil
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException
from sqlalchemy import DateTime, String, select, text
from sqlalchemy.dialects.postgresql import JSONB, insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Mapped, mapped_column

from .db import AsyncSessionLocal, Base
from .notifications import ensure_mail_configured
from .services.llm import AIConfigurationError, get_ai_config
from .settings import settings
from .workspaces import utcnow


class WorkerHeartbeat(Base):
    __tablename__ = "worker_heartbeats"
    worker_name: Mapped[str] = mapped_column(String(80), primary_key=True)
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    detail: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


async def record_heartbeat(worker_name: str, status: str, detail: dict | None = None) -> None:
    if worker_name not in {"reminders", "source_watch"} or status not in {"success", "failed"}:
        raise ValueError("Unknown worker heartbeat")
    # Only aggregate counters and a fixed safe error code may cross this boundary.
    safe = {
        key: value
        for key, value in (detail or {}).items()
        if key
        in {
            "events",
            "reminders_examined",
            "mail_queued",
            "sent",
            "retry",
            "dead_letter",
            "cancelled",
            "programs",
            "changed",
            "unchanged",
            "failed",
        }
        and isinstance(value, int)
        and not isinstance(value, bool)
        and value >= 0
    }
    if status == "failed":
        safe["error_code"] = "worker_failed"
    now = utcnow()
    async with AsyncSessionLocal() as session:
        await session.execute(
            insert(WorkerHeartbeat)
            .values(worker_name=worker_name, checked_at=now, status=status, detail=safe)
            .on_conflict_do_update(
                index_elements=[WorkerHeartbeat.worker_name],
                set_={"checked_at": now, "status": status, "detail": safe},
            )
        )
        await session.commit()


def ai_configuration() -> dict:
    result = {}
    for policy in ("local", "external"):
        operations = {}
        for operation, purpose in (
            ("chat", "chat"),
            ("documents", "idea"),
            ("translation", "idea"),
            ("embeddings", "embedding"),
        ):
            try:
                get_ai_config(policy, purpose)
            except AIConfigurationError:
                operations[operation] = False
            else:
                operations[operation] = True
        result[policy] = {
            "configured": operations["chat"] and operations["documents"],
            "operations": operations,
        }
    return result


def ocr_available() -> bool:
    import pytesseract

    if shutil.which("tesseract") is None:
        return False
    config = ""
    if settings.ocr_data_path is not None:
        path = str(settings.ocr_data_path)
        if any(character in path for character in ('"', "\n", "\r")):
            return False
        config = f'--tessdata-dir "{path}"'
    try:
        return set(settings.ocr_language.split("+")).issubset(
            pytesseract.get_languages(config=config)
        )
    except (OSError, RuntimeError, pytesseract.TesseractError):
        return False


def backup_status() -> dict:
    try:
        path = Path(settings.storage_root) / ".backup-status.json"
        if path.stat().st_size > 4096:
            return {}
        record = json.loads(path.read_text(encoding="utf-8"))
        return {
            key: datetime.fromisoformat(record[key]).isoformat()
            for key in ("created_at", "restored_at")
            if isinstance(record.get(key), str)
        }
    except (OSError, ValueError, TypeError, AttributeError):
        return {}


def record_backup_status(operation: str, storage: Path) -> None:
    if operation not in {"created_at", "restored_at"}:
        raise ValueError("Unknown backup operation")
    storage.mkdir(parents=True, exist_ok=True, mode=0o700)
    record = backup_status() if storage == Path(settings.storage_root) else {}
    record[operation] = utcnow().isoformat()
    with tempfile.NamedTemporaryFile(
        dir=storage, mode="w", encoding="utf-8", delete=False
    ) as handle:
        temporary = Path(handle.name)
        try:
            json.dump(record, handle)
            handle.flush()
            os.fsync(handle.fileno())
            temporary.replace(storage / ".backup-status.json")
        finally:
            temporary.unlink(missing_ok=True)


def storage_available() -> bool:
    try:
        root = Path(settings.storage_root)
        if not root.is_dir():
            return False
        with tempfile.TemporaryFile(dir=root) as probe:
            probe.write(b"abi readiness")
            probe.flush()
        return True
    except OSError:
        return False


async def health_payload() -> dict:
    services = []
    workers = []
    database = False
    try:
        async with asyncio.timeout(3):
            async with AsyncSessionLocal() as session:
                database = await session.scalar(text("SELECT 1")) == 1
                rows = (await session.execute(select(WorkerHeartbeat))).scalars().all()
                for name in ("reminders", "source_watch"):
                    heartbeat = next((row for row in rows if row.worker_name == name), None)
                    window = timedelta(hours=26) if name == "source_watch" else timedelta(minutes=5)
                    stale = heartbeat is None or heartbeat.checked_at < utcnow() - window
                    workers.append(
                        {
                            "worker_name": name,
                            "checked_at": heartbeat.checked_at if heartbeat else None,
                            "status": heartbeat.status if heartbeat else "unavailable",
                            "stale": stale,
                            "detail": heartbeat.detail if heartbeat else {},
                        }
                    )
    except (SQLAlchemyError, OSError, TimeoutError):
        database = False
    services.append(
        {
            "code": "database",
            "critical": True,
            "configured": True,
            "available": database,
            "status": "available" if database else "unavailable",
        }
    )
    storage = await asyncio.to_thread(storage_available)
    services.append(
        {
            "code": "storage",
            "critical": True,
            "configured": True,
            "available": storage,
            "status": "available" if storage else "unavailable",
        }
    )
    ocr = await asyncio.to_thread(ocr_available)
    services.append(
        {
            "code": "ocr",
            "critical": False,
            "configured": True,
            "available": ocr,
            "status": "available" if ocr else "unavailable",
        }
    )
    try:
        ensure_mail_configured()
    except HTTPException:
        smtp = False
    else:
        smtp = True
    services.append(
        {
            "code": "smtp",
            "critical": False,
            "configured": smtp,
            "available": None,
            "status": "configured" if smtp else "unconfigured",
        }
    )
    configuration = ai_configuration()
    for policy in ("local", "external"):
        configured = configuration[policy]["configured"]
        available = None
        status = "configured_unchecked" if configured else "unconfigured"
        if policy == "local" and configured:
            config = get_ai_config("local")
            parsed = urlparse(config.base_url)
            try:
                loopback = (
                    parsed.hostname == "localhost"
                    or ipaddress.ip_address(parsed.hostname).is_loopback
                )
            except ValueError:
                loopback = False
            if loopback:
                try:
                    async with httpx.AsyncClient(
                        timeout=2, follow_redirects=False, trust_env=False
                    ) as client:
                        async with asyncio.timeout(2):
                            async with client.stream(
                                "GET",
                                config.base_url.rstrip("/") + "/models",
                                headers={"Authorization": "Bearer " + config.api_key},
                            ) as response:
                                response.raise_for_status()
                                content = bytearray()
                                async for chunk in response.aiter_bytes():
                                    if len(content) + len(chunk) > 262144:
                                        raise ValueError("Oversized health response")
                                    content.extend(chunk)
                        models = json.loads(content).get("data", [])
                        available = any(
                            isinstance(model, dict) and model.get("id") == config.model
                            for model in models
                        )
                except (httpx.HTTPError, ValueError, TypeError, AttributeError, TimeoutError):
                    available = False
                status = "available" if available else "unavailable"
        services.append(
            {
                "code": "ai_" + policy,
                "critical": False,
                "configured": configured,
                "available": available,
                "status": status,
            }
        )
    for worker in workers:
        available = not worker["stale"] and worker["status"] == "success"
        services.append(
            {
                "code": "worker_" + worker["worker_name"],
                "critical": False,
                "configured": worker["checked_at"] is not None,
                "available": available,
                "status": "available" if available else "unavailable",
            }
        )
    if not workers:
        for name in ("reminders", "source_watch"):
            services.append(
                {
                    "code": "worker_" + name,
                    "critical": False,
                    "configured": False,
                    "available": False,
                    "status": "unavailable",
                }
            )
    return {
        "ready": all(service["available"] for service in services if service["critical"]),
        "degraded": any(
            service["available"] is False for service in services if not service["critical"]
        ),
        "services": services,
        "backup": {"mode": "offline_manual", **await asyncio.to_thread(backup_status)},
        "workers": workers,
    }
