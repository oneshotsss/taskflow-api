# Taskflow API Specification

## 1. Objective and Motivation

**What**: A RESTful API for managing tasks within projects, built on Node.js + Express.
**Why**: Educational project for learning Node.js backend engineering practices — layered architecture, testing, linting, git hooks, and structured development workflow.

## 2. Component Breakdown & Interaction

The application uses a Layered Architecture with strict boundaries:

- **Routes (`src/routes/`)**: Maps HTTP verbs + paths to controller functions. No business logic.
- **Controllers (`src/controllers/`)**: Extracts data from `req`, calls service, forms `res`. No direct data access.
- **Services (`src/services/`)**: Business rules and validation. The only layer that touches the data store.

Why no `src/models/` directory: the data store is a plain in-memory array inside each service. A separate model layer would be over-engineering for an array; if a real DB is added, a `models/` or `repositories/` layer will be introduced (see ADR-0002 for dependency rationale).

```
Client → Route → Controller → Service (data store) → Response
```

## 3. Data Flow & Structure

### Entities & Relationships

```
User 1──* Project 1──* Task
```

| Entity  | Fields                                              | Belongs to |
| ------- | --------------------------------------------------- | ---------- |
| User    | `id`, `name`, `email`                               | —          |
| Project | `id`, `name`, `userId` (FK → User)                  | User       |
| Task    | `id`, `title`, `status`, `projectId` (FK → Project) | Project    |

- A **User** owns zero or more **Projects** (1:N).
- A **Project** contains zero or more **Tasks** (1:N).
- `Task.status` ∈ {`TODO`, `IN_PROGRESS`, `DONE`}.
- `projectId` in Task is optional (`null` = unassigned task).

### Key Scenario: Creating a Task

1. Client sends `POST /tasks` with `{ title, projectId? }`.
2. Route delegates to `tasksController.createTask`.
3. Controller extracts `title` and `projectId` from `req.body`.
4. Controller calls `tasksService.addTask({ title, projectId })`.
5. Service assigns `id`, sets `status = "TODO"`, stores task in array.
6. Returns `201 Created` with the created task object.

Note: `projectId` is **not** validated against an existing projects list in the current iteration. This is a known simplification (see DEFENSE.md, divergence #1).

### Key Scenario: Listing Tasks

1. Client sends `GET /tasks`.
2. Route → Controller → Service returns the full in-memory tasks array.
3. Returns `200 OK` with JSON array.

## 4. Acceptance Criteria

1. `npm run start` launches the server on port 3000 without errors.
2. `GET /health` returns `{ "status": "OK" }` with HTTP 200.
3. `GET /version` returns `{ "version": "<git-sha>" }` with HTTP 200.
4. `GET /tasks` returns a JSON array of tasks (empty initially).
5. `POST /tasks` with `{ "title": "X" }` creates a task and returns HTTP 201 with `id`, `title`, `status: "TODO"`.
6. `POST /tasks` without `title` returns HTTP 400 with error message.
7. `npm run lint` exits with code 0 (no ESLint errors).
8. `npm run test` — all Jest tests pass (≥ 4 tests covering health, version, GET/POST tasks).
9. `git commit` triggers `lint-staged` (ESLint + Prettier on `*.js`, `*.md`, `*.json`).
10. `git push` triggers `npm run test`.
