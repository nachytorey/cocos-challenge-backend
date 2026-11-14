# Cocos Challenge Backend Constitution

## Applicability

These principles do not assume a specific product or domain. Principles marked
**(BASELINE)** apply to every feature. Principles marked **(CONDITIONAL)** apply only when
their trigger is present in the spec; the plan MUST state for each conditional principle
whether its trigger is present and why. A conditional principle whose trigger is absent MUST
NOT be implemented "just in case" (Principle V).

## Core Principles

### I. Test-First (BASELINE, NON-NEGOTIABLE)
Tests MUST be written before the implementation they cover. The cycle is Red → Green →
Refactor: a failing test MUST exist before any production code is written for that behavior.
Business logic MUST have unit tests; every HTTP endpoint MUST have at least one functional
(HTTP-level) test covering its success path and its main error paths.
Rationale: tests written after the fact validate the code, not the requirement.

### II. Layered Architecture on Express (BASELINE)
The code MUST be organized by domain feature (e.g. `src/orders/`, `src/portfolio/`), and
each feature MUST keep three layers: routes/controllers (transport only: parse, validate,
map status codes), services (business rules), and repositories (data access through
TypeORM). Controllers MUST NOT access repositories or the database directly, and services
MUST NOT know about `req`/`res`. Dependencies MUST be passed through constructors and wired
in a single composition root (`src/app.ts` or equivalent); no service locator, no global
mutable singletons, and no dependency-injection container unless a plan justifies it.
Features MUST NOT import each other circularly.
Rationale: separated layers keep business logic unit-testable without HTTP or a database,
and an explicit composition root keeps wiring visible without framework magic.

### III. Strict Typing & Validation at the Boundary (BASELINE)
TypeScript MUST run in `strict` mode and `any` is prohibited unless justified in a comment.
All external input (body, query, params, headers that carry data) MUST be validated by a
zod schema in a validation middleware before reaching the controller; no endpoint may be
exempt, and identifiers in the path or query MUST be validated by type and format. Unknown
fields MUST be rejected. The parsed, typed value is the only input the controller uses.
Responses MUST be shaped by explicit response schemas/mappers, never by returning raw
entities.
Access control (CONDITIONAL — trigger: the API authenticates users): every route MUST be
protected by a global deny-by-default authorization middleware; public routes MUST opt out
explicitly, and resource-level authorization (the caller owns or can access the data) MUST
be checked before the handler runs.
Rationale: invalid or unauthorized requests are rejected at the edge, so inner layers can
trust their input.

### IV. Data Integrity (BASELINE)
Schema changes MUST be made through versioned TypeORM migrations; `synchronize: true` MUST
NOT be used outside throwaway local experiments. Operations that modify several rows or
tables MUST run inside a transaction. Monetary and quantity values MUST NOT use
floating-point types; use `numeric`/decimal with explicit precision, and a decimal library
in application code. Timestamps MUST be stored as `timestamptz` in UTC.
Migrations MUST be safe to run while the previous version of the application is still
serving traffic (expand, migrate, then contract), and every migration MUST have a working
`down`. When the project starts from a pre-existing schema, that schema MUST be captured as
a baseline migration instead of being rewritten.
The database connection MUST set `statement_timeout`, `lock_timeout` and
`idle_in_transaction_session_timeout`, configured from environment variables.
Records with audit or legal value (money movements, orders, permission changes) MUST be
append-only: they are corrected by a new compensating record, never by `UPDATE` or `DELETE`
of their economic fields. A status transition explicitly allowed by the spec (e.g.
cancelling a pending order) is permitted.
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
- Does a request cross more than three layers of our own code between the route and the
  database (controller → service → repository)?
- Could the same requirement be met by deleting code or using a built-in of Express,
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

### VI. API Contract (BASELINE)
This repository is backend-only and has no frontend in scope. The HTTP API is consumed by
external clients (Postman/REST collections, other services, a possible future frontend), so
it is a public contract. EVERY
endpoint MUST be documented in an OpenAPI document generated from the same zod schemas used
for validation (operation, request schemas, all response codes including errors, and auth
requirements when applicable), served with Swagger UI; an endpoint without OpenAPI
documentation MUST NOT be merged. Breaking changes (removed/renamed fields, changed types or
status codes) MUST be versioned (e.g. `/v1`) and MUST NOT ship silently. CORS MUST be
restricted to configured origins taken from environment variables.
The API MUST follow one set of conventions across all endpoints: plural resource nouns and
standard status codes; `camelCase` JSON fields; dates as ISO 8601 in UTC; monetary amounts
as decimal strings with an explicit ISO 4217 currency, never JSON numbers; and every list
endpoint paginated with a bounded `limit`, using one pagination, sorting and filtering
scheme for the whole API, with sortable and filterable fields whitelisted.
Rationale: clients can only integrate reliably if the contract is explicit, versioned and
machine-readable; generating it from the validation schemas keeps it in sync.

