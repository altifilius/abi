"""Nullable project-scoped task references and application responsibility."""

import sqlalchemy as sa
from alembic import op

revision = "0004_task_context"
down_revision = "0003_menu_security"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("application_id", sa.String(), nullable=True))
    op.add_column("tasks", sa.Column("document_id", sa.String(), nullable=True))
    op.add_column("applications", sa.Column("responsible_id", sa.String(), nullable=True))
    op.create_foreign_key(
        "fk_tasks_application_id",
        "tasks",
        "applications",
        ["application_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_tasks_document_id",
        "tasks",
        "documents",
        ["document_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_applications_responsible_id",
        "applications",
        "users",
        ["responsible_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_applications_responsible_id", "applications", type_="foreignkey")
    op.drop_constraint("fk_tasks_document_id", "tasks", type_="foreignkey")
    op.drop_constraint("fk_tasks_application_id", "tasks", type_="foreignkey")
    op.drop_column("applications", "responsible_id")
    op.drop_column("tasks", "document_id")
    op.drop_column("tasks", "application_id")
