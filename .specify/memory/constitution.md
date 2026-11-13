<!--
Sync Impact Report (temporary; remove before commit)
- Version change: (template, unversioned) → 1.0.0
- Modified principles: none renamed; all five placeholders replaced with concrete principles
- Added sections: Technology Stack & Constraints, Development Workflow & Quality Gates
- Removed sections: none
- Deferred TODOs: none (challenge statement not yet provided; domain-specific rules
  belong in the spec, not here)
-->
# Cocos Challenge Backend Constitution

## Core Principles

### I. Test-First (NON-NEGOTIABLE)
Tests MUST be written before the implementation they cover. The cycle is Red → Green →
Refactor: a failing test MUST exist before any production code is written for that behavior.
Business logic MUST have unit tests; every HTTP endpoint MUST have at least one e2e test
covering its success path and its main error paths.
Rationale: tests written after the fact validate the code, not the requirement.

### II. Modular Architecture (NestJS)
The application MUST be organized in NestJS modules, one per domain concept. Controllers
MUST only handle transport concerns (parsing, validation, status codes). Business rules MUST
live in services/providers, and data access MUST go through TypeORM repositories injected
via dependency injection. Controllers MUST NOT access repositories or the database directly.
Rationale: separating layers keeps business logic unit-testable without HTTP or a database.

### III. Strict Typing & Validation at the Boundary
TypeScript MUST run in `strict` mode and `any` is prohibited unless justified in a comment.
All external input (body, query, params) MUST be validated through DTOs with
`class-validator` and a global `ValidationPipe` with whitelisting enabled. Responses MUST be
shaped by explicit DTOs, never by returning raw entities.
Rationale: invalid input is rejected at the edge, so inner layers can trust their types.

### IV. Data Integrity (PostgreSQL + TypeORM)
Schema changes MUST be made through versioned TypeORM migrations; `synchronize: true` MUST
NOT be used outside throwaway local experiments. Operations that modify several rows or
tables MUST run inside a transaction. Monetary and quantity values MUST NOT use
floating-point types; use `numeric`/decimal with explicit precision.
Rationale: financial-style data requires exact arithmetic and reproducible schema history.

### V. Simplicity & Observability
Start with the simplest design that satisfies the spec (YAGNI); every added abstraction or
dependency MUST be justified by a current requirement. Errors MUST be handled through
NestJS exception filters and return consistent, documented error responses. Logging MUST use
the NestJS `Logger`, and logs MUST NOT contain secrets or personal data.
Rationale: a small, debuggable codebase is easier to review and to defend.

## Technology Stack & Constraints

- Runtime and language: Node.js with TypeScript (strict).
- Framework: NestJS.
- Database: PostgreSQL accessed exclusively via TypeORM.
- Validation: `class-validator` and `class-transformer`.
- Testing: Jest for unit tests; Jest with Supertest for e2e tests.
- Configuration MUST come from environment variables via `@nestjs/config`; secrets MUST NOT
  be committed. A `.env.example` MUST list every required variable.
- Adding a new runtime dependency MUST be justified in the plan that introduces it.

## Development Workflow & Quality Gates

- Work follows the Spec Kit flow: constitution → specify → (clarify) → plan → tasks →
  (analyze) → implement.
- Each feature MUST live on its own branch and be merged only when lint, type-check, unit
  tests and e2e tests all pass.
- Commits MUST be small and focused, and use Conventional Commits (`feat:`, `fix:`,
  `test:`, `docs:`, `refactor:`).
- The plan MUST include a Constitution Check; any violation MUST be recorded in its
  complexity-tracking section with a justification.
- The README MUST document how to install, configure, migrate, run and test the project.

## Governance

This constitution supersedes other practices in this repository. Amendments MUST be made
through a change to this file that states the reason and is recorded in the commit message;
principle removals or redefinitions require a MAJOR version bump, new or materially
expanded principles a MINOR bump, and clarifications a PATCH bump. Every plan and review
MUST verify compliance with these principles, and unjustified complexity MUST be rejected.

**Version**: 1.0.0 | **Ratified**: 2026-11-13 | **Last Amended**: 2026-11-13
