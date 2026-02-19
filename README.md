# Rynno

Rynno is a trip-aware playlist companion that turns shared SBB, Google Maps, or auto-fetched journeys into curated Spotify playlists and timely notifications. The goal is to blend transportation schedules with soundtrack moods, giving travelers a seamless way to prep the right music for every leg of their trip.

## Vision
1. Capture journey metadata (start, end, transfers, duration, tags such as family/couple/solo) either by parsing shared links or through OAuth-backed integrations.
2. Use that context to map moods/moments to Spotify playlists, keeping playback inside Spotify while our backend orchestrates the experience (playlist creation, reminders, updates).
3. Notify travelers before departure so they can launch the playlist, and optionally update it mid-trip if the route shifts.

## This repository
- `docs/oauth-flows.md` – detailed feasibility and sequence diagrams for Spotify, Google, and SBB/SwissPass authentication and token handling.
- `docs/data-points.md` – professional breakdown of the structured metadata we can pull from each platform plus the data we will feed into the playlist builder and notification scheduler.
- `docs/playlist-builder.md` – editorial mood heuristics, seed catalog, and guardrails that inform the backend orchestration.

## Playlist Builder API
We expose a single POST endpoint that consumes the canonical trip payload and requested mood hints, runs our seed + guardrail engine, and surfaces a Spotify playlist reference.

### Endpoint
```
POST /api/v1/playlists/generate
```
Payload (JSON):
```json
{
  "trip": {
    "tracks": [], // canonical trip object (legs, tags, preferredRegions, firstDeparture, etc.)
    "tags": ["family", "celebration"],
    "preferredRegions": ["Lake Geneva"],
    "firstDeparture": "2026-02-25T17:00:00Z",
    "legs": [ { "mode": "IC", "departureStation": "Zürich HB", "arrivalStation": "Lausanne" } ]
  },
  "preferences": {
    "moodHints": { "calm": true, "surprise": true },
    "eraPreference": "heritage"
  },
  "spotify": {
    "accessToken": "...",
    "refreshToken": "..." // optional if we can refresh on the server
  }
}
```
The builder uses the trip tags/time-of-day to compute `targetEnergy`, `targetValence`, instrumentation cues, and era bias, selects the top clusters (Heritage grooves, Widescreen travel, etc.), and calls Spotify's Recommendations API. Guardrails validate lyrical safety, energy, and instrumentation, rerunning the request with adjusted seeds if needed. The playlist summary includes seed genres, guardrail outcomes, region surprises, and the final track order.

Response sample:
```json
{
  "success": true,
  "data": {
    "playlistId": "...",
    "playlistUrl": "https://open.spotify.com/playlist/...",
    "playlistName": "Rynno • Zürich HB → Lausanne",
    "moodProfile": { "targetEnergy": 0.62, "instrumentationCue": "percussion" },
    "seeds": {
      "genres": ["pop", "dance", "soundtrack"],
      "summary": ["dance", "pop", "soundtrack"],
      "clusters": ["playful", "widescreen"]
    },
    "tracks": [ { "position": 1, "name": "...", "artists": ["..."], "regionSurprise": false }, ... ]
  }
}
```
Guardrail metadata shows whether the playlist passed safety checks on the first attempt or required reweighting.

## Next steps
- Finalize the OAuth scopes and token lifecycle so the UX can offer both manual share and seamless auto-import experiences.
- Define the data contracts that feed the playlist mood mapper and reminder scheduler so we can prototype the backend API.
- Once the docs are approved, we can spin up the actual services (Spotify OAuth server, trip parsers, notifier).

## Local development

```bash
pnpm install # or npm install
pnpm start   # or npm start
```

## Parser ingestion service

The backend now exposes a lightweight parser ingestion API that can run on Render (see `render.yaml`). It understands Swiss SBB share URLs plus free-text manual entries and normalizes them into the canonical trip schema defined in `docs/parser-spec.md`.

### Endpoints

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/v1/trips/ingest` | `POST` | Send a share URL or manual trip payload plus optional metadata (`tags`, `preferredLanguages`, `preferredRegions`). Returns `tripId` and normalized trip data. |
| `/api/v1/trips/:tripId/status` | `GET` | Check parse status plus validation errors. |
| `/api/v1/trips/:tripId/refresh` | `POST` | Rerun the adapter for an existing trip (used by cron workers or retry flows). |

### Sample SBB share payload

```json
{
  "source": "sbb",
  "metadata": {
    "tags": ["family"],
    "preferredLanguages": ["fr", "en"]
  },
  "payload": {
    "url": "https://www.sbb.ch/en/timetable.html?nach=Lausanne&von=Z%C3%BCrich&date=20260225&time=17:00"
  }
}
```

### Manual entry payload

```json
{
  "source": "manual",
  "metadata": {
    "tags": ["solo"],
    "preferredRegions": ["Swiss Alps"]
  },
  "payload": {
    "from": "Bern",
    "to": "Interlaken",
    "date": "2026-05-19",
    "time": "08:30",
    "durationMinutes": 90,
    "mode": "train"
  }
}
```

The ingestion service keeps a simple in-memory store of each trip’s canonical output, status, and any parse errors (see `/trips/:tripId/status`). When deployed on Render this is the API that the PWA, cron refresh workers, and notification schedulers call to keep playlists in sync with real-world journeys.

<!-- Dummy PR test placeholder -->
