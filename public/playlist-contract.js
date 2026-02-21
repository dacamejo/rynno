(function attachPlaylistContract(globalScope) {
  function normalizeTags(values = []) {
    return values.map((entry) => String(entry || '').toLowerCase().replace(/\s+/g, '-')).filter(Boolean);
  }

  function buildMoodHints(rawMood = '') {
    const lower = String(rawMood).toLowerCase();
    return {
      calm: /calm|cozy|chill|soft/.test(lower),
      energetic: /energy|hype|upbeat|fast/.test(lower),
      cinematic: /cinematic|epic|film/.test(lower),
      adventurous: /adventurous|explore|bold/.test(lower),
      reflective: /reflect|quiet|focus|gentle/.test(lower)
    };
  }

  function buildPlaylistRequestPayload({ activeTripCanonical, activeTripId, selectedCompanions = [], mood = '', language = 'english', region = 'alps', auth = null, latestPlaylist = null }) {
    const companions = [...selectedCompanions];
    const preferenceTags = normalizeTags([...companions, region]);

    const canonicalTrip = {
      ...(activeTripCanonical || {}),
      tripId: activeTripId,
      tags: preferenceTags,
      preferredLanguages: [language],
      metadata: {
        ...(activeTripCanonical?.metadata || {}),
        userId: auth?.userId || null,
        selectedCompanions: companions,
        moodInput: mood || null,
        regionPreference: region
      }
    };

    return {
      trip: canonicalTrip,
      preferences: {
        tags: preferenceTags,
        moodHints: buildMoodHints(mood),
        languagePreference: language,
        moodText: mood || null
      },
      spotify: {
        userId: auth?.userId || null,
        spotifyUserId: auth?.spotifyUserId || null
      },
      isRegeneration: Boolean(latestPlaylist?.playlistId),
      regeneratedFromPlaylistId: latestPlaylist?.playlistId || null
    };
  }

  function normalizePlaylistForRender(playlist) {
    if (!playlist || typeof playlist !== 'object') {
      return { playlistName: null, playlistUrl: null, tracks: [], images: [], moodProfile: {}, guardrailAttempts: [] };
    }

    return {
      playlistId: playlist.playlistId || null,
      playlistName: playlist.playlistName || 'Generated playlist',
      playlistUrl: playlist.playlistUrl || null,
      images: Array.isArray(playlist.images) ? playlist.images : [],
      coverImageUrl: playlist.coverImageUrl || null,
      moodProfile: playlist.moodProfile && typeof playlist.moodProfile === 'object' ? playlist.moodProfile : {},
      tracks: Array.isArray(playlist.tracks) ? playlist.tracks : [],
      guardrailAttempts: Array.isArray(playlist.guardrailAttempts) ? playlist.guardrailAttempts : []
    };
  }

  const api = {
    normalizeTags,
    buildMoodHints,
    buildPlaylistRequestPayload,
    normalizePlaylistForRender
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.PlaylistContract = api;
})(typeof window !== 'undefined' ? window : globalThis);
