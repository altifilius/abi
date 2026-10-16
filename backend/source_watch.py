"""Bounded HTTPS fetching of official sources; every change remains a human draft."""

import asyncio
import base64
import copy
import hashlib
import http.client
import ipaddress
import json
import socket
import ssl
import time
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

from sqlalchemy import select

OFFICIAL_HOSTS = frozenset(
    {
        "tubitak.gov.tr",
        "www.tubitak.gov.tr",
        "eteydeb.tubitak.gov.tr",
        "www.eurekanetwork.org",
        "eurekanetwork.org",
        "myeurekaproject.org",
        "www.myeurekaproject.org",
        "www.gov.uk",
        "apply-for-innovation-funding.service.gov.uk",
        "www.ycombinator.com",
        "ycombinator.com",
        "apply.ycombinator.com",
        "nrc.canada.ca",
        "cnrc.canada.ca",
        "publications.gc.ca",
        "www.innosuisse.admin.ch",
        "www.llv.li",
        "llv.li",
        "ec.europa.eu",
        "research-and-innovation.ec.europa.eu",
        "eur-lex.europa.eu",
        "www.turkiyekalkinmafonu.com.tr",
    }
)
MAX_SOURCE_BYTES = 2 * 1024 * 1024
TOTAL_TIMEOUT = 25
SOCKET_TIMEOUT = 10


class SourceFetchError(ValueError):
    pass


def validate_url(url: str) -> str:
    try:
        parsed = urlsplit(url)
        valid = (
            parsed.scheme == "https"
            and parsed.hostname in OFFICIAL_HOSTS
            and parsed.port in (None, 443)
            and not parsed.username
            and not parsed.password
            and not parsed.fragment
            and not any(ord(character) < 32 or ord(character) == 127 for character in url)
        )
    except ValueError as exc:
        raise SourceFetchError("Invalid source URL") from exc
    if not valid:
        raise SourceFetchError(
            "HTTPS official allowlisted source URLs only; credentials, fragments and custom ports prohibited"
        )
    return parsed.hostname


def public_addresses(host: str) -> list[str]:
    addresses = list(
        dict.fromkeys(
            record[4][0] for record in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        )
    )
    if not addresses:
        raise SourceFetchError("Official host did not resolve")
    # Reject the entire answer if any record points internally (including IPv4-mapped IPv6).
    for address in addresses:
        ip = ipaddress.ip_address(address)
        effective = (
            ip.ipv4_mapped if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped else ip
        )
        if not effective.is_global or effective.is_multicast:
            raise SourceFetchError("Nonpublic source address prohibited")
    return addresses


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host: str, address: str, timeout: float):
        super().__init__(host, port=443, timeout=timeout, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        # No second hostname lookup; certificate and SNI are still checked for the official host.
        family = socket.AF_INET6 if ":" in self.address else socket.AF_INET
        raw = socket.socket(family, socket.SOCK_STREAM)
        raw.settimeout(self.timeout)
        try:
            raw.connect((self.address, 443))
            peer = ipaddress.ip_address(raw.getpeername()[0])
            if peer != ipaddress.ip_address(self.address):
                raise SourceFetchError("Unexpected connected peer")
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except BaseException:
            raw.close()
            raise


@dataclass(frozen=True)
class FetchResult:
    url: str
    status: int
    content: bytes | None
    media_type: str
    etag: str | None
    last_modified: str | None


def fetch_source(
    url: str, etag: str | None = None, last_modified: str | None = None
) -> FetchResult:
    deadline = time.monotonic() + TOTAL_TIMEOUT
    current = url
    for redirect in range(4):
        host = validate_url(current)
        addresses = public_addresses(host)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise SourceFetchError("Source fetch deadline exceeded")
        headers = {
            "User-Agent": "Abi-Official-Source-Watcher/1.0",
            "Accept-Encoding": "identity",
            "Accept": "text/html,application/pdf,text/plain,application/json",
        }
        if current == url:
            for key, value in (("If-None-Match", etag), ("If-Modified-Since", last_modified)):
                if value and len(value) <= 1000 and "\r" not in value and "\n" not in value:
                    headers[key] = value
        parsed = urlsplit(current)
        target = (parsed.path or "/") + ("?" + parsed.query if parsed.query else "")
        connection = PinnedHTTPSConnection(host, addresses[0], min(SOCKET_TIMEOUT, remaining))
        try:
            connection.request("GET", target, headers=headers)
            response = connection.getresponse()
            if response.status in {301, 302, 303, 307, 308}:
                location = response.getheader("Location")
                if not location or redirect == 3:
                    raise SourceFetchError("Invalid or excessive official source redirects")
                current = urljoin(current, location)
                validate_url(current)
                continue
            media_type = response.getheader("Content-Type", "").split(";", 1)[0].lower()
            result_headers = (response.getheader("ETag"), response.getheader("Last-Modified"))
            if response.status == 304:
                return FetchResult(current, 304, None, media_type, *result_headers)
            if response.status != 200:
                raise SourceFetchError(f"Official source unavailable: HTTP {response.status}")
            if response.getheader("Content-Encoding", "identity").lower() not in {"", "identity"}:
                raise SourceFetchError("Compressed source responses are not accepted")
            length = response.getheader("Content-Length")
            if length and int(length) > MAX_SOURCE_BYTES:
                raise SourceFetchError("Source exceeds byte cap")
            if media_type not in {
                "text/html",
                "text/plain",
                "text/markdown",
                "application/pdf",
                "application/json",
                "application/octet-stream",
            }:
                raise SourceFetchError("Unsupported official source media type")
            chunks, size = [], 0
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise SourceFetchError("Source fetch deadline exceeded")
                if connection.sock is not None:
                    connection.sock.settimeout(min(SOCKET_TIMEOUT, remaining))
                elif response.fp is not None and hasattr(response.fp, "raw"):
                    response.fp.raw._sock.settimeout(min(SOCKET_TIMEOUT, remaining))
                chunk = response.read1(min(65536, MAX_SOURCE_BYTES + 1 - size))
                if not chunk:
                    break
                chunks.append(chunk)
                size += len(chunk)
                if size > MAX_SOURCE_BYTES:
                    raise SourceFetchError("Source exceeds byte cap")
            content = b"".join(chunks)
            if not content:
                raise SourceFetchError("Empty official source response")
            # A protection/challenge page is not evidence, even when delivered with status 200.
            if media_type == "text/html" and any(
                marker in content[:50000].lower()
                for marker in (b"just a moment...", b"cf-chl-", b"captcha")
            ):
                raise SourceFetchError("Official source requires interactive verification")
            return FetchResult(current, 200, content, media_type, *result_headers)
        finally:
            connection.close()
    raise SourceFetchError("Redirect limit exceeded")


async def fetch_bounded(
    url: str, etag: str | None = None, last_modified: str | None = None
) -> FetchResult:
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(fetch_source, url, etag, last_modified), timeout=TOTAL_TIMEOUT + 2
        )
    except (TimeoutError, OSError, ValueError, http.client.HTTPException) as exc:
        raise SourceFetchError(
            f"Official source fetch failed: {type(exc).__name__}: {exc}"
        ) from exc


