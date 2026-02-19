# Product & Delivery Roadmap

We start digital-first with a mobile-optimized Progressive Web App (PWA) to validate the parsed SBB workflows, playlist builder, and backend services, then wrap the same core experience inside a thin native mobile app once the concept proves successful.

## Phase 1 – Mobile-optimized PWA (proof-of-concept)
1. **Objective:** Build and test the core experience quickly without App Store approvals. Deliver the share-to workflow, playlist generation, and email reminders via a responsive PWA that feels like a mobile app.
2. **Key capabilities:**
   - PWA manifest + Web Share Target handler so SBB shares land directly in the parser.
   - Mobile-first UI for trip review, tags, and Spotify playlist delivery.
   - Backend services: parser, Spotify OAuth flow, playlist builder, and reminder mailer.
   - Analytics & feedback loop (in-app thumbs/ratings) to tune playlists before we expand.
3. **Success signals:** user shares a Swiss train itinerary, receives a high-quality playlist, and optionally adds the PWA to their home screen.

## Phase 2 – Native mobile shell (React Native/Flutter)
1. **Objective:** Offer a frictionless downloadable experience while reusing the proven PWA/backend logic.
2. **Approach:** Create a thin native wrapper (React Native or Flutter) that hosts the same screens (trip summary, playlist preview, settings) by embedding the web views or reusing components via a shared design system. Native app handles:
   - System-level Share Sheet integration (no dependency on browser support).
   - Push notifications (future, as needed).
   - Deep linking and login persistence.
3. **Migration path:** reuse the parser spec, playlist builder, and OAuth services from Phase 1; just replace the front-end container while keeping API contracts stable.

## Future phases (to be prioritized later)
- Expand parser adapters beyond SBB (France, Italy, road trips) once the Swiss flow is stable.
- Explore optional enhancements (LLM storytelling, weather-informed mood adjustments, richer notifications) documented in `docs/future-ideas.md`.
