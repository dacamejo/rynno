# Architecture & Codebase Review (2026-02)

## Scope
This review covers the current Node/Express application with focus on maintainability, modularity, and scalability. It specifically evaluates how the current structure impacts long-term feature velocity, reliability, and operational growth.

## Executive summary
The app is functional and ships meaningful capabilities (trip ingest, OAuth, reminder scheduling, playlist generation, feedback analytics), but too much business logic is concentrated in `index.js`, and core modules combine multiple responsibilities. This makes feature changes high-risk, testing expensive, and scaling difficult.

The highest leverage improvement is to move to a **modular layered architecture**:
- thin transport layer (HTTP routes/controllers),
- domain/application services (use-case orchestration),
- infrastructure adapters (Spotify, database, storage, scheduling),
- shared cross-cutting modules (validation, observability, config, error handling).

## Current-state observations

### 1) Monolithic API entrypoint
`index.js` currently owns server bootstrapping, request parsing, route handlers, auth-state handling, orchestration logic, error shaping, feedback side effects, and scheduler entrypoints. This centralization increases coupling and decreases local reasoning.

**Impact:**
- A change in one flow can cause unintended side effects in unrelated endpoints.
- Harder unit testing because logic is bound to Express request/response concerns.
- Larger merge conflicts and slower team collaboration.

### 2) Mixed concerns in persistence layer
`src/db.js` contains:
- PostgreSQL data access,
- filesystem fallback persistence,
- token encryption/decryption wiring,
- query composition,
- event aggregation logic.

This module is effectively both repository + storage strategy + analytics helper.

**Impact:**
- Difficult to isolate failures (DB vs fallback vs crypto).
- Hard to swap storage implementation cleanly.
- Increasing cognitive load as schema and features grow.

### 3) Domain logic coupled to third-party API details
`services/playlistBuilder.js` is rich and useful but deeply tied to Spotify client behavior and request shape. Guardrails, profile adjustments, seed mutation, and API calls are interleaved.

**Impact:**
- Limits ability to reuse playlist-domain logic with other providers.
- Makes deterministic tests harder (requires broader mocking).
- Raises blast radius when Spotify contract changes.

### 4) Boundary validation is partial and distributed
Validation exists in route handlers but is ad hoc and repeated by endpoint. There is no single schema contract layer at the API boundary.

**Impact:**
- Inconsistent error contracts.
- Potential latent bugs due to coercion differences.
- Reduced confidence in backward compatibility as API grows.

### 5) Operational concerns are under-centralized
Error formatting exists (`getErrorCauseDetails`) but structured logging, correlation IDs, and centralized telemetry conventions are not fully standardized.

**Impact:**
- Slower incident diagnosis in production.
- Harder measurement of SLA/SLO and endpoint-level reliability trends.

## Recommended target architecture

### A. Directory/module structure (incremental)

```text
src/
  app/
    createServer.js
    middleware/
  modules/
    trips/
      trips.routes.js
      trips.controller.js
      trips.service.js
      trips.repository.js
      trips.schemas.js
    playlists/
      playlists.routes.js
      playlists.controller.js
      playlists.service.js
      playlists.domain.js
      playlists.schemas.js
    auth/
      auth.routes.js
      auth.controller.js
      auth.service.js
      oauth.repository.js
      auth.schemas.js
    reminders/
    feedback/
  infra/
    db/
      pgClient.js
      migrations/
    providers/
      spotify/
        spotifyClient.js
    scheduler/
  shared/
    config/
    errors/
    logger/
    validation/
```

This can be introduced module-by-module without a full rewrite.

### B. Layer responsibilities
- **Routes/controllers:** parse HTTP input, call service, map output to HTTP status.
- **Application services:** orchestrate business use-cases and transactions.
- **Domain modules:** pure decision logic (guardrails, heuristics, schedule calculation).
- **Repositories/adapters:** DB queries, provider SDK/API calls, fallback store details.

