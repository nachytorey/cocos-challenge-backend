# Cocos Challenge Backend Constitution

## Applicability

These principles are generic: they do not assume a specific product or domain. Principles
marked **(BASELINE)** apply to every feature. Principles marked **(CONDITIONAL)** apply only
when their trigger is present in the spec; the plan MUST state for each conditional principle
whether its trigger is present and why. A conditional principle whose trigger is absent MUST
NOT be implemented "just in case" (Principle V).

## Core Principles

### I. Test-First (BASELINE, NON-NEGOTIABLE)
Tests MUST be written before the implementation they cover. The cycle is Red → Green →
Refactor: a failing test MUST exist before any production code is written for that behavior.
Business logic MUST have unit tests; every HTTP endpoint MUST have at least one e2e test
covering its success path and its main error paths.
Rationale: tests written after the fact validate the code, not the requirement.

### II. Modular Architecture (BASELINE)
The application MUST be organized in NestJS modules, one per domain concept. Controllers
MUST only handle transport concerns (parsing, validation, status codes). Business rules MUST
live in services/providers, and data access MUST go through TypeORM repositories injected
via dependency injection. Controllers MUST NOT access repositories or the database directly.
Modules MUST NOT depend on each other circularly.
Rationale: separating layers keeps business logic unit-testable without HTTP or a database.

### III. Strict Typing, Validation & Access Control (BASELINE)
TypeScript MUST run in `strict` mode and `any` is prohibited unless justified in a comment.
All external input (body, query, params, headers that carry data) MUST be validated through
DTOs with `class-validator` and a global `ValidationPipe` with whitelisting enabled; no
endpoint may be exempt, and path/query identifiers MUST use pipes such as `ParseUUIDPipe`
or `ParseIntPipe`. Every API MUST be protected by a global `APP_GUARD` that denies by
default: public routes MUST opt out explicitly (e.g. a `@Public()` decorator), and
resource-level authorization (the caller owns or can access the data) MUST be checked by a
guard or policy before the handler runs. Responses MUST be shaped by explicit DTOs, never by
returning raw entities.
Rationale: invalid or unauthorized requests are rejected at the edge, so inner layers can
trust their input.

### IV. Data Integrity (BASELINE)
Schema changes MUST be made through versioned TypeORM migrations; `synchronize: true` MUST
NOT be used outside throwaway local experiments. Operations that modify several rows or
tables MUST run inside a transaction. Monetary and quantity values MUST NOT use
floating-point types; use `numeric`/decimal with explicit precision.
Rationale: exact arithmetic and a reproducible schema history prevent silent data corruption.

### V. Simplicity First, Then Grow (BASELINE)
Always start with the simplest design that satisfies the spec, then grow from there (YAGNI).
Complexity is added only when a requirement stated in the spec, or a measured problem,
demands it, never in anticipation. A "yes" to any of these checks is a violation that MUST
be removed or justified in the plan's complexity-tracking section:
- Is there an abstraction (interface, base class, factory, generic) with a single
  implementation and no concrete second use? Rule of three: abstract on the third
  repetition, not the first.
- Is there a dependency, library, layer, service or table that no current requirement uses?
- Does a request cross more than three layers of our own code between the controller and
  the database (controller → service → repository)?
- Could the same requirement be met by deleting code or using a built-in of NestJS,
  TypeORM or PostgreSQL?
- Is a scaling or consistency mechanism (cache, queue, outbox, saga, CQRS, read replica,
  extra service) present without a stated load or consistency requirement that needs it?

Growth triggers: a mechanism may be introduced only when the spec states the need or a
measurement shows it (e.g. a load test missing its p95 target, an observed race, a
requirement spanning services). The plan MUST record the trigger. BASELINE principles are
minimum requirements, not optional complexity. When two designs satisfy the spec, the one
with fewer moving parts MUST be chosen.
Rationale: a small codebase is easier to review, test and change; growth is cheap when it
is driven by evidence.

### VI. API Contract for a Separate Frontend (BASELINE)
This repository is backend-only. The frontend (Next.js + React + TypeScript) lives in a
separate repository and consumes this API, so the HTTP API is a public contract. EVERY
endpoint MUST be documented with OpenAPI via `@nestjs/swagger` (operation, request DTOs, all
response codes including errors, and auth requirements); an endpoint without Swagger
documentation MUST NOT be merged. The generated document MUST stay in sync with the DTOs.
Breaking changes (removed/renamed fields, changed types or status codes) MUST be versioned
(e.g. `/v1`) and MUST NOT ship silently. CORS MUST be restricted to configured origins taken
from environment variables.
Rationale: the frontend can only move independently if the contract is explicit, versioned
and machine-readable.

