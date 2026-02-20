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

### 3.1 Energy, valence, and time-of-day rules
- **Sunrise / early commute (05:00-08:00):** target low-to-mid energy with rising valence, layering warm vocals or gentle synth pads to match the wake-up narrative. Acoustic instruments plus slow percussion keep the vibe calm while giving a sense of momentum.
- **Daytime transfers (08:00-18:00):** lean into mid-energy tracks with bright percussion or guitar, balancing instrumental density so the playlist supports focus without being distracting. Valence depends on the tag (family/celebration = higher; solo/reflective = medium-low).
- **Evening / arrival (18:00-22:00):** introduce cinematic and analog textures (strings, flavored pads) with wider dynamic ranges; valence is moderated so the narrative feels rewarding without overdriving energy, and we slide in longer-form tracks or extended mixes for scenic legs.
- **Night / quiet journeys (22:00-03:00):** drop energy and keep valence steady or slightly positive. Lean on ambient, minimalist, or downtempo deep cuts; instrumentation cues include soft piano, field recordings, and sparse percussion.

Each rule maps to heuristics tied to the parsed trip timeline (leg start/end). We align the `target_energy` with `leg.mode` (e.g., IC = `+10 energy` offset, S-Bahn = `baseline`, walking = `-5`) and adjust dynamically if delays change the timeline.

### 3.2 Narrative transitions
- **Anchor points:** The first 1-3 tracks set the tone for the trip’s “departure” moment. We prefer human-curated seeds that match the declared tag (e.g., a cinematic indie seed for celebration, gentle neo-soul for family) to build trust quickly.
- **Leg transitions:** When the parser indicates an intermodal transfer (train → tram/bus), we insert transition tracks that either ease into the next energy zone or celebrate the pause (e.g., percussion-driven pieces for transfers, mellow strings for scenic arrivals).
- **Surprises:** After 7-9 tracks we optionally insert a curated “surprise” that gently shifts region or instrumentation (a Brazilian acoustic singer, a French electro-pop interlude) to keep journeys fresh without jarring the rider. These surprises are weighted by `no-preference` tags and provide opportunities to surface global seeds.

### 3.3 Instrumentation and regional cues
- Instrumentation cues combine sensor data (sunlight, leg type, location) with declared preferences. Example heuristics:
  - Alpine legs (from `preferredRegions`) trigger harmonica/fiddle strings referenced to Swiss folk for local resonance.
  - Lake or coastal legs nudge toward lush pads, reverb-heavy guitars, or neo-classical piano.
  - Urban transfers keep instrumentation lean (percussive electronica, percolating synths) to reflect motion.
- We reserve a small “region surprise budget” (usually 1–2 tracks of 10) to highlight a local artist or instrumentation method, ensuring each playlist feels rooted without being literal.

### 3.4 Heuristic guardrails and re-weighting
- **Seed checks:** After seeding the initial recommendation set, we evaluate energy, explicitness, language, and instrumentation density. If the guardrails reject 2+ tracks for a kids/family trip, we rerun the recommendation call with stricter `lyric_safety` and a heavier weighting on clean, acoustic seeds.
- **Dynamic re-weighting:** If skip rates or post-trip feedback indicate a mismatch (common for celebration vs. reflective tags), we bump the associated seed cluster’s weight (e.g., +15% to `Heritage grooves` if celebration trips flagged as “too mellow”).
- **Fallback:** When a parsed trip lacks time signals or has ambiguous tags, we default to `no-preference` + mid energy, and we flag that playlist in the post-trip dashboard so a curator can review and annotate the heuristics.

These heuristics allow the builder to behave like an editorial desk while still scaling across thousands of trips.
## 4. Quality assurance loops
- **Pre-flight checks:** Evaluate the first 5 tracks for tag alignment (energy, explicitness, instrumentation). If the guardrail fails we re-run the recommendation stage with adjusted seeds or energy settings.
- **User feedback:** After the trip the app prompts for a quick rating (thumbs up/down, or a 3-star scale) plus optional notes. That data adjusts seed weights and helps us surface problematic tags in an internal dashboard.
- **Analytics:** Track skip rates (via Spotify playback telemetry when available) to detect underperforming moods. Flag tags with high skip rates for curator review.
- **Manual curation:** Periodically refresh the seed catalog from the sources listed above (Pitchfork, NPR, Guardian, Quietus, Bandcamp) and add archival references (Rolling Stone listings, NPR Tiny Desk classics) so no single era dominates.
- **Demographics & preference lenses:** Attach optional metadata for preferred regions (e.g., Swiss-French Alps, Iberian Peninsula, Latin America) and languages, plus demographic cues like family composition or age bracket. These fields tune the `era_bias` (older demographics shift toward 70s/80s classics), language filters (French seeds for francophone passengers, Spanish for Latin contexts), and regional instrumentation (Alpine folk for Swiss trips, samba for Brazilian mode). If the traveler says "no preference," we keep the catalog wide and occasionally toss in a surprise seed from a different region to spark joy.

## 5. Reminders + playlist refresh
- Pair each playlist with reminder metadata (departure time, platform/station, mood summary). The reminder notification carries the Spotify link and optionally a short blurb referencing the seed inspiration (“Inspired by Pitchfork’s Best New Music: Ratboys”).
- If the trip updates mid-run (delay or alternative route), rerun the mood mapper with the new timing and optionally append a short “delay mode” addendum to the playlist.

---

This document can evolve as we prototype the builder. Let me know if you’d like to expand any section (seed sourcing, mood heuristics, QA flow) or move these thoughts into a standalone design doc with diagrams.Otherwise I’ll add this to the repo and we can treat it as the spec for the playlist feature. }
