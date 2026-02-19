# UX Spec — Premium Experience

Rynno’s UX must feel premium, story-driven, and delightful on mobile first. This spec describes the main screens, interactions, and micro-copy so we can ship a polished front end.

## 1. Share landing / hero
- Full-bleed hero (night train over mountains) with tagline: **“Your Swiss train journey, scored.”**
- CTA: **“Share from SBB / Google”** with a tiny badge explaining: `Share ➜ Choose Rynno ➜ Get playlist`. Provide supporting text for manual paste.
- Subtext highlights: `Multi-era seeds (Pitchfork, NPR, Quietus, Rolling Stone)` and `Tags for family, solo, celebration, kids`—plus a lozenge showing Spotify integration.
- Add a micro-animation for the hero card (floating train shadow) to reinforce craft.

## 2. Trip review screen
- Card layout showing parsed itinerary: route, departure/arrival, duration, platform. Display leg timeline (icons for IC / S-Bahn / walking).
- Tag chips: family / couple / solo / kids / celebration / surprise. Tapping a chip transitions the energy slider.
- Preference toggles: `Languages` (multi-select) and `Regions` (Alps / Lake Geneva / Italian Switzerland / Surprise). Each selection updates the subtitles on the playlist (e.g., “Includes francophone jazz + alpine folk”).
- Buttons: `Regenerate playlist` (primary) + `Schedule reminder` (secondary). Show a small badge when tags have been applied.

## 3. Playlist & storytelling
- Display Spotify playlist cover, title, and stats (duration, average tempo, source references). Include short copy like “Inspired by Quietus Baker’s Dozen + a commute through the Rhône Valley.”
- Show key tracks in a scrollable list with valence/energy markers and small labels (“Gallic jazz,” “Sax-fueled sunrise”).
- Feedback row: thumbs up/down plus “Tell us why” modal for richer input.
- CTA buttons: `Open in Spotify` (primary), `Email playlist` (tertiary). Add inline microcopy: “Saved to your Spotify library; no downloads needed.”
- At bottom, show history of recent trips with their mood summary badges.

## 4. Share-target loading state
- When the share target route hits the parser, show a skeleton card with progress copy (“Decoding your Lausanne → Zermatt magic...”) and animated gradient.
- Once parsed, transition seamlessly to the Trip review screen; avoid jarring reloads.

## 5. Settings/history/feedback
- History list of past trips, tags used, and playlist links so users can revisit. Provide “Re-run playlist” button per row.
- Settings area with Spotify account status, default language/region preferences, and email reminder toggle.
- Provide subtle haptics (if later in native wrapper) and animations for tag selection.

## Visual language & quality touches
- Palette: deep alpine navy, golden highlight, soft ivory cards.
- Typography: clean sans headline + humanist body. Use lots of breathing room, generous padding.
- Motion: smooth transitions between screens; card flips when tags change to reinforce personalization.
- Accessibility: high contrast buttons, descriptive alt text for album art, and touch-target-friendly chips.

This spec should guide the frontend implementation so the app feels curated and dependable. Let me know if you’d like clickable mockups or a style tile next. EOF
