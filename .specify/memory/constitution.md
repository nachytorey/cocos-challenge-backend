<!--
Sync Impact Report (temporary; remove before commit)
- Version change: 1.3.0 → 1.8.0 (1.8.0: V rewritten with testable simplicity checks and
  growth triggers. 1.7.0: added XIII Design Patterns. 1.6.0: VII adds global token-validation middleware; added
  XII Rate Limiting. 1.4.0: added IX Idempotent Payments, X Saga & Outbox,
  XI Scale & Concurrency, Architecture Recommendation gate; 1.5.0: III now requires
  validation on every endpoint plus a global deny-by-default guard)
- Previous: 1.2.0 → 1.3.0
- Modified principles: VI (Swagger now mandatory for every endpoint); VII (SameSite=Strict
  default, HTTPS/HSTS)
- Added sections: Principle VII (Secure Session Tokens), Principle VIII (Resilience)
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
All external input (body, query, params, headers that carry data) MUST be validated through
DTOs with `class-validator` and a global `ValidationPipe` with whitelisting enabled; no
endpoint may be exempt, and path/query identifiers MUST use pipes such as `ParseUUIDPipe`
or `ParseIntPipe`. Every API MUST also be protected by a global `APP_GUARD` that denies by
default: public routes MUST opt out explicitly (e.g. a `@Public()` decorator), and
resource-level authorization (the caller owns/can access the data) MUST be checked by a
guard or policy before the handler runs. Responses MUST be
shaped by explicit DTOs, never by returning raw entities.
Rationale: invalid input is rejected at the edge, so inner layers can trust their types.

### IV. Data Integrity (PostgreSQL + TypeORM)
Schema changes MUST be made through versioned TypeORM migrations; `synchronize: true` MUST
NOT be used outside throwaway local experiments. Operations that modify several rows or
tables MUST run inside a transaction. Monetary and quantity values MUST NOT use
floating-point types; use `numeric`/decimal with explicit precision.
Rationale: financial-style data requires exact arithmetic and reproducible schema history.

### V. Simplicity & Observability
Always start with the simplest design that satisfies the spec, then grow from there (YAGNI).
Complexity is added only when a requirement stated in the spec, or a measured problem,
demands it, never in anticipation. Simplicity is checked with these tests, and a "yes" to
any of them is a violation that MUST be removed or justified in the plan's
complexity-tracking section:
- Is there an abstraction (interface, base class, factory, generic) with a single
  implementation and no concrete second use? Rule of three: abstract on the third
  repetition, not the first.
- Is there a dependency, library, layer, service or table that no current requirement uses?
- Can a new reader trace a request from controller to database in under five minutes?
- Could the same requirement be met by deleting code or using a built-in of NestJS,
  TypeORM or PostgreSQL?
- Is a scaling or consistency mechanism (cache, queue, outbox, saga, CQRS, read replica,
  extra service) present without a stated load or consistency requirement that needs it?
Growth triggers: a mechanism may be introduced only when the spec states the need or a
measurement shows it (e.g. a load test missing its p95 target, an observed race, a
requirement spanning services). The plan MUST record the trigger. Principles marked
NON-NEGOTIABLE (security, test-first, payment idempotency) are baseline requirements, not
optional complexity. When two designs satisfy the spec, the one with fewer moving parts
MUST be chosen. Errors MUST be handled through
NestJS exception filters and return consistent, documented error responses. Logging MUST use
the NestJS `Logger`, and logs MUST NOT contain secrets or personal data.
Rationale: a small, debuggable codebase is easier to review and to defend.

### VI. API Contract for a Separate Frontend
This repository is backend-only. The frontend (Next.js + React + TypeScript) lives in a
separate repository and consumes this API, so the HTTP API is a public contract. The API
MUST be documented with OpenAPI via `@nestjs/swagger`. EVERY endpoint MUST be documented
in Swagger (operation, request DTOs, all response codes including errors, and auth
requirements) and an endpoint without Swagger documentation MUST NOT be merged. The
generated document MUST stay in sync with the DTOs. Breaking changes (removed/renamed fields, changed types or
status codes) MUST be versioned (e.g. `/v1`) and MUST NOT ship silently. CORS MUST be
restricted to configured origins taken from environment variables.
Rationale: the frontend team (or repo) can only move independently if the contract is
explicit, versioned and machine-readable.

### VII. Secure Session Tokens (NON-NEGOTIABLE)
The session/authentication token MUST be delivered only in a cookie flagged `HttpOnly` and
`Secure`, with `SameSite=Strict` by default (`Lax` or `None` require a documented
justification in the plan). All traffic in non-local environments MUST use HTTPS/TLS: HTTP
requests MUST be redirected or rejected, and responses MUST send HSTS (`helmet`). The token MUST NOT appear in a response body, a URL,
logs, or any storage readable by JavaScript (`localStorage`, `sessionStorage`). Logout MUST
clear the cookie using the same attributes it was set with. Cookie lifetime MUST be bounded
and configured from environment variables.
A global authentication middleware MUST run on every request: it reads the token from the
cookie, verifies signature, expiry and revocation, and attaches the authenticated identity
to the request. An invalid, expired or missing token MUST yield `401`, except on routes
explicitly marked public. The deny-by-default guard (Principle III) enforces the access
decision on top of that identity.
Rationale: `HttpOnly` makes the token unreachable from injected scripts, which removes the
most common token-theft path (XSS).

