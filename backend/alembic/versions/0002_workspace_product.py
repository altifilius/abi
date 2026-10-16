"""Persisted workspaces, source-versioned programs and private application workflows.

The DDL below is an immutable snapshot, not current ORM metadata. Existing report
rows are preserved in legacy tables but are not queried because they lack reliable
AI-policy/model/source provenance. Re-ingest explicitly into a verified version.
"""

from alembic import op

revision = "0002_workspace_product"
down_revision = "0001_init"
branch_labels = None
depends_on = None

LEGACY_RENAME = [
    "ALTER TABLE report_chunks RENAME TO report_chunks_legacy",
    "ALTER TABLE report_chunks_legacy RENAME CONSTRAINT report_chunks_pkey TO report_chunks_legacy_pkey",
    "ALTER TABLE report_chunks_legacy RENAME CONSTRAINT uq_chunk_report_page_idx TO "
    "uq_chunk_report_page_idx_legacy",
    "ALTER TABLE dimensions RENAME TO dimensions_legacy",
    "ALTER TABLE dimensions_legacy RENAME CONSTRAINT dimensions_pkey TO dimensions_legacy_pkey",
    "ALTER TABLE dimensions_legacy RENAME CONSTRAINT dimensions_key_key TO dimensions_key_key_legacy",
    "ALTER TABLE dimension_playbooks RENAME TO dimension_playbooks_legacy",
    "ALTER TABLE dimension_playbooks_legacy RENAME CONSTRAINT dimension_playbooks_pkey TO "
    "dimension_playbooks_legacy_pkey",
    "ALTER TABLE dimension_playbooks_legacy RENAME CONSTRAINT uq_dimension_key TO uq_dimension_key_legacy",
]