### VII. Secure Session Tokens (BASELINE when the API authenticates users, NON-NEGOTIABLE)
The session/authentication token MUST be delivered only in a cookie flagged `HttpOnly` and
`Secure`, with `SameSite=Strict` by default (`Lax` or `None` require a documented
justification in the plan). All traffic in non-local environments MUST use HTTPS/TLS: HTTP
requests MUST be redirected or rejected, and responses MUST send HSTS (`helmet`). The token
MUST NOT appear in a response body, a URL, logs, or any storage readable by JavaScript
(`localStorage`, `sessionStorage`). Logout MUST clear the cookie using the same attributes
it was set with. Cookie lifetime MUST be bounded and configured from environment variables.

Authentication has exactly one mechanism: a global middleware that runs on every request,
reads the token from the cookie, verifies signature and expiry, and attaches the
authenticated identity to the request. The deny-by-default guard (Principle III) is the only
place that turns a missing identity into `401`. Token revocation MUST be supported with a
bounded per-request cost (e.g. short-lived tokens plus a revocation list in a shared cache);
the plan MUST state the mechanism chosen.
Rationale: `HttpOnly` makes the token unreachable from injected scripts, which removes the
most common token-theft path (XSS); a single mechanism avoids divergent auth paths.

### VIII. Resilience: Retries & Circuit Breaker (BASELINE for retry safety; CONDITIONAL for outbound calls)
APIs MUST be safe to retry: `GET`, `PUT` and `DELETE` MUST be idempotent. Idempotency of
`POST` operations is governed only by Principle IX.
Trigger for the rest of this principle: the feature calls an external service (HTTP,
third-party API, another service). Every such call MUST have an explicit timeout, a bounded
retry policy with exponential backoff and jitter (only for transient failures and idempotent
calls), and a circuit breaker that fails fast while the dependency is down. When the breaker
is open the API MUST return `503` with `Retry-After` and MUST log the state change.
Rationale: unbounded retries and missing breakers turn one failing dependency into a full
outage.

### IX. Idempotent Non-Repeatable Operations (CONDITIONAL, NON-NEGOTIABLE when triggered)
Trigger: an operation whose repetition would cause harm, such as moving money, placing an
order, creating a charge or refund, sending a notification, or any other effect that must
happen exactly once. Such an operation MUST require an `Idempotency-Key`, persist the key
with the request fingerprint and the final result under a unique constraint, return the
stored result on replays, and reject a reused key whose payload differs (`422`). A replay
while the first request is in progress MUST return `409`. Message handlers for such
operations MUST deduplicate by message id.
Rationale: retries, timeouts and redeliveries are normal; a duplicated effect is not
acceptable.

### X. Distributed Consistency: Saga & Outbox (CONDITIONAL)
Trigger: a business operation spans more than one service, external system or message
broker. It MUST NOT rely on a distributed transaction. It MUST be modeled as a Saga
(orchestrated or choreographed) where every step has a compensating action and an explicit
state persisted in the database. Events MUST be published through the Transactional Outbox
pattern: the domain change and the outbox row are written in the same database transaction,
and a separate relay publishes them with at-least-once delivery. Consumers MUST be
idempotent. Dual writes (database write followed by a direct publish) are prohibited.
A single-database operation MUST use a plain local transaction instead.
Rationale: the outbox removes the lost-event window; sagas make failures recoverable instead
of leaving inconsistent state.

### XI. Scale-Ready, Not Scale-Built (BASELINE)
The design MUST never prevent scaling to thousands of requests per second, but scaling
mechanisms are added only through the growth triggers of Principle V. Scale-ready means, for
every feature: the API is stateless (no in-memory session or shared state); list endpoints
are paginated; transactions are short, contain no network calls and acquire locks in a
consistent order; connection pools are sized explicitly; and every piece of shared mutable
state has a stated concurrency strategy (atomic SQL update, optimistic locking with a
version column, pessimistic `SELECT ... FOR UPDATE`, or `SKIP LOCKED` for queues), choosing
the simplest one that is correct. Every plan MUST state the expected load; when the spec
gives none, the plan MUST record the assumption it used.
Features that touch shared mutable state MUST ship with concurrency tests that exercise the
race. Features with a stated throughput or latency requirement MUST ship with stress/load
tests (e.g. `k6`), and the target and results (p95/p99 latency, error rate, RPS) MUST be
recorded in the plan or PR.
Rationale: statelessness, pagination and correct locking are cheap up front and expensive to
retrofit; caches and queues are the opposite.

### XII. Rate Limiting & Abuse Protection (BASELINE)
Every API MUST have a global rate limit (`@nestjs/throttler`) applied by default, with
stricter limits on sensitive routes (login, token refresh, non-repeatable operations,
password or code verification). In a multi-instance deployment the limiter MUST use a shared
store (e.g. Redis); a single-instance deployment MAY use the in-memory store. Exceeding a
limit MUST return `429` with a `Retry-After` header, documented in Swagger. Limits MUST be
configurable through environment variables, and an endpoint MUST NOT opt out of the limiter
without a documented justification in the plan.
Rationale: without a limit, a single client or bot can exhaust capacity.

