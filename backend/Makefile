ROOT := $(abspath $(CURDIR)/..)
PYTHON := $(ROOT)/.venv/bin/python
REPORT_ID ?= default_report
PDF ?=
AI_POLICY ?= local

.PHONY: migrate ingest dev reminders watch-sources

migrate:
	@PYTHONPATH=$(ROOT) $(PYTHON) -m alembic -c alembic.ini upgrade head

ingest:
	@test -n "$(PDF)" || (echo 'Provide PDF=/absolute/path/report.pdf'; exit 2)
	@PYTHONPATH=$(ROOT) $(PYTHON) -m backend.ingest_report "$(PDF)" --report-id "$(REPORT_ID)" --ai-policy "$(AI_POLICY)"

dev:
	@PYTHONPATH=$(ROOT) $(PYTHON) -m backend.start_local

reminders:
	@PYTHONPATH=$(ROOT) $(PYTHON) -m backend.reminders --interval 60

watch-sources:
	@PYTHONPATH=$(ROOT) $(PYTHON) -m backend.funding watch-once
