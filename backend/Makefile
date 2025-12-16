ENV_FILE ?= $(CURDIR)/.env
REPORT_ID ?= default_report
PDF ?= sample.pdf

ALEMBIC := alembic -c alembic.ini
UVICORN := $(shell [ -x "$(CURDIR)/../.venv/bin/uvicorn" ] && echo "$(CURDIR)/../.venv/bin/uvicorn" || echo "uvicorn")

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
	HOST=$${HOST:-0.0.0.0}; \
	PORT=$${PORT:-8000}; \
	echo "Host=$$HOST Port=$$PORT"; \
	PYTHONPATH=.. $(UVICORN) backend.main:app --reload --host $$HOST --port $$PORT
