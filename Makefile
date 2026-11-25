.PHONY: run test test-unit test-integration test-e2e mutation db-up lint format

run:
	npm run start

# Everything: starts PostgreSQL in Docker, then unit + integration + E2E.
test:
	npm run test:all

test-unit:
	npm run test:unit

test-integration: db-up
	npm run test:integration

test-e2e: db-up
	npm run test:e2e

# Mutation testing (Stryker). HTML report: reports/mutation/mutation.html
mutation:
	npm run test:mutation

db-up:
	docker compose up -d --wait postgres

lint:
	npm run lint

format:
	npm run format
