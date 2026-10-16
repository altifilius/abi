PYTHON := $(CURDIR)/.venv/bin/python

.PHONY: dev dev-backend dev-frontend build check lint test install migrate seed reminders watch-sources

install:
	@bun install --frozen-lockfile
	@uv venv --python 3.12 .venv
	@uv pip install --python .venv/bin/python -r backend/requirements.lock

dev: dev-backend

dev-backend:
	@$(MAKE) -C backend dev

dev-frontend:
	@bun run dev

build:
	@bun run build

migrate:
	@$(MAKE) -C backend migrate

seed:
	@$(PYTHON) -m backend.funding seed

reminders:
	@$(PYTHON) -m backend.reminders --interval 60

watch-sources:
	@$(PYTHON) -m backend.funding watch-once

lint:
	@bun run lint
	@uvx ruff check backend

test:
	@bun test
	@$(PYTHON) -m unittest discover -s backend/tests -v

check:
	@bun run check
	@uvx ruff check backend
	@$(PYTHON) -m unittest discover -s backend/tests -v
