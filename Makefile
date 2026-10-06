.PHONY: dev dev-backend dev-frontend build

dev: dev-backend

dev-backend:
	@$(MAKE) -C backend dev

dev-frontend:
	@bun run dev

build:
	@bun run build