### C. Cross-cutting standards
- Unified request validation via schema library (e.g. Zod/Joi).
- Central error taxonomy (`ValidationError`, `ExternalDependencyError`, `ConflictError`, `NotFoundError`).
- Structured logging with correlation IDs propagated to downstream calls.
- Explicit config module that validates env variables at startup.

## Progress update (2026-02-20)

### Priority 0 status
1. **Split `index.js` into routers + controllers + bootstrap** — ✅ **Completed**.
   - `index.js` now only starts the app and DB bootstrap.
   - Routing/controller composition moved to `src/app/createServer.js` and `src/modules/*`.
2. **Introduce schema validation for all public endpoints** — ✅ **Completed**.
   - Added per-module endpoint schema validators (`*.schemas.js`) and applied body/query/params validation across public route surfaces.
3. **Create shared error mapper middleware** — ✅ **Completed**.
   - Shared error types + centralized Express error middleware introduced, reducing repeated route-level response shaping.
4. **Add request ID middleware + structured logger** — ✅ **Completed**.
   - Request IDs are added to request/response and request completion is logged in structured JSON.

### Follow-up actions after Priority 0
- Consider migrating custom validators to a stronger schema library (e.g., Zod/Joi) for richer coercion and reusable OpenAPI generation.
- Expand API contract test coverage from representative flows to all high-traffic endpoint groups.


### Priority 1 status
1. **Refactor `src/db.js` into repositories by bounded context** — ✅ **Completed**.
   - Added dedicated repositories under `src/infra/repositories` for trips, OAuth/users, reminders, and feedback.
   - `src/db.js` now composes repository instances instead of owning all persistence logic directly.
2. **Separate fallback storage strategy** behind an interface (`StorageProvider`) — ✅ **Completed**.
   - Introduced `StorageProvider` contract with `JsonFileStorageProvider` and `MemoryStorageProvider` implementations.
   - `initDb` now supports provider injection for deterministic tests.
3. **Isolate playlist domain logic** from Spotify API by introducing a `RecommendationProvider` adapter interface — ✅ **Completed**.
   - Added `services/recommendationProvider.js` and updated playlist recommendation/audio-feature retrieval to depend on the adapter.
4. **Expand unit tests for pure domain functions and add API contract tests for route boundaries** — ✅ **Completed**.
   - Added playlist domain unit tests for recommendation param shaping, deduping, and guardrail mutation behavior.
   - Expanded API contract validation coverage across trips, playlists, auth refresh, feedback events, feedback dashboard, and reminder dispatch boundaries.

### Priority 2 status
1. **Add idempotency keys for mutating endpoints sensitive to retries** — ✅ **Partially completed**.
   - Added reusable `Idempotency-Key` middleware with replay + conflict semantics in `src/shared/http.js`.
   - Enabled idempotent request handling for trip ingestion, reminder creation, playlist generation, and feedback event ingestion routes.
   - Added API contract tests that verify successful replay behavior and conflict detection when the same key is reused with a different payload.


### Coding-level improvements status (2026-02-21)
1. **Avoid mutable shared in-memory auth state for scale-out paths** — ✅ **Completed**.
   - OAuth state now uses a signed stateless token (`auth-state-token`) with TTL validation instead of process-local `Map` state.
   - **Pending follow-up:** move state secret validation into a centralized startup config module so secret requirements fail-fast during app bootstrap.
2. **Standardize DTOs between controllers and services** — ✅ **Partially completed**.
   - Auth module now maps request/response through `auth.service` use-case DTOs.
   - **Pending follow-up:** apply the same controller↔service DTO pattern to Trips, Playlists, Feedback, and Meta modules.
3. **Extract repeated auth checks into middleware** — ✅ **Completed**.
   - Internal API key verification is centralized in `requireInternalApiKey()` and shared across routes.
4. **Convert business constants to module-level config objects** — ✅ **Partially completed**.
   - Added `AUTH_CONFIG` and `HTTP_CONFIG` with single ownership for OAuth/idempotency defaults.
   - **Pending follow-up:** consolidate reminder and playlist tuning constants into dedicated module config objects.