### VII. Secure Session Tokens (CONDITIONAL, NON-NEGOTIABLE when triggered)
Trigger: the API authenticates users. The session/authentication token MUST be delivered
only in a cookie flagged `HttpOnly` and `Secure`, with `SameSite=Strict` by default (`Lax`
or `None` require a documented justification in the plan). The token MUST NOT appear in a
response body, a URL, logs, or any storage readable by JavaScript. Logout MUST clear the
cookie using the same attributes it was set with. Cookie lifetime MUST be bounded and
configured from environment variables.
Authentication has exactly one mechanism: a global middleware that runs on every request,
reads the token from the cookie, verifies signature and expiry, and attaches the
authenticated identity to the request. The deny-by-default authorization middleware
(Principle III) is the only place that turns a missing identity into `401`. Token revocation
MUST be supported with a bounded per-request cost; the plan MUST state the mechanism.
Independently of authentication, all traffic in non-local environments MUST use HTTPS/TLS
(HTTP redirected or rejected) and responses MUST send HSTS (`helmet`) — this part is
BASELINE.
Rationale: `HttpOnly` makes the token unreachable from injected scripts (XSS); a single
mechanism avoids divergent auth paths.

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
version column, pessimistic `SELECT ... FOR UPDATE`, advisory locks, or `SKIP LOCKED` for
queues), choosing the simplest one that is correct. Every plan MUST state the expected load;
when the spec gives none, the plan MUST record the assumption it used.
Features that touch shared mutable state MUST ship with concurrency tests that exercise the
race. Features with a stated throughput or latency requirement MUST ship with stress/load
tests (e.g. `k6`), and the target and results (p95/p99 latency, error rate, RPS) MUST be
recorded in the plan or PR.
Rationale: statelessness, pagination and correct locking are cheap up front and expensive to
retrofit; caches and queues are the opposite.

### XII. Rate Limiting & Abuse Protection (BASELINE)
Every API MUST have a global rate limit (`express-rate-limit`) applied by default, with
stricter limits on sensitive routes (login, token refresh, non-repeatable operations,
password or code verification). In a multi-instance deployment the limiter MUST use a shared
store (e.g. Redis); a single-instance deployment MAY use the in-memory store. Exceeding a
limit MUST return `429` with a `Retry-After` header, documented in OpenAPI. Limits MUST be
configurable through environment variables, and a route MUST NOT opt out of the limiter
without a documented justification in the plan.
Rationale: without a limit, a single client or bot can exhaust capacity.

### XIII. Design Patterns, Named and Justified (BASELINE)
Every plan MUST make an explicit pattern decision for each feature with business logic.
When the feature has behavior that varies by type, an external integration, state
transitions, combinable rules or cross-cutting behavior, it MUST use a named design pattern
that fits (e.g. Strategy, Factory, Adapter, Facade, Decorator, Observer/Event, State,
Template Method, Specification, CQRS), and the plan MUST name the pattern, the problem it
solves and the simpler alternative rejected. Patterns already mandated by this constitution
(Repository, constructor injection, layered features) do not satisfy this principle. When
none of those conditions is present, the plan MUST state "no additional pattern needed" with
the reason; a pattern MUST NOT be added without a concrete problem (Principle V). The code
MUST make the pattern recognizable (naming, structure) and tests MUST cover its extension
points.
Rationale: named patterns give a shared vocabulary and predictable extension points; the
explicit decision prevents both ad-hoc designs and decorative patterns.

### XIV. Errors & Observability (BASELINE)
Errors MUST be converted by a single Express error-handling middleware into one documented
response format (Problem Details) with a stable machine-readable code; internal details
(stack traces, SQL) MUST NOT reach the client. Domain errors MUST be typed classes thrown by
services and mapped to HTTP only in that middleware. Logs MUST be structured (JSON, `pino`),
carry a correlation id per request, and MUST NOT contain secrets, tokens or personal data;
`console` MUST NOT be used. The service MUST expose liveness and readiness health checks.
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

