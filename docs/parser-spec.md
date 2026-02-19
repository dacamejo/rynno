# Trip Parser Specification

This document captures the parser design so we can reliably turn incoming journeys into the canonical trip object that feeds the playlist builder and notifications. We start from Switzerland (SBB + Google Maps shares) and keep the spec open to other EU rail providers later.

## Goals
1. **Robust ingestion:** accept shared trip data (SBB share URL, Google Maps directions, app-native input) and transform it into the same structured fields.
2. **Controlled Swiss-first rollout:** rely on Switzerland’s high-quality transport data (transport.opendata.ch) while maintaining hooks for other operators (SNCF, Trenitalia, etc.) when we expand.
3. **Prefilled context:** add metadata such as preferred regions/languages, tags, and demographics before sending to the playlist builder.

## 1. Input adapters
| Source | Input format | Key data we extract | Enrichment steps |
|--------|--------------|--------------------|------------------|
| **SBB share URL** | URL containing `fromStation`, `toStation`, `date`, `time` (e.g., `https://www.sbb.ch/en/timetable.html?nach=Lausanne&von=Z%C3%BCrich&date=20260225&time=17:00`). | `from`, `to`, `date`, `time`, optional journey IDs. | Call `http://transport.opendata.ch/v1/connections` with the parsed params to fetch `connections[].sections`, timestamps, platforms, modes, and prognosis. Extract planned vs. real-time data for updates. Map Swiss transport categories (IC, IR, S-Bahn) to tempo cues. Add Swiss-specific metadata (region: Western/Alpine/Italian-speaking). |
| **Google Maps share** | Maps URL (`/dir/?api=1&origin=...&destination=...&travelmode=transit`). | Origin/destination coordinates/place IDs, travel mode, waypoints. | Translate place IDs into station names (via Google Places API if needed). If we need more detail, call Directions API (API key) to pull `steps`, polyline, durations, and arrival/departure info. Map travel mode (transit/driving) to instrumentation cues. |
| **Manual entry** | User-provided origin/destination/time + optional transport provider selection. | Same as above. | Choose best API per chosen country (SBB for Switzerland, SNCF for France). If no provider is selected, default to Swiss dataset for Swiss addresses. |

## 2. Canonical trip schema (output)
- `tripId`: UUID.
- `source`: `sbb`, `google`, `manual`, `sncf`, etc.
- `locale`: e.g., `de-CH`, `fr-CH`, `it-CH` (derived from route/region).
- `preferredLanguages`: user preference list (e.g., [`fr`, `en`]).
- `preferredRegions`: e.g., `Alps`, `Lake Geneva`, `Italian-speaking Switzerland`.
- `tags`: `family`, `couple`, `solo`, `kids`, `celebration`, `no-preference`.
- `legs`: array of objects `{ mode, departureTime, arrivalTime, durationSeconds, departureStation, arrivalStation, platform, serviceName, energyCue }` where `energyCue` is derived from transport type (e.g., `IC=high energy`, `S-Bahn=mid`).
- `totalDurationSeconds`, `firstDeparture`, `finalArrival`, `distanceMeters` (when available).
- `weatherContext` (optional, from external API), `delayInfo` (real-time prognosis from `transport.opendata.ch`).

## 3. Swiss-focus enrichment
- Use region maps (e.g., Lausanne → Lake Geneva region, Lugano → Italian-speaking) to assign `preferredRegions` automatically.
- Swiss transport categories (IC/IR/S-Bahn/RegioExpress) map to `instrumentation cues` and tempo offsets.
- Platform/prognosis data from `transport.opendata.ch` are stored for reminder messages.
- Support quick autopilot: if a user taps “share to Rynno” from the SBB app, parse the URL, call the Swiss API, and auto-populate tags (default `no preference` unless the user defines them). Later we can prompt for demographics/language after parsing.

## 4. Multi-country extension plan
- Keep each adapter isolated: SBB and Google share data go through their own parser functions that emit the canonical schema. When adding a new country (France: SNCF, Italy: Trenitalia), we add a dedicated adapter that parses that provider’s share pages or API and maps fields to the schema.
- Extend `preferredRegions` metadata with country-specific labels (e.g., `Provence`, `Tuscany`) so the playlist builder can add local instrumentation seeds.

## 5. Pipeline and validation
1. Receive raw input (share link, manual entry).<br>
2. Identify source and delegate to adapter.<br>
3. Adapter returns canonical schema + tags/demographics (default `no preference`).<br>
4. Pass to playlist builder (mood mapping + seeds) and notification scheduler.<br>
5. Validate (e.g., ensure leg durations exist, at least one leg flagged). If data missing, fall back to multi-leg assumption (split journey based on heuristics) or ask user to confirm.

## 6. Data we need from the user (optional but encouraged)
- Passenger profile: solo/couple/family/kids (drives mood and explicit filters).<br>
- Preferred languages/regions (English/Swiss German/French/Latin) for localized seeds.<br>
- Musical style hints (if they want calm, energetic, or unexpected).<br>
- Preferred era (classic/mix/surprise) if they opt out of demographics.<br>

Documented here so we can build forms or quick prompts after parsing the trip.

---

This spec keeps the parser tightly aligned with Switzerland while paving the path for other European rails later. Want me to add a timeline for building the adapters (SBB first, then Google, then France/Italy) and call out what APIs/credentials each requires?EOF
