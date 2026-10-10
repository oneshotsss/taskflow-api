# [ADR-0001] Use Express.js and Layered Architecture

- Status: accepted
- Date: 2026-10-10

## Context and Problem Statement

We need to bootstrap the Taskflow API. We must decide on the web framework and the overall structure of the source code to ensure maintainability and separation of concerns.

## Decision Drivers

- Rapid development speed.
- Industry standard tools that are easy to review.
- Separation between HTTP transport and business logic.

## Considered Options

- Express.js with a classic Controller-Service-Model architecture.
- Fastify with Domain-Driven Design.
- Plain Node.js `http` module.

## Decision Outcome

Chosen option: "Express.js with Layered Architecture", because Express is the de facto standard for Node.js APIs and is very simple to set up. A Layered Architecture (Routes, Controllers, Services, Models) directly satisfies the requirement for clear module boundaries while remaining lightweight enough for an initial version.

### Positive Consequences

- Clear separation of concerns (HTTP handling vs business rules).
- Easy to test components in isolation.
- Fast onboarding.

### Negative Consequences

- Express.js might be slower than alternatives like Fastify, but performance is not the primary driver here.
