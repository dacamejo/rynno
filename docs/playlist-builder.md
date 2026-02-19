# Playlist Builder Strategy

Rynno’s playlists must feel like they came from a passionate traveler with impeccable taste—not a "Light Summer" Spotify boilerplate. To deliver that we treat the playlist builder as a small editorial team, mixing a structured mood engine with high-quality seeds that cover every era and geography.

## 1. Key design principles
- **Honor the journey story.** Each trip yields a storytelling arc: departures, transfers, long legs, and arrivals should map to energy shifts (e.g., mellow dawn commute, energetic afternoon transfer, cinematic evening descent). Tags like *family*, *solo*, or *celebration* then tune instrumentation, lyrical content, and era emphasis.
- **Blend curated taste with recommendations.** We combine human-approved seeds (see section 2) with Spotify’s Recommendations API. Seeds guarantee the playlist stays anchored in thoughtful music, while recommendations fill it out. We avoid over-relying on "new music" by including classic albums/reviews from critics covering decades.
- **Enforce guardrails.** Before handing the playlist to the user we validate the first few tracks for explicitness, energy, and lyrical tone relative to tags, rerunning the builder when thresholds fail.
- **Capture feedback.** Post-trip thumbs-up/down, skip metrics, and optional user comments feed back into the seed weightings and mood heuristics so the system self-corrects over time.

## 2. Quality source catalog (multi-era, multi-culture)
We maintain a catalog of trusted seed clusters inspired by respected critics and publications, each organized by musical narrative rather than freshness. Examples:

| Cluster | Mood focus | Sample source inspirations |
|---------|------------|---------------------------|
| **Heritage grooves** | Warm, timeless soul/funk/jazz (60s-90s) | Rolling Stone 500/critics, Guardian retrospectives (e.g., "The best songs of 2025" lists that cite older era gems), NPR Tiny Desk "All Songs+" features, Quietus essays on classic records |
| **Widescreen travel** | Cinematic/world instrumentation for scenic legs | NPR Alt.Latino specials, Bandcamp global playlists, Quietus Baker’s Dozen essays, Guardian "best jazz albums" lists, regional editorial picks (e.g., Africancypher, Afropop Worldwide) |
| **Indie craft** | Thoughtful indie/alt that skews artful not simply new | Pitchfork Best New Music (focus on detailed review selections), The Quietus album reviews, Guardian album-of-the-week features, NPR All Songs Considered playlists and interviews |
| **Serene journeys** | Ambient, neo-classical, minimal electronics for late-night/reflective trips | Bandcamp ambient playlists, Quietus ambient/experimental picks, Guardian "ambient" features, curated classical or post-rock seeds from NPR's Classic Bluegrass/Chamber features |
| **Playful family** | Clean, upbeat, lyric-forward pop/world for kids/families | NPR All Songs Considered family picks, Bandcamp kids/world tags, curated spots from Guardian pop features, Spotify-friendly radio versions of classics (with explicit flags filtered out) |

Each cluster references specific playlists or editorial pieces so we can regularly refresh the seeds without being purely algorithmic.

## 3. Mood mapping + heuristics
For each trip we compute:
- `target_energy` and `target_valence` (based on time of day, tag, and transport type)
- `era_bias` (e.g., family tag gets more 70s-90s soul; solo tag leans toward 90s-00s singer/songwriter; celebration introduces 80s-90s dance alongside modern anthems)
- `lyric_safety` filters (explicit vs. clean; language preferences)
- `instrumentation cue` (strings for scenic minutes, percussion for bustling transfers, acoustic for late-night rides)

These cues determine which seed clusters to sample and how to weight the Spotify Recommendations API calls. The system also enforces constraints (e.g., kids trips block explicit tracks, celebration trips require high valence/energy). We version these heuristics (e.g., `RhythmProfile_v1.0`) so we can tweak them based on feedback.

## 4. Quality assurance loops
- **Pre-flight checks:** Evaluate the first 5 tracks for tag alignment (energy, explicitness, instrumentation). If the guardrail fails we re-run the recommendation stage with adjusted seeds or energy settings.
- **User feedback:** After the trip the app prompts for a quick rating (thumbs up/down, or a 3-star scale) plus optional notes. That data adjusts seed weights and helps us surface problematic tags in an internal dashboard.
- **Analytics:** Track skip rates (via Spotify playback telemetry when available) to detect underperforming moods. Flag tags with high skip rates for curator review.
- **Manual curation:** Periodically refresh the seed catalog from the sources listed above (Pitchfork, NPR, Guardian, Quietus, Bandcamp) and add archival references (Rolling Stone listings, NPR Tiny Desk classics) so no single era dominates.

## 5. Reminders + playlist refresh
- Pair each playlist with reminder metadata (departure time, platform/station, mood summary). The reminder notification carries the Spotify link and optionally a short blurb referencing the seed inspiration (“Inspired by Pitchfork’s Best New Music: Ratboys”).
- If the trip updates mid-run (delay or alternative route), rerun the mood mapper with the new timing and optionally append a short “delay mode” addendum to the playlist.

---

This document can evolve as we prototype the builder. Let me know if you’d like to expand any section (seed sourcing, mood heuristics, QA flow) or move these thoughts into a standalone design doc with diagrams.Otherwise I’ll add this to the repo and we can treat it as the spec for the playlist feature. }
