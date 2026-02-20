# Render ingestion service

The parser ingestion service is Rynno’s entry point for trip data. It runs on Render as the `rynno-parser` web service (see `render.yaml`) and exposes the canonical schema that the playlist builder, notification scheduler, and UI expect.

## Service shape

- **Type:** Render Web Service (Node). It listens on `$PORT` and responds to `/health` for readiness.
- **Entrypoint:** `npm start` runs `index.js`, which now wires the parser adapters (`src/tripParser.js`) to the REST API.
- **Health check:** `/health` returns `200` and can be used as Render’s health endpoint so deployments fail fast when the parser code breaks.
- **Autoscaling:** On Render the service can autoscale horizontally; since parsing is CPU-light, start with the `starter` plan and raise concurrency if needed.

## API contract

This service implements the parser routes described in `README.md`:

1. `POST /api/v1/trips/ingest` – accepts `{ source, metadata, payload }`. `source` is either `sbb` or `manual`, and `payload` contains the share URL or manual fields (`from`, `to`, `date`, `time`, etc.). Metadata can include tags, languages, and preferred regions.
2. `GET /api/v1/trips/:tripId/status` – returns the stored canonical result (or any parse errors) for the given `tripId`.
3. `POST /api/v1/trips/:tripId/refresh` – reruns the adapter against the saved raw payload, allowing cron jobs or webhooks to recover from timetable changes without manual intervention.

The service keeps a simple in-memory map (`tripStore`) so each trip can be refreshed repeatedly. When Render scales out, sticky sessions are not required because the UI/callers can re-run `/ingest` to get the latest `tripId` and canonical JSON; for production we can swap `tripStore` for Postgres/Redis persistence.

## Adapters

- **SBB share adapter:** parses `www.sbb.ch` share URLs, calls `transport.opendata.ch` for legs, and falls back to estimated legs if the API is unreachable.
- **Manual adapter:** costs a single estimated leg using the provided date/time/mode; useful for travelers who type their journey or when the share URL is missing.

Both adapters emit the `Trip` canonical schema (legs with `energyCue`, `durationSeconds`, `platform`, etc.), compute locale/region/language hints, and attach metadata such as `confidenceScore` and `delayInfo`.

## Render configuration

`render.yaml` defines the web service:

- `buildCommand: npm install`
- `startCommand: npm start`
- `healthCheckPath: /health`
- `env: node`, `plan: starter` (adjust the plan for production volume)
- `envVar NODE_ENV=production`

Add any future secrets (Spotify, Google, etc.) as Render Environment Group variables.

## Cron workers & refresh loop

Render Cron Jobs can hit `POST /api/v1/trips/:tripId/refresh` whenever we detect imminent departures (`firstDeparture`). Cron jobs should read from the database (once persisted) and refresh active trips every 5–15 minutes to keep prognosis, delays, and playlist timings accurate.

## Observability

- Log adapter failures via `console.error` (Render captures these logs).
- Render’s deployment alerts notify the team if `/health` stops returning `200`.
- When we add persistence, extend the API to emit telemetry (parse duration, success/failure, confidence scores) for dashboards.
