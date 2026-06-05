SHELL := /bin/bash

API_PORT ?= 3310
ADMIN_PORT ?= 5317
EXPO_PORT ?= 8088
DRIZZLE_STUDIO_PORT ?= 4983
DATABASE_URL ?= postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_dev
JWT_SECRET ?= dev_jwt_secret
JWT_REFRESH_SECRET ?= dev_refresh_secret

.PHONY: help \
	backend-up backend-stop backend-restart backend-logs backend-status \
	api-up api-stop api-restart api-logs api-status \
	app-up app-stop app-restart app-logs app-status \
	db-up db-stop db-restart db-logs db-status \
	edge-up edge-stop edge-restart edge-logs edge-status \
	expo-up expo-stop expo-restart \
	bacedn-up bacedn-restart \
	drizzle-studio

help:
	@echo "Targets:"
	@echo "  db-up             Start Postgres and Redis containers"
	@echo "  db-stop           Stop Postgres and Redis containers"
	@echo "  db-restart        Restart Postgres and Redis containers"
	@echo "  db-logs           Show last 200 Postgres/Redis log lines, then follow"
	@echo "  db-status         Show Postgres and Redis container status"
	@echo "  backend-up        Start the backend API on port $(API_PORT)"
	@echo "  backend-stop      Stop the backend API on port $(API_PORT)"
	@echo "  backend-restart   Restart the backend API"
	@echo "  backend-logs      Show how to run backend logs live"
	@echo "  backend-status    Show backend API process status"
	@echo "  app-up            Start the admin Vite app on port $(ADMIN_PORT)"
	@echo "  app-stop          Stop the admin Vite app on port $(ADMIN_PORT)"
	@echo "  app-restart       Restart the admin Vite app"
	@echo "  app-logs          Show how to run admin app logs live"
	@echo "  app-status        Show admin app process status"
	@echo "  edge-up           Start the Nginx edge on port 58080"
	@echo "  edge-stop         Stop the Nginx edge"
	@echo "  edge-restart      Restart the Nginx edge"
	@echo "  edge-logs         Show last 200 Nginx edge log lines, then follow"
	@echo "  edge-status       Show Nginx edge container status"
	@echo "  expo-up           Start Expo web on port $(EXPO_PORT)"
	@echo "  expo-stop         Stop any process listening on port $(EXPO_PORT)"
	@echo "  expo-restart      Stop and start Expo web"
	@echo "  drizzle-studio    Browse the dev database with Drizzle Studio on port $(DRIZZLE_STUDIO_PORT)"

db-up:
	docker compose up -d postgres redis

db-stop:
	docker compose stop postgres redis

db-restart: db-stop db-up

db-logs:
	docker compose logs --tail=200 -f postgres redis

db-status:
	docker compose ps postgres redis

backend-up:
	@if lsof -ti tcp:$(API_PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "Backend API already listening on port $(API_PORT)"; \
	else \
		echo "Starting backend API on port $(API_PORT); logs stream to this terminal"; \
		DATABASE_URL="$(DATABASE_URL)" \
		JWT_SECRET="$(JWT_SECRET)" \
		JWT_REFRESH_SECRET="$(JWT_REFRESH_SECRET)" \
		PORT="$(API_PORT)" \
		npm --workspace @dynamic/api run dev; \
	fi

backend-stop:
	@pids="$$(lsof -ti tcp:$(API_PORT) -sTCP:LISTEN || true)"; \
	pids="$$(echo $$pids | tr ' ' '\n' | sed '/^$$/d' | sort -u)"; \
	if [[ -n "$$pids" ]]; then \
		echo "Stopping backend process(es) on port $(API_PORT): $$pids"; \
		kill $$pids; \
	else \
		echo "No backend process listening on port $(API_PORT)"; \
	fi

backend-restart: backend-stop
	$(MAKE) backend-up

backend-logs:
	@echo "Backend API is host-run in dev; no host log files are written."
	@echo "Run 'make backend-up' to stream backend stdout/stderr live in the terminal."

backend-status:
	@pids="$$(lsof -ti tcp:$(API_PORT) -sTCP:LISTEN || true)"; \
	if [[ -n "$$pids" ]]; then \
		echo "Backend API listening on port $(API_PORT): $$pids"; \
	else \
		echo "Backend API is not listening on port $(API_PORT)"; \
	fi

api-up: backend-up

api-stop: backend-stop

api-restart: backend-restart

api-logs: backend-logs

api-status: backend-status

app-up:
	@if lsof -ti tcp:$(ADMIN_PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "Admin app already listening on port $(ADMIN_PORT)"; \
	else \
		echo "Starting admin app on port $(ADMIN_PORT); logs stream to this terminal"; \
		npm --workspace @dynamic/admin run dev; \
	fi

app-stop:
	@pids="$$(lsof -ti tcp:$(ADMIN_PORT) -sTCP:LISTEN || true)"; \
	pids="$$(echo $$pids | tr ' ' '\n' | sed '/^$$/d' | sort -u)"; \
	if [[ -n "$$pids" ]]; then \
		echo "Stopping admin app process(es) on port $(ADMIN_PORT): $$pids"; \
		kill $$pids; \
	else \
		echo "No admin app process listening on port $(ADMIN_PORT)"; \
	fi

app-restart: app-stop
	$(MAKE) app-up

app-logs:
	@echo "Admin app is host-run in dev; no host log files are written."
	@echo "Run 'make app-up' to stream admin stdout/stderr live in the terminal."

app-status:
	@pids="$$(lsof -ti tcp:$(ADMIN_PORT) -sTCP:LISTEN || true)"; \
	if [[ -n "$$pids" ]]; then \
		echo "Admin app listening on port $(ADMIN_PORT): $$pids"; \
	else \
		echo "Admin app is not listening on port $(ADMIN_PORT)"; \
	fi

edge-up:
	docker compose --profile edge up -d nginx

edge-stop:
	docker compose --profile edge stop nginx

edge-restart: edge-stop edge-up

edge-logs:
	docker compose --profile edge logs --tail=200 -f nginx

edge-status:
	docker compose --profile edge ps nginx

bacedn-up: backend-up

bacedn-restart: backend-restart

expo-up:
	npm --workspace expo-prototype run web

expo-stop:
	@pids="$$(lsof -ti tcp:$(EXPO_PORT) -sTCP:LISTEN || true)"; \
	if [[ -n "$$pids" ]]; then \
		echo "Stopping Expo process(es) on port $(EXPO_PORT): $$pids"; \
		kill $$pids; \
	else \
		echo "No Expo process listening on port $(EXPO_PORT)"; \
	fi

expo-restart: expo-stop
	$(MAKE) expo-up

drizzle-studio:
	cd apps/api && DATABASE_URL="$(DATABASE_URL)" npx drizzle-kit studio --config=drizzle.config.ts --port $(DRIZZLE_STUDIO_PORT)
