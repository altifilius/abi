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
	@set -a; [ ! -f "$(ENV_FILE)" ] || . "$(ENV_FILE)"; set +a; \
	PYTHONPATH=.. python -m backend.ingest_report "$(PDF)" --report-id "$(REPORT_ID)"

dev:
	@echo "Starting FastAPI dev server..."
	@set -a; [ ! -f "$(ENV_FILE)" ] || . "$(ENV_FILE)"; set +a; \
	HOST=$${HOST:-127.0.0.1}; \
	PORT=$${PORT:-8000}; \
	case "$${RELOAD:-true}" in \
		1|true|yes|on) RELOAD_ARG=--reload ;; \
		0|false|no|off) RELOAD_ARG= ;; \
		*) echo "Invalid RELOAD value: $$RELOAD" >&2; exit 2 ;; \
	esac; \
	echo "Host=$$HOST Port=$$PORT Reload=$${RELOAD:-true}"; \
	PYTHONPATH=.. $(UVICORN) backend.main:app $$RELOAD_ARG --host "$$HOST" --port "$$PORT"
