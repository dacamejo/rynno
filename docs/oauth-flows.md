# OAuth & Authorization Blueprint

This document catalogs the authorization landscape for each upstream service we plan to integrate. The goal is to understand which platforms require OAuth (versus share-based data) and what scopes/endpoints we need to request so the experience feels automatic for users.

## Key principles
- **Spotify:** mandatory OAuth. Playlist creation, recommendations, and user-specific metadata all require user consent. February 2026 changes tighten developer-mode usage, so we need to follow the new scopes and potentially upgrade to extended quota for production.
- **SBB / SwissPass:** no public OAuth for itinerary data today. We can rely on trip-sharing/magic-link parsing for the MVP while keeping SwissPass OAuth on the backlog if/when a scope for trips appears.
- **Google Maps:** share URLs provide a quick ingest path, but the Maps Platform now optionally supports OAuth if we want to read saved trips automatically via Directions/Timeline APIs.

---

## 1. Spotify Web API
- **Authorization flow:** Authorization Code flow (`/authorize` → `/callback` → `/api/token`).
- **Required scopes:**
  - `playlist-modify-private` (create & populate playlists)
  - `playlist-modify-public` (if we support publicly shared playlists)
  - `user-read-private` (basic profile metadata)
  - `user-library-read` / `user-library-modify` via the new generic `/me/library` endpoints if we want to bookmark mood anchors.
  - `user-read-email` (optional for account linking).
- **Migration notes (Feb 2026):** Development-mode apps now require the owner to have Spotify Premium, are limited to a single client ID per developer, and can support only five test users unless extended quota is granted. Playlist track management endpoints were renamed from `/tracks` to `/items`, and the library endpoints became a single `/me/library` endpoint that accepts Spotify URIs instead of typed IDs. Bulk fetches (e.g., `/tracks?ids=`) were removed, so we must fetch metadata per track. [Sources: Spotify migration guide; TechCrunch article on tightened API limits.]
- **Data we consume:** playlist creation (`POST /playlists`, `POST /playlists/{id}/items`), track recommendations (`GET /recommendations`), user profile (`GET /me`).
- **Token lifecycle:** store refresh tokens to keep access alive since playlist creation might happen after the initial login.

## 2. Google Maps direction data
- **Share-based ingest:** Google Maps URLs (`https://www.google.com/maps/dir/?api=1&parameters`) can be forwarded via the share sheet. They encode origin/destination, travel mode, waypoints, and optionally `travelmode` (walking, driving, transit). No API key or OAuth is required for these URLs, which makes for a low-friction fallback.
- **Optional OAuth path:** collecting a richer travel history requires a Google Cloud API key plus OAuth consent to access the Maps Platform (Directions API, Timeline API). With consent we can poll saved trips or allow the user to export upcoming journeys without manual sharing. This path also lets us annotate the trip with place IDs, encoded polyline data, and stop sequences.
- **Scopes & credentials:** using OAuth implies `https://www.googleapis.com/auth/maps` scopes depending on the product. For Directions we usually rely on API keys, but reading personal timeline data requires `https://www.googleapis.com/auth/location.history.readonly` or similar (if available). We will review Google’s developer documentation to confirm the exact scope(s) before implementation.

## 3. SBB / SwissPass itinerary data
- **Current state:** `transport.opendata.ch` exposes the connection data we need (`/connections`, `/locations`, `/stationboard`, etc.) without any OAuth. The API returns departure/arrival timestamps, platforms, real-time prognoses, and leg-level transportation metadata.
- **SwissPass OAuth (future):** SwissPass is the identity layer for SBB. If/when they publish an OAuth scope for personal itineraries, we would store the access token on the backend and poll their protected endpoint for upcoming trips (instead of relying on manual share links). Until such documentation appears, we treat this as a backlog item.
- **Implementation fallback:** parse any share link or manual input to reconstruct the `from`, `to`, `date`, and `time` parameters, then call `/connections` to fetch the route data.

## Summary table
| Platform | OAuth required | Key scopes | Notes |
|----------|----------------|------------|-------|
| Spotify | **Yes** | `playlist-modify-private`, `playlist-modify-public`, `user-read-private`, `user-library-read` | Feb 2026 migration requires premium and limited dev/test quotas; also new `/me/library` and `/playlists/{id}/items` endpoints. |
| Google Maps | Optional | Maps Platform / Timeline scopes when reading saved trips | Share URLs work without auth; OAuth enhances automation. |
| SBB/SwissPass | Not yet (public) | Future SwissPass scope TBD | Use share link parsing for now; keep SwissPass OAuth planning document ready. |

## Next steps
1. Draft the OAuth user journey diagrams for Spotify and optional Google/SwissPass flows so we can hand them off to the backend team.
2. List all tokens and refresh behaviors per platform (a token table can live in the backlog once MVP is greenlit).
3. Confirm the Spotify developer account upgrade path to extended quota before building features that depend on >5 users.
