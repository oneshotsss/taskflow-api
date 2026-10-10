# AI Prompts Trace & Audit

## Prompts Trace
1. **System Prompt**: Initial instructions from the user regarding the creation of a Node.js project (Taskflow API) with specific requirements (linter, formatting, testing, git hooks, standards directory, spec.md, DEFENSE.md).
2. **Action 1**: Initialized the project, installed dependencies, configured ESLint + Prettier.
3. **Action 2**: Created standards: Definition of Done, Spec format, Checklist, ADR template.
4. **Action 3**: Wrote implementation (Express, Routing, Controllers, Services).
5. **Action 4**: Set up Husky hooks and Jest testing.

## AI Output Audit: Top 3 "Cut Corners" by AI
1. **Simplified error handling**: The AI controller returns plain HTTP 400 without a centralized error handler.
   - *Feedback/Fix*: A future spec will require `ErrorMiddleware` and consistent JSON error formatting.
2. **Bypassing hooks for initial commit**: The AI bypassed hooks initially (`--no-verify`) due to staging `node_modules` before proper gitignore setup.
   - *Feedback/Fix*: Standard requires initializing `.gitignore` *before* adding files to avoid untracking overhead.
3. **In-memory data model abstraction**: The `tasksService.js` directly mutates an array instead of using a proper DAO/Repository interface.
   - *Feedback/Fix*: The spec will need to mandate a Repository layer (even if in-memory) to adhere strictly to DDD boundaries.
