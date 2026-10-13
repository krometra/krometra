.PHONY: up down build rebuild rebuild-front rebuild-back front logs shell ps db-shell \
	redis-shell backend-shell frontend-shell migrate migrate-create clean

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

# Пересобрать образы и поднять новые контейнеры. Фронт собирается внутри
# образа web (npm run build там же проверяет типы), бэкенд — образ app.
rebuild:
	docker compose build
	docker compose up -d
	docker compose ps

rebuild-front:
	docker compose build web
	docker compose up -d web

rebuild-back:
	docker compose build app
	docker compose up -d app

# Локальная сборка фронта в web/dist: типы + vite, без Docker.
front:
	cd web && npm run build

logs:
	docker compose logs -f

shell:
	docker compose exec app sh

ps:
	docker compose ps

db-shell:
	docker compose exec postgres psql -U cadstudio -d cadstudio

redis-shell:
	docker compose exec redis redis-cli

backend-shell:
	cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

frontend-shell:
	cd web && npm install && npm run dev

migrate:
	docker compose exec app alembic upgrade head

migrate-create:
	docker compose exec app alembic revision --autogenerate -m "$(name)"

clean:
	docker compose down -v
	rm -rf backend/__pycache__ backend/app/__pycache__
