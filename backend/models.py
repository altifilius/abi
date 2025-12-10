from datetime import datetime
import uuid
from typing import Optional

from sqlalchemy import Column, DateTime, Integer, String, Text, UniqueConstraint, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from pgvector.sqlalchemy import Vector

from .db import Base


def uuid_str() -> str:
    return str(uuid.uuid4())


class ReportChunk(Base):
    __tablename__ = "report_chunks"
    __table_args__ = (
        UniqueConstraint("report_id", "page", "chunk_index", name="uq_chunk_report_page_idx"),
    )

    id = Column(String, primary_key=True, default=uuid_str)
    report_id = Column(String, nullable=False)
    page = Column(Integer, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    section_title = Column(String, nullable=True)
    text = Column(Text, nullable=False)
    embedding = Column(Vector, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Dimension(Base):
    __tablename__ = "dimensions"

    id = Column(String, primary_key=True, default=uuid_str)
    key = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class DimensionPlaybook(Base):
    __tablename__ = "dimension_playbooks"
    __table_args__ = (UniqueConstraint("dimension_key", name="uq_dimension_key"),)

    id = Column(String, primary_key=True, default=uuid_str)
    dimension_key = Column(String, ForeignKey("dimensions.key", ondelete="CASCADE"), nullable=False)
    playbook_json = Column(JSONB(astext_type=Text), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