async def watch_once() -> dict:
    from .db import AsyncSessionLocal
    from .funding import (
        FundingCall,
        Program,
        SourceRevision,
        call_definition,
        source_digest,
        utcnow,
    )

    async with AsyncSessionLocal() as session:
        programs = (await session.scalars(select(Program).order_by(Program.code))).all()
        identities = [(p.id, p.code) for p in programs]
    results = []
    fetched_sources: dict[tuple, FetchResult] = {}
    for program_id, code in identities:
        try:
            async with AsyncSessionLocal() as session:
                program = await session.get(Program, program_id)
                old = (
                    await session.scalars(
                        select(SourceRevision)
                        .where(SourceRevision.program_id == program_id)
                        .order_by(SourceRevision.version.desc())
                        .limit(1)
                    )
                ).first()
                if old is None:
                    raise SourceFetchError("No captured official source to watch")
                snapshots = json.loads(old.content)
                old_id, cache = old.id, copy.deepcopy(program.watch_http)
            new_snapshots, new_cache = [], {}
            for snapshot in snapshots:
                conditional = cache.get(snapshot["url"], {})
                fetch_key = (
                    snapshot["url"],
                    snapshot["sha256"],
                    conditional.get("etag"),
                    conditional.get("last_modified"),
                )
                if fetch_key not in fetched_sources:
                    fetched_sources[fetch_key] = await fetch_bounded(
                        snapshot["url"], conditional.get("etag"), conditional.get("last_modified")
                    )
                fetched = fetched_sources[fetch_key]
                now = utcnow().isoformat()
                new_cache[snapshot["url"]] = {
                    "etag": fetched.etag or conditional.get("etag"),
                    "last_modified": fetched.last_modified or conditional.get("last_modified"),
                    "checked_at": now,
                }
                if fetched.status == 304:
                    new_snapshots.append(snapshot)
                else:
                    new_snapshots.append(
                        {
                            "url": snapshot["url"],
                            "final_url": fetched.url,
                            "sha256": hashlib.sha256(fetched.content).hexdigest(),
                            "content_base64": base64.b64encode(fetched.content).decode("ascii"),
                            "media_type": fetched.media_type,
                            "fetched_at": now,
                        }
                    )
            digest = source_digest(new_snapshots)
            async with AsyncSessionLocal() as session:
                program = await session.get(Program, program_id, with_for_update=True)
                latest = (
                    await session.scalars(
                        select(SourceRevision)
                        .where(SourceRevision.program_id == program_id)
                        .order_by(SourceRevision.version.desc())
                        .limit(1)
                    )
                ).first()
                if latest.id != old_id:
                    results.append({"code": code, "status": "concurrent_update_skipped"})
                    continue
                program.watch_http = new_cache
                if latest.sha256 == digest:
                    await session.commit()
                    results.append({"code": code, "status": "unchanged"})
                    continue
                previous_call = (
                    await session.scalars(
                        select(FundingCall)
                        .where(FundingCall.program_id == program_id)
                        .order_by(FundingCall.version.desc())
                        .limit(1)
                    )
                ).first()
                source = SourceRevision(
                    program_id=program_id,
                    version=latest.version + 1,
                    source_url=new_snapshots[0]["url"],
                    sha256=digest,
                    content=json.dumps(new_snapshots, ensure_ascii=False, separators=(",", ":")),
                    checked_at=utcnow(),
                    publication_status="pending",
                )
                session.add(source)
                await session.flush()
                if previous_call:
                    # Copied rules are unvalidated proposals, not adopted source changes.
                    definition = copy.deepcopy(call_definition(previous_call))
                    definition["rule_version"] = f"source-{source.version}-pending"
                    session.add(
                        FundingCall(
                            program_id=program_id,
                            version=previous_call.version + 1,
                            status="draft",
                            source_revision_id=source.id,
                            validated_source_sha256=None,
                            **definition,
                        )
                    )
                await session.commit()
                results.append(
                    {"code": code, "status": "draft_created", "source_revision_id": source.id}
                )
        except (SourceFetchError, json.JSONDecodeError) as exc:
            results.append({"code": code, "status": "source_unavailable", "error": str(exc)})
    return {"results": results, "auto_published": False}
