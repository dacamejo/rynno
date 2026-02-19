# Future Ideas Log
Keep this file for optional expansions that we might revisit once the core orchestration (trip parsing, playlist builder, OAuth flows) is stable.

## Optional LLM-assisted storytelling (on hold)
- **Purpose:** After the parser determines a route (e.g., train from Geneva to Zermatt), an optional LLM could summarize the highlights, mood shifts, ups/downs, and scenic notes, then suggest tags or descriptive text for the playlist reminder. Could also interpret free-text notes from the user into preference metadata.
- **Status:** *On hold.* Not part of the initial scope; core parsing is deterministic and the trip data is structured enough to drive playlists without it. Keep this note so we can revisit later if an LLM becomes necessary or affordable.
