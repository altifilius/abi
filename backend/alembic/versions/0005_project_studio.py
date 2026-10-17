"""Independent rich project reports, conversations and funding selections.

Additive only: existing descriptions, profiles, applications and review history are
untouched. Core reports are initialized transactionally on explicit editor request.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005_project_studio"
down_revision = "0004_task_context"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_reports",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            sa.String(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("template_key", sa.String(200), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("language", sa.String(2), nullable=False),
        sa.Column("call_id", sa.String(), sa.ForeignKey("funding_calls.id", ondelete="RESTRICT")),
        sa.Column("sections", postgresql.JSONB(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("scope_revision", sa.Integer(), nullable=False),
        sa.Column("selected", sa.Boolean(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("source_url", sa.Text()),
        sa.Column("source_metadata", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("project_id", "template_key"),
    )
    for column in ("workspace_id", "project_id", "call_id"):
        op.create_index(f"ix_project_reports_{column}", "project_reports", [column])
    op.create_table(
        "project_report_messages",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            sa.String(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "report_id",
            sa.String(),
            sa.ForeignKey("project_reports.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("section_id", sa.String(200)),
        sa.Column("draft", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    for column in ("workspace_id", "project_id", "report_id"):
        op.create_index(f"ix_project_report_messages_{column}", "project_report_messages", [column])
    op.create_table(
        "project_funding_selections",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            sa.String(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "call_id",
            sa.String(),
            sa.ForeignKey("funding_calls.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("project_id", "call_id"),
    )
    for column in ("workspace_id", "project_id", "call_id"):
        op.create_index(
            f"ix_project_funding_selections_{column}", "project_funding_selections", [column]
        )


def downgrade() -> None:
    op.drop_table("project_funding_selections")
    op.drop_table("project_report_messages")
    op.drop_table("project_reports")
