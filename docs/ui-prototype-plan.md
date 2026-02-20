# Mobile-first UI prototype & share-target design

This document picks up where the previous frontline thinking paused. It translates the premium UX notes into a tangible, mobile-first prototype plan, covers share-target handling for the PWA, and codifies a component architecture we can hand off to the frontend team.

## 1. Prototype flow (mobile-first stack)
1. **Share landing / hero** – full-bleed hero with railway evening animation, headline `Your Swiss train journey, scored.`, and CTA buttons for `Share from SBB / Google` plus a manual entry helper. Hero includes a subtle floating train shadow animation and a badge that reads `Share ➜ Choose Rynno ➜ Get playlist`.
2. **Share loader** – once a share target payload arrives, display a skeleton card with copy such as `Decoding your Lausanne → Zermatt magic...` plus animated gradient stripes. Keep the layout fixed-height so the layout does not shift when the data arrives.
3. **Trip review (card deck)** – stacked cards show itinerary summary, leg timeline, tag chips, and tag-derived “energy slider” that animates when chips toggle. Preference toggles for languages/regions refresh the playlist subtitle copy.
4. **Playlist & storytelling** – Spotify cover, stats, curated track list with valence badges, feedback row (thumbs / `Tell us why`), and CTA buttons `Open in Spotify`, `Email playlist`. History footer lists prior trips with mood badges so the screen feels curated rather than purely transactional.
5. **Settings / history panel** – accessible via bottom drawer or nav: shows Spotify auth status, default preferences, reminder toggles, and feedback form.

Every screen is designed for narrow widths first (max 420px) with generous height for swipe interactions. Padding = 24px, container width = 340px, card radius = 24px, drop shadows, and large tap targets (44px min).

## 2. Share target handling (PWA)
- **Manifest** – add/extend `manifest.webmanifest` with `share_target`:
  ```json
  "share_target": {
    "action": "/share-target",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
  ```
- **Service worker** – intercept the POST request, store the payload in `IndexedDB`/`localForage`, and immediately redirect to `/share-target` with a query flag. This lets the UI read the cached share, display the loader, and POST to the backend parser without losing the feeling of speed. Use `event.waitUntil` to keep the SW alive while we contact the backend.
- **`/share-target` route** – single-page view that:
  1. Reads the share payload (url/text) via the service worker helper.
  2. Displays the skeleton/trip review transition state while hitting `/api/trip-parser`.
  3. Handles success (navigate to trip review screen with parsed data) and failures (show toast + manual input fallback). The skeleton-to-detail animation should be a shared transition to avoid jank.
- **Fallback for manual entries** – on the same route, allow pasting an SBB URL or typing origin/destination/time; this form should auto-detect keywords (e.g., `sbb.ch`) and prefill the parser payload.

## 3. Premium UX/visual system
- **Palette** – alpine navy (#041423) for backgrounds, golden highlight (#E4B95C) for CTAs/badges, soft ivory (#F7F6F3) for cards, charcoal text (#1F2A37). Use gradients (navy → deep plum) for hero.
- **Typography** – geometric sans for headlines (e.g., Space Grotesk), humanist for body (e.g., Inter); hero headline at 28px/32px, body at 16px, micro-copy at 13px. Use letter spacing + capitalized labels for tags.
- **Motion** – card flips for tag toggles, progress bars for playlist generation, a floating train shadow animation for the hero, and chip bounces when selected.
- **Touch affordances** – chips expand to 48px height when selected, CTA buttons have subtle elevation change on press, skeleton shimmer uses CSS animation for the loading card.
- **Accessibility** – high contrast ratios, descriptive `alt` for playlist art, focus-visible styles for keyboard, and aria states for toggles.

## 4. Component plan (React + Vite + shadcn-esque atoms)
| Component | Responsibilities | Key props/state |
|-----------|------------------|----------------|
| `ShareHero` | Hero imagery, share CTA, manual entry helper | `onShareClick`, `onManualPaste`, `supportingText` |
| `ShareLoader` | Skeleton + animated copy while parser runs | `statusText`, `progress`, `onAbort` |
| `TripCard` | Displays itinerary summary with leg timeline & tags | `trip`, `onTagUpdate`, `onRegenerate`, `selectedTags` |
| `TagChips` | Chips (family/couple/solo/kids/celebration/surprise) | `tags`, `selected`, `onToggle`, `disabled`
| `PreferenceToggleGroup` | Language/region toggles with microcopy | `options`, `selected`, `onChange`
| `PlaylistPanel` | Spotify cover, stats, track list, CTA buttons | `playlist`, `tracks`, `onOpenSpotify`, `onEmail`, `feedbackState`
| `TrackRow` | Single track with energy/valence markers | `track`, `energyScore`, `regionLabel`
| `FeedbackBar` | Thumbs + "Tell us why" modal trigger | `status`, `onThumbs`, `onFeedback`
| `HistoryScroller` | Recent trips with mood badges + "Re-run" button | `history`, `onRerun`
| `SettingsDrawer` | Spotify auth status, defaults, reminder toggle | `settings`, `onAuth`, `onToggleReminder`, `onSave`
| `ShareTargetGuard` | Service-worker-safe guard that hydrates share payload | `onPayload`, `sharePayload` |

Each component should be responsive; cards stack vertically with consistent gaps (18px). Use a shared `design-tokens.ts` for colors/spacing so updates propagate.

## 5. Development + PR plan (highlighting next steps)
1. **Prototype iteration:** spin up a Vite/React shell, import the design tokens, and build the hero/trip/playlist screens as standalone routes (home, share-target, settings). Use mock data driven by the parser schema to validate layouts.
2. **Share-target wiring:** implement the manifest/service worker changes above plus a `/share-target` route that can accept mocked payloads while backend is in progress. The component should gracefully degrade to manual entry if the share data is invalid.
3. **Premium polish:** layer animations (chip bounce, hero float), ensure typography scales, and validate accessible contrast.
4. **Backend handshake:** define the API contract (POST `/api/trip-parser` returning canonical schema) and hook the trip review component to it with retries & error states.
5. **Testing & QA:** include unit tests for critical components (tag state, share loader), and storybook/mdx snapshots if applicable.

### PR checklist
- [ ] Summary of UI changes (screens + state flows) in the PR description.
- [ ] Screenshots or animated GIFs of the hero, loader, and playlist screens on a narrow viewport.
- [ ] Share-target manifest/service-worker diff with comments explaining the redirect strategy.
- [ ] Added/updated docs (this file + any README mention of the PWA share target).
- [ ] Tests for key components (tag toggles, share target guard) plus any new lint or formatting changes.
- [ ] `CHANGELOG.md` entry or release note (if we maintain one) describing the share-to-UI work.

Let me know if you’d like sketches or Figma references next, or if we should spin up a simple Storybook preview for the hero/trip/playlist cards.