CREATE_SCHEMA = [
    "CREATE TABLE auth_throttles (\n"
    "\tkey VARCHAR(64) NOT NULL, \n"
    "\twindow_start TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tattempts INTEGER NOT NULL, \n"
    "\tPRIMARY KEY (key)\n"
    ")",
    "CREATE TABLE dimensions (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tkey VARCHAR NOT NULL, \n"
    "\tname VARCHAR NOT NULL, \n"
    "\tdescription TEXT NOT NULL, \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tUNIQUE (key)\n"
    ")",
    "CREATE TABLE funding_programs (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tcode VARCHAR(80) NOT NULL, \n"
    "\tname VARCHAR(300) NOT NULL, \n"
    "\tinstitution VARCHAR(200) NOT NULL, \n"
    "\tcountry VARCHAR(2) NOT NULL, \n"
    "\tsupport_type VARCHAR(30) NOT NULL, \n"
    "\tdescription TEXT NOT NULL, \n"
    "\tofficial_url TEXT NOT NULL, \n"
    "\twatch_http JSONB NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tUNIQUE (code)\n"
    ")",
    "CREATE INDEX ix_funding_programs_country ON funding_programs (country)",
    "CREATE INDEX ix_funding_programs_support_type ON funding_programs (support_type)",
    "CREATE TABLE report_versions (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\treport_id VARCHAR(200) NOT NULL, \n"
    "\tversion INTEGER NOT NULL, \n"
    "\tsource_sha256 VARCHAR(64) NOT NULL, \n"
    "\tsource_url TEXT, \n"
    "\tai_policy VARCHAR(10) NOT NULL, \n"
    "\tembedding_model VARCHAR(200) NOT NULL, \n"
    "\tembedding_dimensions INTEGER NOT NULL, \n"
    "\tplaybook_model VARCHAR(200) NOT NULL, \n"
    "\tis_active BOOLEAN NOT NULL, \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tCONSTRAINT uq_report_policy_version UNIQUE (report_id, ai_policy, version)\n"
    ")",
    "CREATE UNIQUE INDEX uq_active_report_policy ON report_versions (report_id, ai_policy) WHERE is_active",
    "CREATE TABLE users (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\temail VARCHAR(320) NOT NULL, \n"
    "\tname VARCHAR(200) NOT NULL, \n"
    "\tpassword_hash TEXT NOT NULL, \n"
    "\tis_admin BOOLEAN NOT NULL, \n"
    "\temail_verified_at TIMESTAMP WITH TIME ZONE, \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tUNIQUE (email)\n"
    ")",
    "CREATE TABLE workspaces (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tname VARCHAR(200) NOT NULL, \n"
    "\tkind VARCHAR(20) NOT NULL, \n"
    "\tcountry VARCHAR(2) NOT NULL, \n"
    "\tprofile JSONB NOT NULL, \n"
    "\tplan VARCHAR(10) NOT NULL, \n"
    "\tai_policy VARCHAR(10) NOT NULL, \n"
    "\tincorporation JSONB NOT NULL, \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id)\n"
    ")",
    "CREATE TABLE dimension_playbooks (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\treport_version_id VARCHAR NOT NULL, \n"
    "\tdimension_key VARCHAR NOT NULL, \n"
    "\tplaybook_json JSONB NOT NULL, \n"
    "\tevidence_chunk_ids JSONB NOT NULL, \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tCONSTRAINT uq_playbook_version_dimension UNIQUE (report_version_id, dimension_key), \n"
    "\tFOREIGN KEY(report_version_id) REFERENCES report_versions (id) ON DELETE CASCADE, \n"
    "\tFOREIGN KEY(dimension_key) REFERENCES dimensions (key) ON DELETE CASCADE\n"
    ")",
    "CREATE INDEX ix_dimension_playbooks_report_version_id ON dimension_playbooks (report_version_id)",
    "CREATE TABLE email_verifications (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tuser_id VARCHAR NOT NULL, \n"
    "\ttoken_hash VARCHAR(64) NOT NULL, \n"
    "\texpires_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tFOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, \n"
    "\tUNIQUE (token_hash)\n"
    ")",
    "CREATE INDEX ix_email_verifications_user_id ON email_verifications (user_id)",
    "CREATE TABLE memberships (\n"
    "\tworkspace_id VARCHAR NOT NULL, \n"
    "\tuser_id VARCHAR NOT NULL, \n"
    "\trole VARCHAR(20) NOT NULL, \n"
    "\tPRIMARY KEY (workspace_id, user_id), \n"
    "\tFOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, \n"
    "\tFOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE\n"
    ")",
    "CREATE TABLE projects (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tworkspace_id VARCHAR NOT NULL, \n"
    "\ttitle VARCHAR(200) NOT NULL, \n"
    "\tdescription TEXT NOT NULL, \n"
    "\tprofile JSONB NOT NULL, \n"
    "\trevision INTEGER NOT NULL, \n"
    "\tconfirmed_revision INTEGER, \n"
    "\tstage VARCHAR(20) NOT NULL, \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tupdated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tFOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE\n"
    ")",
    "CREATE INDEX ix_projects_workspace_id ON projects (workspace_id)",
    "CREATE TABLE report_chunks (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\treport_version_id VARCHAR NOT NULL, \n"
    "\tpage INTEGER NOT NULL, \n"
    "\tchunk_index INTEGER NOT NULL, \n"
    "\tsection_title VARCHAR, \n"
    "\ttext TEXT NOT NULL, \n"
    "\tembedding VECTOR NOT NULL, \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tCONSTRAINT uq_chunk_version_page_idx UNIQUE (report_version_id, page, chunk_index), \n"
    "\tFOREIGN KEY(report_version_id) REFERENCES report_versions (id) ON DELETE CASCADE\n"
    ")",
    "CREATE INDEX ix_report_chunks_report_version_id ON report_chunks (report_version_id)",
    "CREATE TABLE session_tokens (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tuser_id VARCHAR NOT NULL, \n"
    "\ttoken_hash VARCHAR(64) NOT NULL, \n"
    "\tcsrf_token VARCHAR(64) NOT NULL, \n"
    "\texpires_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tFOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, \n"
    "\tUNIQUE (token_hash)\n"
    ")",
    "CREATE INDEX ix_session_tokens_user_id ON session_tokens (user_id)",
    "CREATE TABLE source_revisions (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tprogram_id VARCHAR NOT NULL, \n"
    "\tversion INTEGER NOT NULL, \n"
    "\tsource_url TEXT NOT NULL, \n"
    "\tsha256 VARCHAR(64) NOT NULL, \n"
    "\tcontent TEXT NOT NULL, \n"
    "\tcontent_encoding VARCHAR(30) NOT NULL, \n"
    "\tchecked_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tpublication_status VARCHAR(20) NOT NULL, \n"
    "\tpublished_by VARCHAR, \n"
    "\tpublished_at TIMESTAMP WITH TIME ZONE, \n"
    "\tPRIMARY KEY (id), \n"
    "\tUNIQUE (program_id, version), \n"
    "\tFOREIGN KEY(program_id) REFERENCES funding_programs (id), \n"
    "\tFOREIGN KEY(published_by) REFERENCES users (id)\n"
    ")",
    "CREATE INDEX ix_source_revisions_program_id ON source_revisions (program_id)",
    "CREATE TABLE usage_credits (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tworkspace_id VARCHAR, \n"
    "\tactor_id VARCHAR, \n"
    "\tgranted_by VARCHAR, \n"
    "\tplan VARCHAR(10) NOT NULL, \n"
    "\tmonth VARCHAR(7) NOT NULL, \n"
    "\tcategory VARCHAR(10) NOT NULL, \n"
    "\tamount INTEGER NOT NULL, \n"
    "\treason TEXT NOT NULL, \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tFOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE SET NULL, \n"
    "\tFOREIGN KEY(actor_id) REFERENCES users (id) ON DELETE SET NULL, \n"
    "\tFOREIGN KEY(granted_by) REFERENCES users (id) ON DELETE SET NULL\n"
    ")",
    "CREATE INDEX ix_usage_credits_actor_id ON usage_credits (actor_id)",
    "CREATE INDEX ix_usage_credits_month ON usage_credits (month)",
    "CREATE INDEX ix_usage_credits_workspace_id ON usage_credits (workspace_id)",
    "CREATE TABLE user_notification_preferences (\n"
    "\tuser_id VARCHAR NOT NULL, \n"
    "\temail_enabled BOOLEAN NOT NULL, \n"
    "\ttask_reminders BOOLEAN NOT NULL, \n"
    "\tdeadline_reminders BOOLEAN NOT NULL, \n"
    "\treview_notifications BOOLEAN NOT NULL, \n"
    "\tactivity_notifications BOOLEAN NOT NULL, \n"
    "\tPRIMARY KEY (user_id), \n"
    "\tFOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE\n"
    ")",
    "CREATE TABLE workspace_invitations (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tworkspace_id VARCHAR NOT NULL, \n"
    "\temail VARCHAR(320) NOT NULL, \n"
    "\trole VARCHAR(20) NOT NULL, \n"
    "\tinvited_by VARCHAR NOT NULL, \n"
    "\ttoken_hash VARCHAR(64) NOT NULL, \n"
    "\texpires_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\taccepted_at TIMESTAMP WITH TIME ZONE, \n"
    "\taccepted_by VARCHAR, \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tFOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, \n"
    "\tFOREIGN KEY(invited_by) REFERENCES users (id) ON DELETE CASCADE, \n"
    "\tUNIQUE (token_hash), \n"
    "\tFOREIGN KEY(accepted_by) REFERENCES users (id) ON DELETE SET NULL\n"
    ")",
    "CREATE INDEX ix_workspace_invitations_workspace_id ON workspace_invitations (workspace_id)",
    "CREATE TABLE audit_events (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tworkspace_id VARCHAR NOT NULL, \n"
    "\tproject_id VARCHAR, \n"
    "\tactor_id VARCHAR, \n"
    "\tevent_type VARCHAR(100) NOT NULL, \n"
    "\tdetail JSONB NOT NULL, \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tFOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, \n"
    "\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE SET NULL, \n"
    "\tFOREIGN KEY(actor_id) REFERENCES users (id) ON DELETE SET NULL\n"
    ")",
    "CREATE INDEX ix_audit_events_workspace_id ON audit_events (workspace_id)",
    "CREATE TABLE comments (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tworkspace_id VARCHAR NOT NULL, \n"
    "\tproject_id VARCHAR NOT NULL, \n"
    "\tauthor_id VARCHAR, \n"
    "\ttext TEXT NOT NULL, \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tFOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, \n"
    "\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, \n"
    "\tFOREIGN KEY(author_id) REFERENCES users (id) ON DELETE SET NULL\n"
    ")",
    "CREATE INDEX ix_comments_project_id ON comments (project_id)",
    "CREATE INDEX ix_comments_workspace_id ON comments (workspace_id)",
    "CREATE TABLE conversation_messages (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tproject_id VARCHAR NOT NULL, \n"
    "\trole VARCHAR(20) NOT NULL, \n"
    "\ttext TEXT NOT NULL, \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE\n"
    ")",
    "CREATE INDEX ix_conversation_messages_project_id ON conversation_messages (project_id)",
    "CREATE TABLE documents (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tworkspace_id VARCHAR NOT NULL, \n"
    "\tproject_id VARCHAR NOT NULL, \n"
    "\tuploader_id VARCHAR, \n"
    "\toriginal_name VARCHAR(200) NOT NULL, \n"
    "\tmime VARCHAR(150) NOT NULL, \n"
    "\tsize INTEGER NOT NULL, \n"
    "\tsha256 VARCHAR(64) NOT NULL, \n"
    "\tstorage_key VARCHAR(250) NOT NULL, \n"
    "\ttext TEXT NOT NULL, \n"
    "\tmetadata JSONB NOT NULL, \n"
    "\tstatus VARCHAR(30) NOT NULL, \n"
    "\tverified_by VARCHAR, \n"
    "\tverified_at TIMESTAMP WITH TIME ZONE, \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tFOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, \n"
    "\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, \n"
    "\tFOREIGN KEY(uploader_id) REFERENCES users (id) ON DELETE SET NULL, \n"
    "\tUNIQUE (storage_key), \n"
    "\tFOREIGN KEY(verified_by) REFERENCES users (id) ON DELETE SET NULL\n"
    ")",
    "CREATE INDEX ix_documents_project_id ON documents (project_id)",
    "CREATE INDEX ix_documents_uploader_id ON documents (uploader_id)",
    "CREATE INDEX ix_documents_workspace_id ON documents (workspace_id)",
    "CREATE TABLE funding_calls (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tprogram_id VARCHAR NOT NULL, \n"
    "\ttitle VARCHAR(300) NOT NULL, \n"
    "\tversion INTEGER NOT NULL, \n"
    "\tstatus VARCHAR(20) NOT NULL, \n"
    "\topens_at TIMESTAMP WITH TIME ZONE, \n"
    "\tdeadline TIMESTAMP WITH TIME ZONE, \n"
    "\trule_version VARCHAR(100) NOT NULL, \n"
    "\tsource_revision_id VARCHAR NOT NULL, \n"
    "\trules JSONB NOT NULL, \n"
    "\ttemplate JSONB NOT NULL, \n"
    "\tfinance JSONB NOT NULL, \n"
    "\tlanguage VARCHAR(2) NOT NULL, \n"
    "\tportal_url TEXT NOT NULL, \n"
    "\tvalidated_source_sha256 VARCHAR(64), \n"
    "\tpublished_by VARCHAR, \n"
    "\tpublished_at TIMESTAMP WITH TIME ZONE, \n"
    "\tPRIMARY KEY (id), \n"
    "\tUNIQUE (program_id, version), \n"
    "\tFOREIGN KEY(program_id) REFERENCES funding_programs (id), \n"
    "\tFOREIGN KEY(source_revision_id) REFERENCES source_revisions (id), \n"
    "\tFOREIGN KEY(published_by) REFERENCES users (id)\n"
    ")",
    "CREATE INDEX ix_funding_calls_program_id ON funding_calls (program_id)",
    "CREATE TABLE notifications (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tuser_id VARCHAR NOT NULL, \n"
    "\tworkspace_id VARCHAR NOT NULL, \n"
    "\tproject_id VARCHAR, \n"
    "\tevent_key VARCHAR(250) NOT NULL, \n"
    "\tevent_type VARCHAR(100) NOT NULL, \n"
    "\tdetail JSONB NOT NULL, \n"
    "\tread_at TIMESTAMP WITH TIME ZONE, \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tCONSTRAINT uq_notification_user_event UNIQUE (user_id, event_key), \n"
    "\tFOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, \n"
    "\tFOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, \n"
    "\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE\n"
    ")",
    "CREATE INDEX ix_notifications_user_id ON notifications (user_id)",
    "CREATE INDEX ix_notifications_workspace_id ON notifications (workspace_id)",
    "CREATE TABLE project_revisions (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tproject_id VARCHAR NOT NULL, \n"
    "\trevision INTEGER NOT NULL, \n"
    "\tactor_id VARCHAR, \n"
    "\tsnapshot JSONB NOT NULL, \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tUNIQUE (project_id, revision), \n"
    "\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, \n"
    "\tFOREIGN KEY(actor_id) REFERENCES users (id) ON DELETE SET NULL\n"
    ")",
    "CREATE INDEX ix_project_revisions_project_id ON project_revisions (project_id)",
    "CREATE TABLE tasks (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tworkspace_id VARCHAR NOT NULL, \n"
    "\tproject_id VARCHAR NOT NULL, \n"
    "\tassignee_id VARCHAR, \n"
    "\ttitle VARCHAR(300) NOT NULL, \n"
    "\tdue_at TIMESTAMP WITH TIME ZONE, \n"
    "\tstatus VARCHAR(20) NOT NULL, \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tupdated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tFOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, \n"
    "\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, \n"
    "\tFOREIGN KEY(assignee_id) REFERENCES users (id) ON DELETE SET NULL\n"
    ")",
    "CREATE INDEX ix_tasks_due_at ON tasks (due_at)",
    "CREATE INDEX ix_tasks_project_id ON tasks (project_id)",
    "CREATE INDEX ix_tasks_workspace_id ON tasks (workspace_id)",
    "CREATE TABLE usage_events (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tworkspace_id VARCHAR, \n"
    "\tproject_id VARCHAR, \n"
    "\tactor_id VARCHAR, \n"
    "\tmonth VARCHAR(7) NOT NULL, \n"
    "\tplan VARCHAR(10) NOT NULL, \n"
    "\tcategory VARCHAR(10) NOT NULL, \n"
    "\toperation VARCHAR(30) NOT NULL, \n"
    "\tstatus VARCHAR(12) NOT NULL, \n"
    "\tprofile_revision INTEGER NOT NULL, \n"
    "\tai_policy VARCHAR(10) NOT NULL, \n"
    "\tmodel VARCHAR(200) NOT NULL, \n"
    "\tresult JSONB NOT NULL, \n"
    "\terror_code VARCHAR(40), \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\texpires_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tcompleted_at TIMESTAMP WITH TIME ZONE, \n"
    "\tPRIMARY KEY (id), \n"
    "\tFOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE SET NULL, \n"
    "\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE SET NULL, \n"
    "\tFOREIGN KEY(actor_id) REFERENCES users (id) ON DELETE SET NULL\n"
    ")",
    "CREATE INDEX ix_usage_events_month ON usage_events (month)",
    "CREATE INDEX ix_usage_events_project_id ON usage_events (project_id)",
    "CREATE INDEX ix_usage_events_workspace_id ON usage_events (workspace_id)",
    "CREATE TABLE applications (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tworkspace_id VARCHAR NOT NULL, \n"
    "\tproject_id VARCHAR NOT NULL, \n"
    "\tcall_id VARCHAR NOT NULL, \n"
    "\tcall_version INTEGER NOT NULL, \n"
    "\tsource_revision_id VARCHAR NOT NULL, \n"
    "\trule_version VARCHAR(100) NOT NULL, \n"
    "\tprofile_revision INTEGER NOT NULL, \n"
    "\trevision INTEGER NOT NULL, \n"
    "\tstate VARCHAR(30) NOT NULL, \n"
    "\tdata JSONB NOT NULL, \n"
    "\ttemplate_snapshot JSONB NOT NULL, \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tFOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, \n"
    "\tFOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, \n"
    "\tFOREIGN KEY(call_id) REFERENCES funding_calls (id), \n"
    "\tFOREIGN KEY(source_revision_id) REFERENCES source_revisions (id)\n"
    ")",
    "CREATE INDEX ix_applications_call_id ON applications (call_id)",
    "CREATE INDEX ix_applications_project_id ON applications (project_id)",
    "CREATE INDEX ix_applications_workspace_id ON applications (workspace_id)",
    "CREATE TABLE evaluations (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tworkspace_id VARCHAR NOT NULL, \n"
    "\tproject_id VARCHAR NOT NULL, \n"
    "\tprofile_revision INTEGER NOT NULL, \n"
    "\tcall_id VARCHAR NOT NULL, \n"
    "\tcall_version INTEGER NOT NULL, \n"
    "\tsource_revision_id VARCHAR NOT NULL, \n"
    "\trule_version VARCHAR(100) NOT NULL, \n"
    "\tevaluated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tresult JSONB NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tFOREIGN KEY(workspace_id) REFERENCES workspaces (id), \n"
    "\tFOREIGN KEY(project_id) REFERENCES projects (id), \n"
    "\tFOREIGN KEY(call_id) REFERENCES funding_calls (id), \n"
    "\tFOREIGN KEY(source_revision_id) REFERENCES source_revisions (id)\n"
    ")",
    "CREATE INDEX ix_evaluations_call_id ON evaluations (call_id)",
    "CREATE INDEX ix_evaluations_project_id ON evaluations (project_id)",
    "CREATE INDEX ix_evaluations_workspace_id ON evaluations (workspace_id)",
    "CREATE TABLE mail_deliveries (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tdedupe_key VARCHAR(250) NOT NULL, \n"
    "\tuser_id VARCHAR NOT NULL, \n"
    "\tworkspace_id VARCHAR, \n"
    "\tnotification_id VARCHAR, \n"
    "\tkind VARCHAR(30) NOT NULL, \n"
    "\tsubject VARCHAR(250) NOT NULL, \n"
    "\tbody TEXT NOT NULL, \n"
    "\tstatus VARCHAR(20) NOT NULL, \n"
    "\tattempts INTEGER NOT NULL, \n"
    "\tnext_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tlast_error VARCHAR(60), \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tsent_at TIMESTAMP WITH TIME ZONE, \n"
    "\tPRIMARY KEY (id), \n"
    "\tUNIQUE (dedupe_key), \n"
    "\tFOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, \n"
    "\tFOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE, \n"
    "\tFOREIGN KEY(notification_id) REFERENCES notifications (id) ON DELETE CASCADE\n"
    ")",
    "CREATE INDEX ix_mail_deliveries_next_attempt_at ON mail_deliveries (next_attempt_at)",
    "CREATE INDEX ix_mail_deliveries_status ON mail_deliveries (status)",
    "CREATE INDEX ix_mail_deliveries_user_id ON mail_deliveries (user_id)",
    "CREATE TABLE notification_event_receipts (\n"
    "\tevent_id VARCHAR NOT NULL, \n"
    "\tconsumed_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (event_id), \n"
    "\tFOREIGN KEY(event_id) REFERENCES audit_events (id) ON DELETE CASCADE\n"
    ")",
    "CREATE TABLE application_approvals (\n"
    "\tid VARCHAR NOT NULL, \n"
    "\tapplication_id VARCHAR NOT NULL, \n"
    "\trevision INTEGER NOT NULL, \n"
    "\tapproved BOOLEAN NOT NULL, \n"
    "\treviewer_id VARCHAR, \n"
    "\tnotes TEXT NOT NULL, \n"
    "\tcontent_hash VARCHAR(64) NOT NULL, \n"
    "\tevaluation_id VARCHAR NOT NULL, \n"
    "\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n"
    "\tPRIMARY KEY (id), \n"
    "\tFOREIGN KEY(application_id) REFERENCES applications (id) ON DELETE CASCADE, \n"
    "\tFOREIGN KEY(reviewer_id) REFERENCES users (id) ON DELETE SET NULL, \n"
    "\tFOREIGN KEY(evaluation_id) REFERENCES evaluations (id)\n"
    ")",
    "CREATE INDEX ix_application_approvals_application_id ON application_approvals (application_id)",
]