### XIII. Design Patterns, Named and Justified (BASELINE)
Every plan MUST make an explicit pattern decision for each feature with business logic.
When the feature has behavior that varies by type, an external integration, state
transitions, combinable rules or cross-cutting behavior, it MUST use a named design pattern
that fits (e.g. Strategy, Factory, Adapter, Facade, Decorator, Observer/Event, State,
Template Method, Specification, CQRS), and the plan MUST name the pattern, the problem it
solves and the simpler alternative rejected. Patterns already mandated by the framework or
by this constitution (Repository, dependency injection, modules) do not satisfy this
principle. When none of those conditions is present, the plan MUST state "no additional
pattern needed" with the reason; a pattern MUST NOT be added without a concrete problem
(Principle V). The code MUST make the pattern recognizable (naming, structure) and tests
MUST cover its extension points.
Rationale: named patterns give a shared vocabulary and predictable extension points; the
explicit decision prevents both ad-hoc designs and decorative patterns.

### XIV. Errors & Observability (BASELINE)
Errors MUST be converted by a single global exception filter into one documented response
format with a stable machine-readable code; internal details (stack traces, SQL) MUST NOT
reach the client. Logs MUST be structured (JSON), carry a correlation id per request, and
MUST NOT contain secrets, tokens or personal data. The service MUST expose liveness and
readiness health checks. The logging library is chosen in the plan (the NestJS `Logger` or a
compatible structured logger) and used consistently across the codebase.
Rationale: a consistent error contract lets clients react correctly, and correlated logs
make failures diagnosable.

### XV. Code Quality: Smells Detected Automatically (BASELINE)
Code smells MUST be caught by tooling, not only by review. The lint configuration MUST fail
the build on: unhandled promises, explicit `any`, unused code, `console` calls, circular
imports, and functions that exceed the configured limits (defaults: cyclomatic complexity
10, 50 lines per function, 4 parameters, nesting depth 3). An empty `catch`, or one that
swallows the error without handling or rethrowing it, is prohibited. Unit-test coverage of
business logic MUST stay at or above the configured threshold (default 80% lines and
branches). A limit may be raised for a specific function only with an inline justification.
Rationale: rules that are not enforced automatically decay; tooling keeps the baseline
without relying on memory.

## Technology Stack & Constraints

Baseline (always present):
- Runtime and language: Node.js with TypeScript (strict).
- Framework: NestJS.
- Database: PostgreSQL accessed exclusively via TypeORM.
- Validation: `class-validator` and `class-transformer`.
- API docs: `@nestjs/swagger` (OpenAPI), exposed in non-production environments.
- Security and abuse protection: `helmet`, `@nestjs/throttler`, `cookie-parser`.
- Testing: Jest for unit tests; Jest with Supertest for e2e tests.
- Quality tooling: ESLint with `typescript-eslint`, Prettier, a circular-dependency check.
- Frontend consumer: Next.js + React + TypeScript in a separate repository.

Conditional (only when the corresponding trigger is recorded in a plan):
- Redis: multi-instance rate limiting, token revocation list, or a measured cache need.
- Retry/circuit-breaker library (e.g. `cockatiel`): outbound calls to external services.
- Message broker and outbox relay: operations spanning services.
- `k6`: features with a stated throughput or latency requirement.
- Structured logger (e.g. `nestjs-pino`), health checks (`@nestjs/terminus`), metrics.

Configuration MUST come from environment variables via `@nestjs/config` and MUST be
validated at startup; secrets MUST NOT be committed. A `.env.example` MUST list every
required variable. Adding a new runtime dependency MUST be justified in the plan that
introduces it.

## Development Workflow & Quality Gates

- Work follows the Spec Kit flow: constitution → specify → (clarify) → plan → tasks →
  (analyze) → implement.
- Each feature MUST live on its own branch and be merged only when all gates pass: lint,
  type-check, circular-dependency check, unit tests with coverage threshold, and e2e tests.
- Commits MUST be small and focused, and use Conventional Commits (`feat:`, `fix:`,
  `test:`, `docs:`, `refactor:`).
- Every plan MUST include: an Architecture Recommendation (proposed architecture, at least
  one alternative, trade-offs); the applicability of each CONDITIONAL principle; the
  expected load or the assumption used; and the pattern decision (Principle XIII).
- The plan MUST include a Constitution Check; any violation MUST be recorded in its
  complexity-tracking section with a justification.
- The README MUST document how to install, configure, migrate, run and test the project.

## Governance

This constitution supersedes other practices in this repository. Amendments MUST be made
through a change to this file that states the reason and is recorded in the commit message;
principle removals or redefinitions require a MAJOR version bump, new or materially
expanded principles a MINOR bump, and clarifications a PATCH bump. Every plan and review
MUST verify compliance with these principles, and unjustified complexity MUST be rejected.

**Version**: 2.0.0 | **Ratified**: 2026-11-13 | **Last Amended**: 2026-11-13
