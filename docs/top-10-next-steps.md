# Top 10 Implementation Next Steps Toward the Rynno Vision

This prioritized to-do list translates the current product vision and architecture docs into concrete implementation work.

## 1) ✅ Ship PWA share-target ingestion end-to-end *(completed)*
- **Why now:** The primary entry point in the vision is “Share ➜ Choose Rynno ➜ Get playlist.”
- **Deliverables:**
  - Add `share_target` config to web manifest.
  - Implement service worker POST interception and payload persistence.
  - Build `/share-target` route with loading, success, and fallback manual states.
- **Definition of done:** A user can share from SBB/Google and land in Rynno with parsed trip data prefilled.
- **Status update:** Implemented via `manifest.webmanifest` share target config, `sw.js` POST interception + payload cache persistence, and `/share-target` route with loading/success/fallback manual ingest states.

## 2) ✅ Harden parser adapters for SBB + Google with confidence scoring *(completed)*
- **Why now:** Reliable trip normalization is the foundation for both playlists and reminders.
- **Deliverables:**
  - Complete source-specific adapters for SBB URL parsing and Google Maps direction links.
  - Add validation pipeline and confidence scoring (<70 prompts for manual correction).
  - Store canonical + raw payload consistently for debugging.
- **Definition of done:** Ingest success rate and parse quality telemetry are available for both sources.
- **Status update:** Added source-specific Google Maps adapter support plus enhanced SBB share-link parsing, implemented parser validation with confidence-based manual correction flags (<70), and standardized canonical metadata persistence with raw payload + parser diagnostics.

## 3) ✅ Implement relational persistence model and migrations *(completed)*
- **Why now:** The docs call for durable trip/user/token/reminder records; current progress depends on stable schema.
- **Deliverables:**
  - Add migration tooling and initial schema (`users`, `trips`, `trip_legs`, `oauth_tokens`, `spotify_playlists`, `reminders`).
  - Add indexes for scheduler and query performance.
  - Add pre-deploy migration execution in deployment config.
- **Definition of done:** Database is source-controlled, reproducible, and supports full lifecycle data.
- **Status update:** Added source-controlled SQL migrations with the initial relational schema (`users`, `trips`, `trip_legs`, `oauth_tokens`, `spotify_playlists`, `reminders`) plus scheduler/query indexes, introduced a migration runner script with `schema_migrations` tracking, and wired Render pre-deploy migration execution via `npm run db:migrate`.

## 4) ✅ Complete Spotify OAuth + token lifecycle service *(completed)*
- **Why now:** Playlist creation cannot scale without secure auth and refresh handling.
- **Deliverables:**
  - Implement `/auth/spotify` and callback state validation.
  - Persist encrypted token material and metadata.
  - Add refresh job + invalid token re-auth signaling.
- **Definition of done:** Connected user can authorize once and continue generating playlists without manual re-login until refresh revocation.
- **Status update:** Added Spotify Authorization Code endpoints (`/auth/spotify`, `/auth/spotify/callback`) with expiring state validation, encrypted token persistence for `oauth_tokens`, a protected refresh endpoint (`/api/spotify/refresh`) with re-auth signaling on invalid grants, and token metadata diagnostics via `/api/spotify/tokens/:userId`.

## 5) ✅ Build v1 mood mapper + seed orchestration engine *(completed)*
- **Why now:** The core value is “trip-aware, editorial-feeling playlists,” not just generic recommendations.
- **Deliverables:**
  - Encode `target_energy`, `target_valence`, `era_bias`, and instrumentation rules.
  - Create seed-cluster selection logic and weighted recommendation requests.
  - Version heuristics (`RhythmProfile_v1`) for safe tuning.
- **Definition of done:** Playlist generation reflects trip timeline + tags in a repeatable, measurable way.
- **Status update:** Added explicit `RhythmProfile_v1` versioning in the mood profile response, expanded seed orchestration with weighted multi-cluster recommendation plans, and covered the v1 mood engine with automated unit tests for profile outputs and weighted plans.

## 6) ✅ Add playlist quality guardrails and auto-rerun logic *(completed)*
- **Why now:** Premium UX depends on trust in first tracks and tag fit.
- **Deliverables:**
  - Pre-flight checks for explicitness, energy alignment, language fit, and first-track quality.
  - Automatic re-weight/retry path when guardrails fail.
  - Logging fields to analyze guardrail failures by tag/context.
- **Definition of done:** Family/kids and tag-sensitive playlists meet guardrail thresholds before delivery.
- **Status update:** Expanded guardrails to validate language-fit and first-track quality in addition to explicitness/energy/instrumentation, added auto re-weighting retries that enrich seed genres when checks fail, and now return per-attempt guardrail telemetry (tags, time segment, language preference, instrumentation cue) for context-driven analysis.

## 7) Implement reminder scheduler + delay-aware refresh loop
- **Why now:** Timely reminders are a core promise and key differentiator.
- **Deliverables:**
  - Build reminder creation, queueing, dispatch, and status tracking.
  - Add periodic trip refresh job for prognosis/delay updates.
  - Trigger optional playlist refresh for meaningful timing changes.
- **Definition of done:** User receives accurate pre-departure reminder with playlist link and updated timing context.

## 8) Deliver mobile-first core UI screens from UX spec
- **Why now:** Adoption depends on a polished flow from trip review to Spotify handoff.
- **Deliverables:**
  - Build hero/share landing, loader, trip review, playlist panel, and settings/history views.
  - Implement tags, language/region toggles, and regenerate/schedule actions.
  - Add responsive states, accessibility checks, and motion polish.
- **Definition of done:** End-to-end prototype is usable on narrow mobile viewports and matches premium UX goals.

## 9) Add feedback and learning loop instrumentation
- **Why now:** The docs rely on post-trip signals to improve heuristics and reduce mismatch.
- **Deliverables:**
  - Capture thumbs up/down, optional feedback text, and regeneration events.
  - Track parse success, playlist guardrail failures, skips (where available), and reminder outcomes.
  - Add basic dashboards and event timeline for iteration decisions.
- **Definition of done:** Product and heuristic tuning decisions can be made from real usage data.

## 10) Productionize Render deployment, observability, and release gates
- **Why now:** Reliable operations are required before broader rollout.
- **Deliverables:**
  - Define Render services (web, cron, postgres), env groups, and secrets rotation patterns.
  - Add smoke tests for ingest + OAuth handshake in deployment flow.
  - Configure health checks, alerting, and log correlation IDs.
- **Definition of done:** Deployments are repeatable, monitored, and blocked when critical workflows regress.

---

## Suggested implementation order
1. Parser hardening (item 2)
2. Persistence + OAuth (items 3–4)
3. Playlist engine + guardrails (items 5–6)
4. Reminders + UI flow (items 7–8)
5. Feedback loop + production ops (items 9–10)

## Suggested 30-60-90 execution framing
- **First 30 days:** 2, 3, 4
- **By day 60:** 4, 5, 6, 8
- **By day 90:** 7, 9, 10
