.PHONY: build up down logs clean restart rebuild

# Build all services
build:
	docker compose build

# Build without cache
build-clean:
	docker compose build --no-cache

# Start services
up:
	docker compose up -d --remove-orphans

# Stop services
down:
	docker compose down

# View logs
logs:
	docker compose logs -f

# Clean up everything (including volumes)
clean:
	docker compose down -v
	docker system prune -f

# Restart services
restart:
	docker compose restart

# Rebuild and restart
rebuild:
	docker compose down
	docker compose build --no-cache
	docker compose up -d --remove-orphans

# Backend logs only
logs-backend:
	docker compose logs -f backend

# Frontend logs only
logs-frontend:
	docker compose logs -f frontend

# Database logs only
logs-db:
	docker compose logs -f db