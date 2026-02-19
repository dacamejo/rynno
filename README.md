# Rynno

Rynno is a trip-aware playlist companion that turns shared SBB, Google Maps, or auto-fetched journeys into curated Spotify playlists and timely notifications. The goal is to blend transportation schedules with soundtrack moods, giving travelers a seamless way to prep the right music for every leg of their trip.

## Vision
1. Capture journey metadata (start, end, transfers, duration, tags such as family/couple/solo) either by parsing shared links or through OAuth-backed integrations.
2. Use that context to map moods/moments to Spotify playlists, keeping playback inside Spotify while our backend orchestrates the experience (playlist creation, reminders, updates).
3. Notify travelers before departure so they can launch the playlist, and optionally update it mid-trip if the route shifts.

## This repository
- `docs/oauth-flows.md` – detailed feasibility and sequence diagrams for Spotify, Google, and SBB/SwissPass authentication and token handling.
- `docs/data-points.md` – professional breakdown of the structured metadata we can pull from each platform plus the data we will feed into the playlist builder and notification scheduler.

## Next steps
- Finalize the OAuth scopes and token lifecycle so the UX can offer both manual share and seamless auto-import experiences.
- Define the data contracts that feed the playlist mood mapper and reminder scheduler so we can prototype the backend API.
- Once the docs are approved, we can spin up the actual services (Spotify OAuth server, trip parsers, notifier).

## Local development

```bash
pnpm install # or npm install
pnpm start   # or npm start
```
