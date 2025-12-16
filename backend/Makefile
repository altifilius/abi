ENV_FILE ?= $(CURDIR)/.env
REPORT_ID ?= default_report
PDF ?= sample.pdf

ALEMBIC := alembic -c alembic.ini

.PHONY: migrate ingest dev

migrate:
	@echo "Running migrations..."
	$(ALEMBIC) upgrade head

ingest:
	@echo "Ingesting $(PDF) with report_id=$(REPORT_ID)..."
	@set -a; [ -f $(ENV_FILE) ] && . $(ENV_FILE); set +a; \
	PYTHONPATH=.. python -m backend.ingest_report $(PDF) --report-id $(REPORT_ID)

dev:
	@echo "Starting FastAPI dev server..."
	@set -a; [ -f $(ENV_FILE) ] && . $(ENV_FILE); set +a; \
	PYTHONPATH=.. uvicorn backend.main:app --reload
