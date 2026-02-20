# Rynno

Rynno is a trip-aware playlist companion platform. It combines a mobile-first app experience (starting as a PWA and evolving toward native mobile) with backend services that turn shared SBB and Google Maps journeys into curated Spotify playlists and timely reminders.

## About this repository
This repository contains the current product foundation for Rynno, including both **user-facing app surfaces** and **backend orchestration**:

- **Mobile-first app layer (PWA today):** share-target entry points, client app shell, and onboarding flows.
- **Trip parsing and normalization:** ingestion logic for shared journey links and metadata enrichment.
- **Mood heuristics + playlist building:** logic that maps trip context into Spotify-ready listening plans.
- **Reminder scheduling:** services to notify users before departure and react to itinerary changes.
- **Architecture and product docs:** OAuth flows, UX, infrastructure, roadmap, and future native-app direction.

In short: this codebase is the end-to-end Rynno platform, with a backend-first implementation that supports a growing mobile product.

## Vision
1. Capture journey metadata (start, end, transfers, duration, tags such as family/couple/solo) either by parsing shared links or through OAuth-backed integrations.
2. Use that context to map moods/moments to Spotify playlists, keeping playback inside Spotify while our backend orchestrates the experience (playlist creation, reminders, updates).
3. Deliver a polished mobile experience: first as a high-quality PWA, then as a native app shell when product-market fit is validated.

## Repository map
- `public/` – frontend PWA assets, app shell scripts, manifest, service worker, and share-target pages.
- `index.js` – Express server entry point and API wiring.
- `services/` – domain services (playlist generation, recommendation provider, reminders, Spotify client integration).
- `src/` – shared utilities (trip parsing, token crypto, DB access).
- `tests/` – API and domain tests for playlist logic, mood engine behavior, scheduler behavior, and contracts.
- `docs/` – product, architecture, UX, OAuth, PWA plan, and roadmap documents (including native-app evolution).

## Next steps
- Finalize OAuth scopes and token lifecycle so the UX can offer both manual share and seamless auto-import experiences.
- Expand mobile-first UX implementation from docs into production-ready screens and flows.
- Keep backend contracts stable so the PWA and future native wrapper can reuse the same trip, playlist, and reminder APIs.

## Local development

```bash
pnpm install # or npm install
pnpm start   # or npm start
```

### Required Spotify OAuth environment variables

Spotify OAuth is a **3-party flow**: user + your app + Spotify. Even though the user logs in and grants consent, Spotify still requires your backend to identify the app that initiated the flow.

Set these variables before starting the server:

```bash
SPOTIFY_CLIENT_ID=your_spotify_app_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_app_client_secret
```

- `SPOTIFY_CLIENT_ID` is sent on `/auth/spotify` so Spotify can show consent for your registered app.
- `SPOTIFY_CLIENT_SECRET` is used server-side when exchanging auth codes for tokens (never expose it in frontend code).

## Database migrations

```bash
npm run db:migrate
```

The migration runner applies all SQL files in `db/migrations/` and tracks execution in `schema_migrations`.
