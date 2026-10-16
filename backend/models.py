"""Immutable, policy-specific indexes of published report evidence."""

import uuid
from datetime import UTC, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB

from .db import Base


def uuid_str() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


class ReportVersion(Base):
    __tablename__ = "report_versions"
    __table_args__ = (
        UniqueConstraint("report_id", "ai_policy", "version", name="uq_report_policy_version"),
        Index(
            "uq_active_report_policy",
            "report_id",
            "ai_policy",
            unique=True,
            postgresql_where=text("is_active"),
        ),
    )
    id = Column(String, primary_key=True, default=uuid_str)
    report_id = Column(String(200), nullable=False)
    version = Column(Integer, nullable=False)
    source_sha256 = Column(String(64), nullable=False)
    source_url = Column(Text, nullable=True)
    ai_policy = Column(String(10), nullable=False)
    embedding_model = Column(String(200), nullable=False)
    embedding_dimensions = Column(Integer, nullable=False)
    playbook_model = Column(String(200), nullable=False)
    is_active = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class ReportChunk(Base):
    __tablename__ = "report_chunks"
    __table_args__ = (
        UniqueConstraint(
            "report_version_id", "page", "chunk_index", name="uq_chunk_version_page_idx"
        ),
    )
    id = Column(String, primary_key=True, default=uuid_str)
    report_version_id = Column(
        String, ForeignKey("report_versions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    page = Column(Integer, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    section_title = Column(String, nullable=True)
    text = Column(Text, nullable=False)
    embedding = Column(Vector, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class Dimension(Base):
    __tablename__ = "dimensions"
    id = Column(String, primary_key=True, default=uuid_str)
    key = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class DimensionPlaybook(Base):
    __tablename__ = "dimension_playbooks"
    __table_args__ = (
        UniqueConstraint(
            "report_version_id", "dimension_key", name="uq_playbook_version_dimension"
        ),
    )
    id = Column(String, primary_key=True, default=uuid_str)
    report_version_id = Column(
        String, ForeignKey("report_versions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    dimension_key = Column(String, ForeignKey("dimensions.key", ondelete="CASCADE"), nullable=False)
    playbook_json = Column(JSONB(astext_type=Text), nullable=False)
    evidence_chunk_ids = Column(JSONB, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
