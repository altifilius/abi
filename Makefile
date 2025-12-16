.PHONY: dev dev-backend dev-frontend build

dev: dev-backend

dev-backend:
	@$(MAKE) -C backend dev

dev-frontend:
	@npm run dev

build:
	@npm run build
