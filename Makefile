SHELL := /bin/bash

API_PORT ?= 3310
ADMIN_PORT ?= 5317
EXPO_PORT ?= 8088
EDGE_PORT ?= 58080
DRIZZLE_STUDIO_PORT ?= 4983
DATABASE_URL ?= postgresql://dynamic:dynamic_dev_password@localhost:55432/dynamic_dev
JWT_SECRET ?= dev_jwt_secret
JWT_REFRESH_SECRET ?= dev_refresh_secret

.PHONY: help \
	dev-up dev-prepare dev-stop dev-restart dev-status dev-logs hmr-up hmr-logs \
	backend-up backend-stop backend-restart backend-logs backend-status \
	api-up api-stop api-restart api-logs api-status \
	app-up app-stop app-restart app-logs app-status \
	db-up db-stop db-restart db-logs db-status db-migrate db-seed db-smoke \
	edge-up edge-start edge-stop edge-restart edge-logs edge-status \
	expo-up expo-stop expo-restart \
	bacedn-up bacedn-restart \
	drizzle-studio

help:
	@echo "Targets:"
	@echo "  dev-up            Start DB, migrate, seed, edge, then backend/admin/Expo HMR with live logs"
	@echo "  dev-prepare       Start DB, run migrations, seed dev data, and start edge"
	@echo "  dev-stop          Stop backend, admin, Expo, edge, Postgres, and Redis"
	@echo "  dev-restart       Stop and start the full dev stack"
	@echo "  dev-status        Show DB, backend, admin, Expo, and edge status"
	@echo "  dev-logs          Tail DB and edge container logs live"
	@echo "  hmr-up            Start backend API, admin Vite, and Expo web HMR in foreground"
	@echo "  hmr-logs          Explain host-run HMR log streaming"
	@echo "  db-up             Start Postgres and Redis containers"
	@echo "  db-stop           Stop Postgres and Redis containers"
	@echo "  db-restart        Restart Postgres and Redis containers"
	@echo "  db-logs           Show last 200 Postgres/Redis log lines, then follow"
	@echo "  db-status         Show Postgres and Redis container status"
	@echo "  db-migrate        Run API Drizzle migrations against $(DATABASE_URL)"
	@echo "  db-seed           Upsert development users, assignments, and seed task"
	@echo "  db-smoke          Seed and smoke-test dev login/sync against the API"
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
	@echo "  edge-up           Start the Nginx edge on port $(EDGE_PORT)"
	@echo "  edge-start        Alias for edge-up"
	@echo "  edge-stop         Stop the Nginx edge"
	@echo "  edge-restart      Restart the Nginx edge"
	@echo "  edge-logs         Show last 200 Nginx edge log lines, then follow"
	@echo "  edge-status       Show Nginx edge container status"
	@echo "  expo-up           Start Expo web on port $(EXPO_PORT)"
	@echo "  expo-stop         Stop any process listening on port $(EXPO_PORT)"
	@echo "  expo-restart      Stop and start Expo web"
	@echo "  drizzle-studio    Browse the dev database with Drizzle Studio on port $(DRIZZLE_STUDIO_PORT)"

dev-up: dev-prepare hmr-up

dev-prepare: db-up db-migrate db-seed edge-up

dev-stop: backend-stop app-stop expo-stop edge-stop db-stop

dev-restart: dev-stop dev-up

dev-status: db-status backend-status app-status edge-status
	@pids="$$(lsof -ti tcp:$(EXPO_PORT) -sTCP:LISTEN || true)"; \
	if [[ -n "$$pids" ]]; then \
		echo "Expo web listening on port $(EXPO_PORT): $$pids"; \
	else \
		echo "Expo web is not listening on port $(EXPO_PORT)"; \
	fi

dev-logs:
	@echo "Tailing DB and edge container logs. Host-run HMR logs stream from make hmr-up/backend-up/app-up/expo-up."
	$(MAKE) -j2 db-logs edge-logs

hmr-up:
	@echo "Starting backend API, admin Vite, and Expo web HMR in foreground. Press Ctrl+C to stop host-run HMR processes."
	$(MAKE) -j3 backend-up app-up expo-up

hmr-logs:
	@echo "Backend/admin/Expo are host-run in dev mode; live logs stream in the terminal running:"
	@echo "  make hmr-up"
	@echo "or separately:"
	@echo "  make backend-up"
	@echo "  make app-up"
	@echo "  make expo-up"

db-up:
	docker compose up -d postgres redis

db-stop:
	docker compose stop postgres redis

db-restart: db-stop db-up

db-logs:
	docker compose logs --tail=200 -f postgres redis

db-status:
	docker compose ps postgres redis

db-migrate:
	DATABASE_URL="$(DATABASE_URL)" npm --workspace @dynamic/api run db:migrate

db-seed:
	DATABASE_URL="$(DATABASE_URL)" JWT_SECRET="$(JWT_SECRET)" JWT_REFRESH_SECRET="$(JWT_REFRESH_SECRET)" npx tsx apps/api/src/dev/dev-seed.ts

db-smoke:
	DATABASE_URL="$(DATABASE_URL)" JWT_SECRET="$(JWT_SECRET)" JWT_REFRESH_SECRET="$(JWT_REFRESH_SECRET)" npm --workspace @dynamic/api run smoke:dev

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
	DYNAMIC_NGINX_PORT="$(EDGE_PORT)" docker compose --profile edge up -d nginx

edge-start: edge-up

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
