"""Offline database + private-file backup. Stop app/workers before either command."""

import argparse
import json
import os
import shutil

# The offline CLI executes only resolved PostgreSQL utilities; never a shell.
import subprocess  # nosec B404
import tarfile
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import unquote, urlsplit

from .settings import settings


def database_environment(database_url: str) -> dict[str, str]:
    url = urlsplit(database_url.replace("postgresql+asyncpg://", "postgresql://"))
    if url.scheme != "postgresql" or not url.hostname or not url.path.strip("/"):
        raise ValueError("A PostgreSQL URL is required")
    environment = dict(os.environ)
    environment.update(
        {
            "PGHOST": url.hostname,
            "PGPORT": str(url.port or 5432),
            "PGDATABASE": unquote(url.path[1:]),
            "PGUSER": unquote(url.username or ""),
            "PGPASSWORD": unquote(url.password or ""),
        }
    )
    return environment


def run_database_command(command: list[str], database_url: str) -> None:
    if not command or command[0] not in {"pg_dump", "pg_restore"}:
        raise ValueError("Only PostgreSQL backup utilities are permitted")
    executable = shutil.which(command[0])
    if executable is None:
        raise RuntimeError("Install the PostgreSQL client utilities")
    # Fixed executable allowlist and argv; no untrusted shell interpolation.
    result = subprocess.run(  # nosec B603
        [executable, *command[1:]],
        env=database_environment(database_url),
        capture_output=True,
        check=False,
    )
    if result.returncode:
        # Connection strings and provider/database diagnostics may include credentials.
        raise RuntimeError(f"{command[0]} failed; inspect database availability and permissions")


def backup(destination: Path) -> None:
    destination = destination.resolve()
    if destination.exists():
        raise ValueError("Backup destination already exists")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="abi-backup-") as temp:
        staging = Path(temp)
        run_database_command(
            [
                "pg_dump",
                "--format=custom",
                "--no-owner",
                "--no-acl",
                "--file",
                str(staging / "database.dump"),
            ],
            settings.database_url,
        )
        manifest = {
            "format": 1,
            "created_at": datetime.now(UTC).isoformat(),
            "schema": "0002_workspace_product",
            "requires_stopped_app_and_workers": True,
        }
        (staging / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with (
                os.fdopen(descriptor, "wb") as handle,
                tarfile.open(fileobj=handle, mode="w:gz") as archive,
            ):
                archive.add(staging / "database.dump", arcname="database.dump")
                archive.add(staging / "manifest.json", arcname="manifest.json")
                if settings.storage_root.exists():
                    archive.add(settings.storage_root, arcname="private-documents", recursive=True)
        except (OSError, tarfile.TarError):
            destination.unlink(missing_ok=True)
            raise
    print(f"Backup created: {destination}")


def restore(source: Path, target_database: str, target_storage: Path) -> None:
    target_storage = target_storage.resolve()
    if target_storage.exists() and any(target_storage.iterdir()):
        raise ValueError("Restore target storage must be empty")
    with tempfile.TemporaryDirectory(prefix="abi-restore-") as temp:
        staging = Path(temp)
        with tarfile.open(source, mode="r:gz") as archive:
            members = archive.getmembers()
            if any(not member.isfile() and not member.isdir() for member in members):
                raise ValueError("Backup contains links or special files")
            if any(
                member.name not in {"database.dump", "manifest.json", "private-documents"}
                and not member.name.startswith("private-documents/")
                for member in members
            ):
                raise ValueError("Backup has unexpected paths")
            archive.extractall(staging, filter="data")
        manifest = json.loads((staging / "manifest.json").read_text())
        if manifest.get("format") != 1 or manifest.get("schema") != "0002_workspace_product":
            raise ValueError("Unsupported backup format or schema")
        # No --clean: a populated destination fails instead of deleting its records.
        run_database_command(
            [
                "pg_restore",
                "--exit-on-error",
                "--single-transaction",
                "--no-owner",
                "--no-acl",
                "--dbname",
                database_environment(target_database)["PGDATABASE"],
                str(staging / "database.dump"),
            ],
            target_database,
        )
        target_storage.mkdir(parents=True, exist_ok=True, mode=0o700)
        files = staging / "private-documents"
        if files.exists():
            shutil.copytree(files, target_storage, dirs_exist_ok=True)
        for path in target_storage.rglob("*"):
            path.chmod(0o700 if path.is_dir() else 0o600)
    print("Database and private documents restored to the supplied empty targets")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--app-stopped",
        action="store_true",
        required=True,
        help="Confirm app and workers are stopped; required for consistent file snapshots",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create")
    create.add_argument("destination", type=Path)
    load = commands.add_parser("restore")
    load.add_argument("source", type=Path)
    load.add_argument("--target-database-url", required=True)
    load.add_argument("--target-storage", type=Path, required=True)
    args = parser.parse_args()
    if not args.app_stopped:
        parser.error("Stop the app and workers first")
    if args.command == "create":
        backup(args.destination)
    else:
        restore(args.source, args.target_database_url, args.target_storage)


if __name__ == "__main__":
    main()
