# Data Model & Integration Contracts

This document defines the structured data we will capture from each upstream source and how that data feeds the playlist-building, tagging, and notification systems.

## Guiding principle
We want a canonical `Trip` object that includes: departure/arrival nodes, duration, transportation type, intermediate legs, mood tags (family/couple/solo/kids), and optional environmental context (weather, delays). The Spotify playlist builder, reminder scheduler, and notification payloads will all reference this canonical shape.

## 1. SBB / Transport API (`transport.opendata.ch`)
| Field | Description | Notes |
|-------|-------------|-------|
| `from.station.name` | Departure station name (e.g., `Lausanne`). | Display to users; map to localised language if needed. |
| `from.departure` | ISO timestamp with timezone (departure time). | Key for scheduling notifications. |
| `from.prognosis.platform` | Predicted platform/track. | Useful for quick glance card preceding departure. |
| `to.arrival` | Arrival timestamp. | Derive total journey duration. |
| `connections[].sections` | Array of legs (train, bus, walking). | Each leg has `departure`, `arrival`, `journey` metadata. We can map each to a mood segment (e.g., intercity leg vs. tram). |
| `sections[].journey.name` | Train/bus number (e.g., `IC 5`). | Displayed as part of itinerary summary. |
| `sections[].journey.category` | Type (IC, IR, RE). | Helps determine pacing for playlist transitions (fast vs. calm). |
| `sections[].prognosis` | Live updates (platform, capacity). | If the departure shifts, we can rerun playlist builder & reschedule reminders. |
| `from.platform`, `to.platform` | Static platforms. | Shown in reminder notifications. |
| `connections[].duration` | Journey duration in seconds. | Input to tempo algorithm (longer journeys → longer playlists). |

We will store the raw JSON for telemetry/audit but also surface the trimmed fields above for the playlist pipeline.

## 2. Google Maps data
| Field | Description | Notes |
|-------|-------------|-------|
| `origin` / `destination` | Coordinates or Place IDs from the shared URL (`origin_place_id`, `destination_place_id`). | We can call the Directions API to translate Place IDs to names if they are not human-friendly. |
| `travelmode` | `transit`, `driving`, `walking`, `bicycling`. | Use to bias playlist genre: driving → upbeat, walking → ambient. |
| `waypoints` | Intermediate stops. | Each waypoint can be annotated with local highlights (e.g., from discover.swiss). |
| `duration` | Estimated travel time per segment (if available). | Aggregate to total duration.
| `steps` | Step-by-step instructions (if we fetch via Directions API). | Optionally highlight key segments (like “Tunnel under lake” vs. “City center”). |
| `polyline` | Encoded path for visualization. | Could be used for UI or to detect scenic stretches. |
| `distance` | Distance per segment. | Feed into mood heuristics—long distances may lean to epic playlists. |

If we augment share links with a Directions API call, we also get `arrival_time`, `departure_time`, and `end_location` with human-readable names.

## 3. Spotify playlist inputs/outputs
| Role | Field | Description |
|------|-------|-------------|
| Input | `seed_artists`, `seed_genres`, `seed_tracks` | Provided by mood heuristics (e.g., “family” tag → upbeat pop). |
| Input | `target_tempo`, `target_valence`, `target_energy` | Derived from trip duration, time of day, and tags. |
| Output | `playlist_id`, `playlist_uri`, `external_urls.spotify` | Provided in the response to `POST /playlists` and `GET /playlists/{id}`. |
| Output | `added_tracks` | IDs of tracks we inserted; tracked for later analytics or refresh. |

The playlist builder will store the Spotify metadata alongside the trip document so we can bundle it into reminders.

## 4. Trip tags & metadata
We allow users to tag the trip with descriptors that influence how we map mood curves:
- **Family** – gentle, high-valence selections, avoid explicit lyrics.
- **Couple** – romantic, lush instrumentation; consider slower tempos near dusk segments.
- **Solo** – introspective playlists with focus-friendly tracks during long work trips.
- **Kids** – upbeat, kid-friendly selections with active instrumentation.
- **Celebration / Relax** – custom tags used to bias energy/valence.

Each tag can store a JSON object of overrides (tempo, instrumentation, allowed genres). Tags live in the canonical `Trip` object and are referenced when hitting Spotify recommendations.

## 5. Notification scheduler inputs
To build reminders we will reference:
- `departure_time` (either from Spotify share or parsed schedule).
- `platform` and `station` names for contextual message (“Platform 7 at Lausanne”).
- `playlist_url` (Spotify link) to surface as the CTA in the notification.
- `delay_buffer` (e.g., 10 min before departure). We can allow users to customize this per trip.

If we detect schedule changes (via periodic poll or share update), we reschedule the reminder and optionally append an “updated playlist” card.

## Conclusion
With this data model, the backend can normalize disparate trip sources into a single object that feeds the playlist builder and notifier. The next engineering phase is to implement the ingestion adapters (link parser, optional OAuth clients) and the playlist service that consumes these fields.
