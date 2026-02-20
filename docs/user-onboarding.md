# User Onboarding Flow

This document maps the first-time experience from install to the delivery of a tailored playlist. A frictionless onboarding helps us collect the signals the playlist builder and parser need while giving travelers a confident, "never start music from scratch" moment.

## 1. Primary goals
- Collect the trip without overwhelming the user (three steps max).
- Surface what the traveler cares about (tags, language, family mode) so heuristics can personalize the playlist immediately.
- Demonstrate the value quickly (preview track list, reminder metadata, or sample mood summary).

## 2. Onboarding stages

### 2.1 Welcome + context
- Show a short explainer (“Rynno curates travel playlists inspired by your journey and mood”) with imagery tied to travel (train window, scenic view).
- Offer Spotify/Apple Music connection if the user wants to sync preferences, but keep this optional for the first run.
- Provide an instant "Use a shared link" button plus a manual entry option.

### 2.2 Trip capture
- If the user shares an SBB or Google Maps link, show an interstitial that highlights what we extracted (origin, destination, time).
- If manual input, guide them through origin/destination/time + transport mode dropdown.
- Immediately call the parser adapter; show a loading state with contextual copy like "Mapping your journey through Swiss rails…"
- On success, present the canonical trip summary (legs, durations, modes) so the traveler trusts the data.

### 2.3 Preference gathering
- Provide quick tag buttons (solo, couple, family, celebration, no preference). Default to `no preference` if they skip.
- Ask for language preference (Swiss German, French, Italian, English, Surprise me) and explicitness filters (Clean, Normal).
- Offer optional style hints (checkboxes for Calm, Energetic, Cinematic, Surprise). Use these to seed the `mood` object for the first playlist.
- Capture optional demographics (kids/two+), but keep it short—don’t block the flow.

### 2.4 Confirmation + value
- Surface a preview card: highlight mood cues (“Perfect for a scenic Alpine leg at 18:00—strings, slow builds, warm vocals”) and the first 3–5 tracks or references to curated seeds.
- Show the scheduled reminder (e.g., "We’ll remind you 10 minutes before the train with your playlist and platform info"). Include ability to edit reminder time or switch transport.
- Encourage a quick opt-in for post-trip feedback (“Let us know how the playlist land” link) so we can feed data back to heuristics.

### 2.5 Post-onboarding hints
- After delivery, nudge the user to record a short preference (“Want more cinematic mixes?”) so the builder learns faster.
- Surface the ability to favorite a playlist seed or mark a track as "keep" so manual feedback signals get recorded.

## 3. Experience guardrails
- **Timeouts:** If parsing takes longer than 5 seconds, show an animated progress indicator plus an option to refresh.
- **Fallback manual edits:** Allow travelers to adjust legs, tags, languages, or mood hints before finalizing the playlist.
- **Privacy:** Clearly state what data is stored (trip metadata, preferences) and how long push notifications will run.

## 4. Success signals
- Trip parsed with ≥1 leg and `confidenceScore ≥ 70`.
- Tag + mood hint captured so playlist heuristics can run with targeted seeds.
- Reminder scheduled and playlist preview rendered.
- Optional: user connects a streaming account or gives feedback after the ride.

## 5. Next steps for future flows
- Explore deep links from SBB/Google to bypass onboarding for returning travelers.
- Add onboarding variants for shared trips with groups (multi-passenger preferences).
- Experiment with a progressive onboarding where we surface more personalization options only after the first successful playlist delivery.
