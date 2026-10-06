PYTHON := $(shell [ -x "$(CURDIR)/.venv/bin/python" ] && echo "$(CURDIR)/.venv/bin/python" || echo "python")

.PHONY: dev dev-backend dev-frontend build check lint test

dev: dev-backend

dev-backend:
	@$(MAKE) -C backend dev

dev-frontend:
	@bun run dev

build:
	@bun run build

lint:
	@bun run lint
	@uvx ruff check backend

test:
	@bun test
	@OPENAI_API_KEY=test-key $(PYTHON) -m unittest discover -s backend/tests -v
check:
	@bun run check
	@uvx ruff check backend
	@OPENAI_API_KEY=test-key $(PYTHON) -m unittest discover -s backend/tests -v
