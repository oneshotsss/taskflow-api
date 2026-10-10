# Taskflow API Specification

## 1. Objective and Motivation

**What**: A simple RESTful API for task and project management.
**Why**: To provide an educational foundation for learning Node.js engineering practices, including code structure, testing, and Git workflows.

## 2. Component Breakdown & Interaction

The application follows a standard Layered Architecture:

- **Routes (`src/routes`)**: Defines REST endpoints and binds them to controllers.
- **Controllers (`src/controllers`)**: Handles HTTP requests/responses, payload extraction.
- **Services (`src/services`)**: Contains core business logic.
- **Models/Data (`src/models`)**: In-memory data store for this iteration.

Flow: Request -> Route -> Controller -> Service -> Model -> Response.

## 3. Data Flow & Structure

**Entities (ER Structure):**

- **User**: `id`, `name`, `email`
- **Project**: `id`, `name`, `userId`
- **Task**: `id`, `title`, `status` (`TODO`, `IN_PROGRESS`, `DONE`), `projectId`

**Key Scenario Data Updates:**

- _Creating a Task_: Client POSTs to `/tasks`. Route -> Controller -> Service validates `projectId` exists -> Model pushes task -> Returns `201 Created`.

## 4. Acceptance Criteria

1. The API runs without errors on Node.js using Express.
2. Contains at least one functional endpoint (e.g., `GET /tasks`).
3. Passes ESLint and Prettier format validations automatically via Husky hooks on commit.
4. Includes basic Jest smoke tests verifying the root endpoint or key services.