DROP_TABLES = [
    "application_approvals",
    "notification_event_receipts",
    "mail_deliveries",
    "evaluations",
    "applications",
    "usage_events",
    "tasks",
    "project_revisions",
    "notifications",
    "funding_calls",
    "documents",
    "conversation_messages",
    "comments",
    "audit_events",
    "workspace_invitations",
    "user_notification_preferences",
    "usage_credits",
    "source_revisions",
    "session_tokens",
    "report_chunks",
    "projects",
    "memberships",
    "email_verifications",
    "dimension_playbooks",
    "workspaces",
    "users",
    "report_versions",
    "funding_programs",
    "dimensions",
    "auth_throttles",
]

RESTORE_LEGACY = [
    "ALTER TABLE report_chunks_legacy RENAME TO report_chunks",
    "ALTER TABLE report_chunks RENAME CONSTRAINT report_chunks_legacy_pkey TO report_chunks_pkey",
    "ALTER TABLE report_chunks RENAME CONSTRAINT uq_chunk_report_page_idx_legacy TO uq_chunk_report_page_idx",
    "ALTER TABLE dimensions_legacy RENAME TO dimensions",
    "ALTER TABLE dimensions RENAME CONSTRAINT dimensions_legacy_pkey TO dimensions_pkey",
    "ALTER TABLE dimensions RENAME CONSTRAINT dimensions_key_key_legacy TO dimensions_key_key",
    "ALTER TABLE dimension_playbooks_legacy RENAME TO dimension_playbooks",
    "ALTER TABLE dimension_playbooks RENAME CONSTRAINT dimension_playbooks_legacy_pkey TO "
    "dimension_playbooks_pkey",
    "ALTER TABLE dimension_playbooks RENAME CONSTRAINT uq_dimension_key_legacy TO uq_dimension_key",
]


def upgrade() -> None:
    for statement in LEGACY_RENAME:
        op.execute(statement)
    for statement in CREATE_SCHEMA:
        op.execute(statement)


def downgrade() -> None:
    for table in DROP_TABLES:
        op.drop_table(table)
    for statement in RESTORE_LEGACY:
        op.execute(statement)