### XVI. Application Security (BASELINE)
State-changing operations MUST NOT be exposed through `GET`. State-changing requests MUST
be rejected when their `Origin` header is present and is not an allowed origin; when the API
uses cookie authentication with `SameSite` relaxed to `Lax` or `None`, an anti-CSRF token
MUST also be required. When the API stores credentials, passwords MUST be stored only as
salted hashes produced by `argon2id`, never encrypted or logged, and login MUST NOT reveal
whether the account exists. When the API has authorization, it MUST follow one explicit
model (roles or permissions) declared in the plan, with least privilege as the default.
Request bodies MUST have a size limit, and security headers MUST be set with `helmet`.
Dependencies MUST be installed from a committed lockfile, and the CI MUST fail on known high
or critical vulnerabilities. Personal data MUST be limited to what the spec requires and
MUST NOT appear in logs or error responses.
Rationale: these controls are cheap at the start and close the most common attack paths.

### XVII. Runtime Robustness (BASELINE)
The service MUST shut down gracefully: on a termination signal it stops accepting new
requests, lets in-flight requests finish within a bounded time, and closes database and
other connections. Every incoming request MUST have a server-side timeout, and no request
may wait indefinitely on a database query, a lock or an outbound call. Configuration MUST be
validated at startup with a schema and the process MUST fail fast, with a clear message,
when a required variable is missing or invalid. Unhandled rejections and uncaught exceptions
MUST be logged and MUST terminate the process so the orchestrator restarts it in a clean
state.
Rationale: deploys and failures are routine; a service that stops, times out and restarts
predictably does not lose or corrupt work when they happen.

## Technology Stack & Constraints

Baseline (always present):
- Runtime and language: Node.js (LTS) with TypeScript (strict).
- HTTP framework: Express 5 (required by the project brief).
- Database: PostgreSQL accessed exclusively via TypeORM (required by the project brief).
- Validation: `zod` schemas in a validation middleware.
- API docs: OpenAPI generated from the zod schemas (`@asteasolutions/zod-to-openapi`) and
  served with `swagger-ui-express` in non-production environments.
- Security and abuse protection: `helmet`, `cors`, `express-rate-limit`.
- Decimal arithmetic: `decimal.js` for monetary and quantity values.
- Logging: `pino` with `pino-http`.
- Testing: Jest for unit tests; Jest with Supertest for functional HTTP tests.
- Quality tooling: ESLint with `typescript-eslint`, Prettier, a circular-dependency check.

Conditional (only when the corresponding trigger is recorded in a plan):
- `cookie-parser`, `argon2`: the API authenticates users or stores credentials.
- Redis (`rate-limit-redis`): multi-instance rate limiting, token revocation, or a measured
  cache need.
- Retry/circuit-breaker library (e.g. `cockatiel`): outbound calls to external services.
- Message broker and outbox relay: operations spanning services.
- `k6`: features with a stated throughput or latency requirement.
- Metrics (`prom-client`): a stated operational requirement.

Configuration MUST come from environment variables, parsed and validated at startup by a
zod schema in a single config module; code MUST read configuration only from that module,
never from `process.env` directly. Secrets MUST NOT be committed. A `.env.example` MUST list
every required variable. Adding a new runtime dependency MUST be justified in the plan that
introduces it.

## Development Workflow & Quality Gates

- Work follows the Spec Kit flow: constitution → specify → (clarify) → plan → tasks →
  (analyze) → implement.
- Each feature MUST live on its own branch and be merged only when all gates pass: lint,
  type-check, circular-dependency check, unit tests with coverage threshold, and functional
  HTTP tests.
- Commits MUST be small and focused, and use Conventional Commits (`feat:`, `fix:`,
  `test:`, `docs:`, `refactor:`).
- Every plan MUST include: an Architecture Recommendation (proposed architecture, at least
  one alternative, trade-offs); the applicability of each CONDITIONAL principle; the
  expected load or the assumption used; and the pattern decision (Principle XIII).
- The plan MUST include a Constitution Check; any violation MUST be recorded in its
  complexity-tracking section with a justification.
- Definition of Done: a task is done only when its tests were written first and pass, all
  gates are green, every endpoint it touches is documented in OpenAPI, new environment
  variables are in `.env.example`, migrations have a working `down`, and no secret or
  personal data was added to logs.
- The README MUST document how to install, configure, migrate, run and test the project,
  plus the assumptions and design decisions taken.

## Governance

This constitution supersedes other practices in this repository. Amendments MUST be made
through a change to this file that states the reason and is recorded in the commit message;
principle removals or redefinitions require a MAJOR version bump, new or materially
expanded principles a MINOR bump, and clarifications a PATCH bump. Every plan and review
MUST verify compliance with these principles, and unjustified complexity MUST be rejected.

**Version**: 3.0.1 | **Ratified**: 2026-11-13 | **Last Amended**: 2026-11-13