5. **Add dependency injection entrypoints for services** — ✅ **Partially completed**.
   - Auth controller now composes injected dependencies through `createAuthService(...)`.
   - **Pending follow-up:** introduce service constructors and DI composition for trips/playlists/feedback controllers in `createServer`.

### Pending items snapshot
- [ ] Centralized startup config validation for critical env vars (including OAuth state signing secret).
- [ ] DTO/service extraction for non-auth modules.
- [ ] Broader constants/config centralization for reminder scheduler and playlist domain tuning values.
- [ ] Full service-level DI entrypoints across all modules.
- [ ] Priority 2 platform items still open: queue workers, domain events, SLO dashboards.

## Concrete improvement backlog (prioritized)

### Priority 0 (1-2 sprints)
1. **Split `index.js` into routers + controllers + bootstrap** while preserving current behavior.
2. **Introduce schema validation** for all public endpoints.
3. **Create shared error mapper middleware** to remove repeated `try/catch` response formatting in handlers.
4. **Add request ID middleware + structured logger.**

### Priority 1 (2-4 sprints)
1. **Refactor `src/db.js` into repositories by bounded context** (`TripsRepository`, `OAuthRepository`, `ReminderRepository`, `FeedbackRepository`).
2. **Separate fallback storage strategy** behind an interface (`StorageProvider`) so tests can inject in-memory implementations.
3. **Isolate playlist domain logic** from Spotify API by introducing a `RecommendationProvider` adapter interface.
4. **Expand unit tests for pure domain functions** and add API contract tests for route boundaries.

### Priority 2 (4+ sprints)
1. **Move long-running or batch-like operations to queue workers** (dispatch reminders, trip refresh loop).
2. **Add idempotency keys** for mutating endpoints sensitive to retries.
3. **Introduce event-driven integration points** (domain events: `TripParsed`, `PlaylistGenerated`, `ReminderDispatched`).
4. **Define SLOs and operational dashboards** per module.

## Coding-level improvements

1. **Avoid mutable shared in-memory auth state for scale-out paths** and move OAuth state to signed stateless token or shared cache.
2. **Standardize DTOs** between controllers and services to prevent transport-specific leakage.
3. **Extract repeated auth checks** (internal API key verification) into middleware.
4. **Convert business constants to module-level config objects** with single ownership.
5. **Add dependency injection entrypoints** for services to improve testability and decouple from concrete adapters.

## Scalability guidance

### Horizontal scaling
- Ensure all state required across requests is externalized (DB/cache), not process-local.
- Keep route handlers stateless and idempotent where possible.

### Data and throughput scaling
- Use explicit indexes for high-frequency query patterns in reminders and trip refresh windows.
- Introduce pagination defaults/limits consistently in list endpoints.
- Track slow query metrics and add query budget thresholds in CI or observability alerts.

### Team scaling
- Adopt per-module ownership and CODEOWNERS rules by folder.
- Require ADRs for new cross-module patterns and external integrations.
- Keep module README files documenting purpose, contracts, and invariants.

## Suggested migration plan

### Phase 1: Safety rails
- Add validation + error middleware + logging correlation IDs.
- Add smoke tests for all critical endpoints.

### Phase 2: Structural extraction
- Move one domain at a time from `index.js` to `modules/*` (start with trips + feedback).
- Keep backwards-compatible routes and response payloads.

### Phase 3: Infrastructure hardening
- Split persistence layer into repositories.
- Introduce queue-backed worker for reminders/refresh tasks.

### Phase 4: Platform maturity
- Eventing, SLO dashboards, alerting playbooks, and chaos/failure drills for external dependencies.

## Metrics to track progress
- Time-to-merge and change failure rate by module.
- Test coverage for domain logic vs route handlers.
- Mean time to diagnose incidents.
- P95 latency and error rate per endpoint group.
- Deployment frequency without rollback.

## Final recommendation
Do not pursue a full rewrite. Instead, perform a staged modularization focused first on boundary clarity (validation/errors/logging), then ownership clarity (modules/repositories), then throughput and reliability (queues/events/observability). This sequence minimizes delivery risk while materially improving maintainability and scale readiness.
