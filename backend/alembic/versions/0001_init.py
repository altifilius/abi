"""Initial schema with pgvector and core tables."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "report_chunks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("report_id", sa.String(), nullable=False),
        sa.Column("page", sa.Integer(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("section_title", sa.String(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("report_id", "page", "chunk_index", name="uq_chunk_report_page_idx"),
    )

    op.create_table(
        "dimensions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("key", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "dimension_playbooks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("dimension_key", sa.String(), sa.ForeignKey("dimensions.key", ondelete="CASCADE"), nullable=False),
        sa.Column("playbook_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dimension_key", name="uq_dimension_key"),
    )


def downgrade() -> None:
    op.drop_table("dimension_playbooks")
    op.drop_table("dimensions")
    op.drop_table("report_chunks")
