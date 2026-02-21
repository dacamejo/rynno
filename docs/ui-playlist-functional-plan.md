# UI Execution Plan: Make Playlist Generation Real + Premium UX

## Current evaluation

The backend playlist generation pipeline is available (`POST /api/v1/playlists/generate`), but the current UI still uses a prototype playlist panel with mock tracks and explicit copy saying live generation is not wired. The “Regenerate playlist” action currently refreshes trip status rather than invoking playlist generation.

### Key gaps
- **No true UI→playlist generation API wiring** (refresh endpoint is called instead).
- **No generated playlist state model** (idle/loading/success/error/retry).
- **No real result rendering** (cover art, tracklist, Spotify deep-link, guardrail context).
- **No resilient UX for auth/token and request retries**.
- **No UX instrumentation loop tied to generation outcomes in the UI layer**.

## Top 5 next steps (priority order)

## 1) Wire real playlist generation from the trip review screen

**Goal:** Replace prototype “regenerate” behavior with an actual call to `POST /api/v1/playlists/generate`.

**Implementation scope**
- Create a client payload mapper from parsed trip + selected preferences/chips/mood to the playlist API request shape.
- Resolve Spotify token context for the request path (using existing OAuth flow/session data).
- Use idempotency keys for button-triggered generation attempts to prevent accidental duplicate playlists.
- Keep `trips/:tripId/refresh` as a separate action (“Refresh trip timing”), not the generation button behavior.

**Definition of done**
- Pressing `Regenerate playlist` triggers real generation and returns a persisted playlist response.
- The primary CTA updates from “Regenerate playlist” to contextual labels (`Generate`, `Regenerate`, `Retry`) based on state.

## 2) Build a robust playlist generation state machine in the UI

**Goal:** Ensure predictable, polished behavior under success/failure/latency.

**Implementation scope**
- Add explicit UI states: `idle`, `submitting`, `success`, `partial_success` (guardrail recovered), `error_auth`, `error_validation`, `error_network`.
- Prevent duplicate clicks while in `submitting` and provide cancellation/back navigation support.
- Surface user-friendly errors with suggested actions:
  - Reconnect Spotify
  - Adjust preferences
  - Retry generation
- Persist latest successful playlist per trip in local cache for quick re-open.

**Definition of done**
- Every generation outcome maps to a deterministic UI state.
- Users always see a clear next action after failures.

## 3) Replace mock playlist panel with real storytelling output

**Goal:** Render real generated data while matching the premium UX spec.

**Implementation scope**
- Display real playlist metadata: title, description/story copy, duration estimate, playlist URL, cover image, tracks.
- Render track cards from the API response and include lightweight quality signals (energy/valence labels where present).
- Add actionable CTAs: `Open in Spotify`, `Copy link`, `Email playlist` (or hide unsupported actions with clear status).
- Preserve graceful empty states when the API returns limited data.

**Definition of done**
- No mock playlist text remains in production path.
- The panel always represents real data (or explicit fallback copy) for the active trip.

## 4) Tighten preference UX + generation controls for confidence and delight

**Goal:** Make user input feel intentional and reduce failed generations.

**Implementation scope**
- Normalize companion chips/tags and language-region toggles into a single “playlist preferences” section.
- Add inline summaries (“You’re generating: Family · English · Alps · Calm sunset”).
- Pre-submit validation hints before network call (e.g., Spotify not connected, missing trip).
- Add micro-interactions: progress shimmer, optimistic button transitions, accessible live-region updates.

**Definition of done**
- Users can understand exactly what will influence generation before they submit.
- Perceived responsiveness is improved without hiding errors.

## 5) Add UI observability, experiment hooks, and release gates

**Goal:** Ensure quality and continuous iteration after launch.

**Implementation scope**
- Emit frontend events for generation funnel steps:
  - click_generate
  - generate_success
  - generate_failure (typed reason)
  - open_spotify_click
  - retry_generate
- Add contract test coverage for the UI-request payload builder and API response rendering guards.
- Add end-to-end happy-path and auth-failure UI tests.
- Define release gates for launch:
  - success rate target
  - median generation time target
  - retry recovery rate target

**Definition of done**
- Team can measure where generation UX fails and iterate safely.
- UI rollout is protected by automated checks and basic SLO-style thresholds.

## Suggested rollout sequence

- **Phase A (1 sprint):** Steps 1 + 2 (functional wiring + reliable state handling).
- **Phase B (1 sprint):** Step 3 + key parts of Step 4 (real rendering + polished controls).
- **Phase C (ongoing):** Step 5 + remaining Step 4 polish (instrumentation, experiments, tuning).

## Acceptance checklist for “UI ready for real playlist generation”

- [ ] Generate button uses `/api/v1/playlists/generate` with valid payload and token context.
- [ ] Playlist panel renders real API response, not mock rows.
- [ ] Auth, validation, and network failure states are handled with explicit recovery actions.
- [ ] Open-in-Spotify flow works on mobile viewport.
- [ ] Frontend telemetry captures generation funnel outcomes.
- [ ] E2E tests pass for happy path + one major failure path.