### VIII. Resilience: Retries & Circuit Breaker
APIs MUST be safe to retry: `GET`, `PUT` and `DELETE` MUST be idempotent, and `POST`
endpoints that create or charge something MUST accept an `Idempotency-Key` header so a
repeated request does not duplicate its effect. Every call to an external service (HTTP,
third-party API, other microservice) MUST have an explicit timeout, a bounded retry policy
with exponential backoff and jitter (only for transient failures and idempotent calls), and
a circuit breaker that fails fast while the dependency is down. When the breaker is open the
API MUST return a clear error (e.g. `503` with `Retry-After`) and MUST log the state change.
Rationale: unbounded retries and missing breakers turn one failing dependency into a full
outage.

### IX. Idempotent Payments & Transactions (NON-NEGOTIABLE)
Every operation that moves money or creates a financial/stateful transaction (payments,
transfers, orders, refunds) MUST be idempotent end to end. It MUST require an
`Idempotency-Key`, persist the key with the request fingerprint and the final result under a
unique constraint, return the stored result on replays, and reject a reused key whose
payload differs (`422`/`409`). Idempotency MUST also hold for internal consumers: message
handlers MUST deduplicate by message id.
Rationale: retries, timeouts and redeliveries are normal; a double charge is not acceptable.

### X. Distributed Consistency: Saga & Outbox
A business operation that spans more than one service, external system or message broker
MUST NOT rely on a distributed transaction. It MUST be modeled as a Saga (orchestrated or
choreographed) where every step has a compensating action and an explicit state persisted
in the database. Events MUST be published through the Transactional Outbox pattern: the
domain change and the outbox row are written in the same database transaction, and a
separate relay publishes them with at-least-once delivery. Consumers MUST be idempotent.
Dual writes (database write followed by a direct publish) are prohibited.
Rationale: the outbox removes the lost-event/phantom-event window; sagas make failures
recoverable instead of leaving inconsistent state.

### XI. Scale & Concurrency by Design
Designs MUST assume thousands of requests per second and concurrent access to the same
data. Every plan MUST state the expected load, identify shared mutable state, and choose a
concurrency strategy for it (optimistic locking with a version column, pessimistic
`SELECT ... FOR UPDATE`, `SKIP LOCKED` for queues, or atomic SQL updates), with the
isolation level and transaction scope justified. Transactions MUST be short, MUST NOT
contain network calls, and MUST acquire locks in a consistent order to avoid deadlocks.
Connection pools MUST be sized explicitly, list endpoints MUST be paginated, and hot read
paths MUST consider caching. The API MUST remain stateless so it can scale horizontally.
Features with throughput or concurrency requirements MUST ship with stress/load tests
(e.g. `k6`) and concurrency tests that exercise races on the shared state; results and the
target (p95/p99 latency, error rate, RPS) MUST be recorded in the plan or PR.
Rationale: races and lock contention only appear under load, so they must be designed for
and tested, not discovered in production.

### XII. Rate Limiting & Abuse Protection
Every API MUST have a global rate limit (`@nestjs/throttler`) applied by default, with
stricter limits on sensitive routes (login, token refresh, payments, password or code
verification). In any multi-instance deployment the limiter MUST use a shared store
(e.g. Redis) so limits hold across instances. Exceeding a limit MUST return `429` with a
`Retry-After` header, and the `429` response MUST be documented in Swagger. Limits MUST be
configurable through environment variables, and an endpoint MUST NOT opt out of the limiter
without a documented justification in the plan.
Rationale: without a limit, a single client or bot can exhaust capacity and defeat the
scale and resilience guarantees of the rest of the system.

### XIII. Design Patterns, Named and Justified
Every feature with business logic MUST be built around at least one explicitly named design
pattern appropriate to its problem (e.g. Strategy, Factory, Repository, Adapter, Facade,
Decorator, Observer/Event, State, Template Method, CQRS, Specification). The plan MUST name
the pattern, the problem it solves and, when relevant, the simpler alternative rejected. The
code MUST make the pattern recognizable (naming, structure) and tests MUST cover its
extension points. A pattern MUST NOT be applied without a concrete problem to solve:
Principle V (simplicity) prevails over decorative patterns.
Rationale: named patterns give the team a shared vocabulary and predictable extension
points, while the justification rule prevents over-engineering.

## Technology Stack & Constraints

- Runtime and language: Node.js with TypeScript (strict).
- Framework: NestJS.
- Database: PostgreSQL accessed exclusively via TypeORM.
- Validation: `class-validator` and `class-transformer`.
- API docs: `@nestjs/swagger` (OpenAPI), exposed in non-production environments.
- Frontend consumer: Next.js + React + TypeScript in a separate repository.
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
- Every plan MUST include an Architecture Recommendation: the proposed architecture, at
  least one alternative considered, the trade-offs, and why this one fits the expected load
  and consistency needs.
- Every plan MUST name the design pattern(s) used and justify them (Principle XIII).
- The plan MUST include a Constitution Check; any violation MUST be recorded in its
  complexity-tracking section with a justification.
- The README MUST document how to install, configure, migrate, run and test the project.

## Governance

This constitution supersedes other practices in this repository. Amendments MUST be made
through a change to this file that states the reason and is recorded in the commit message;
principle removals or redefinitions require a MAJOR version bump, new or materially
expanded principles a MINOR bump, and clarifications a PATCH bump. Every plan and review
MUST verify compliance with these principles, and unjustified complexity MUST be rejected.

**Version**: 1.8.0 | **Ratified**: 2026-11-13 | **Last Amended**: 2026-11-13
