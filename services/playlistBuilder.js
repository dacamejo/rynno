const moodHeuristics = require('./moodHeuristics');
const seedCatalog = require('./seedCatalog');
const spotifyClient = require('./spotifyClient');
const { INSTRUMENTATION_GENRE_HINTS } = seedCatalog;

const MAX_GUARDRAIL_ATTEMPTS = 3;
const LANGUAGE_KEYWORD_HINTS = {
  english: ['the', 'love', 'night', 'city', 'train'],
  'swiss german': ['nacht', 'liebi', 'züri', 'zueri', 'chum', 'bahn'],
  german: ['nacht', 'liebe', 'stadt', 'zug', 'bahn'],
  french: ['amour', 'nuit', 'ville', 'gare', 'bonjour'],
  italian: ['amore', 'notte', 'città', 'stazione', 'ciao']
};

async function resolveSpotifyContext(spotify = {}) {
  const { accessToken, refreshToken, userId } = spotify;
  let token = accessToken;

  if (!token && refreshToken) {
    const refreshed = await spotifyClient.refreshAccessToken(refreshToken);
    token = refreshed.accessToken;
  }

  if (!token) {
    throw new Error('Spotify access token or refresh token is required.');
  }

  const profile = await spotifyClient.getUserProfile(token);
  return {
    accessToken: token,
    userId: userId || profile.id,
    profile
  };
}

function buildRecommendationParams(profile, seeds, attempt = 1, limitOverride) {
  const limit = limitOverride || Math.min(profile.playlistLength + 5, 25);
  const params = {
    limit,
    seed_genres: seeds.seedGenres.join(',')
  };

  if (profile.targetEnergy !== undefined) {
    params.target_energy = Number(profile.targetEnergy.toFixed(2));
  }
  if (profile.targetValence !== undefined) {
    params.target_valence = Number(profile.targetValence.toFixed(2));
  }
  if (profile.targetDanceability !== undefined) {
    params.target_danceability = Number(profile.targetDanceability.toFixed(2));
  }
  if (profile.targetAcousticness !== undefined) {
    params.target_acousticness = Number(profile.targetAcousticness.toFixed(2));
  }
  if (profile.targetInstrumentalness !== undefined) {
    params.target_instrumentalness = Number(profile.targetInstrumentalness.toFixed(2));
  }
  if (profile.minEnergy !== undefined) {
    params.min_energy = Number(profile.minEnergy.toFixed(2));
  }
  if (profile.maxEnergy !== undefined) {
    params.max_energy = Number(profile.maxEnergy.toFixed(2));
  }

  if (attempt > 1) {
    params.target_energy = Number(
      Math.max(0.12, Math.min(0.95, profile.targetEnergy + (attempt % 2 ? -0.06 : 0.06))).toFixed(2)
    );
    params.max_energy = Number(Math.min(0.95, (params.max_energy || 0.95) + 0.05).toFixed(2));
  }

  return params;
}


function mergeUniqueTracks(trackGroups = []) {
  const seen = new Set();
  const merged = [];

  trackGroups.forEach((group) => {
    group.forEach((track) => {
      if (!track?.id || seen.has(track.id)) {
        return;
      }
      seen.add(track.id);
      merged.push(track);
    });
  });

  return merged;
}

async function fetchRecommendationsForPlans(accessToken, profile, seeds, attempt) {
  const plans = (seeds.recommendationPlans || []).length
    ? seeds.recommendationPlans
    : [{ weight: 1, seedGenres: seeds.seedGenres }];

  const plannedGroups = [];
  for (const plan of plans) {
    const requestedLimit = Math.max(5, Math.round((profile.playlistLength + 6) * (plan.weight || 0.34)));
    const params = buildRecommendationParams(profile, { seedGenres: plan.seedGenres }, attempt, requestedLimit);
    const recommendations = await spotifyClient.getRecommendations(accessToken, params);
    plannedGroups.push(recommendations.tracks || []);
  }

  const merged = mergeUniqueTracks(plannedGroups);
  if (merged.length) {
    return merged;
  }

  const fallbackParams = buildRecommendationParams(profile, seeds, attempt);
  const fallbackRecommendations = await spotifyClient.getRecommendations(accessToken, fallbackParams);
  return fallbackRecommendations.tracks || [];
}

function evaluateGuardrails(tracks = [], features = [], profile) {
  const featureLookup = features.reduce((acc, feature) => {
    if (feature && feature.id) {
      acc[feature.id] = feature;
    }
    return acc;
  }, {});

  const sampleSize = Math.min(profile.guardrailSampleSize || 5, tracks.length);
  let explicitIssues = 0;
  let energyIssues = 0;
  let instrumentationIssues = 0;
  let languageIssues = 0;
  let energyDeltaTotal = 0;
  let energyDirectionTotal = 0;
  let firstTrackIssue = null;

  for (let i = 0; i < sampleSize; i += 1) {
    const track = tracks[i];
    const featuresEntry = featureLookup[track.id];
    if (!featuresEntry) {
      continue;
    }

    const energyDelta = Math.abs(featuresEntry.energy - profile.targetEnergy);
    const energyDirection = featuresEntry.energy - profile.targetEnergy;
    energyDeltaTotal += energyDelta;
    energyDirectionTotal += energyDirection;

    if (profile.lyricSafety === 'clean' && track.explicit) {
      explicitIssues += 1;
    }

    if (energyDelta > (profile.maxGuardrailEnergyDelta || 0.35)) {
      energyIssues += 1;
    }

    const instrumentationFail = failsInstrumentationCheck(featuresEntry, profile.instrumentationCue);
    if (instrumentationFail) {
      instrumentationIssues += 1;
    }

    const languageFail = failsLanguageFitCheck(track, profile.languagePreference);
    if (languageFail) {
      languageIssues += 1;
    }

    if (i === 0) {
      firstTrackIssue = getFirstTrackIssue(track, featuresEntry, profile);
    }
  }

  const avgEnergyDelta = sampleSize === 0 ? 0 : energyDeltaTotal / sampleSize;
  const avgEnergyDirection = sampleSize === 0 ? 0 : energyDirectionTotal / sampleSize;

  const reasons = [];
  if (explicitIssues) {
    reasons.push('Explicit tracks appeared while clean lyrics are requested.');
  }
  if (energyIssues) {
    reasons.push('Track energy drifted too far from the target mood.');
  }
  if (instrumentationIssues) {
    reasons.push('Instrumentation cues did not align with the requested vibe.');
  }
  if (languageIssues) {
    reasons.push('Track metadata appears off-language for the requested preference.');
  }
  if (firstTrackIssue) {
    reasons.push(firstTrackIssue);
  }

  return {
    pass:
      explicitIssues === 0 &&
      energyIssues <= 2 &&
      instrumentationIssues <= 1 &&
      languageIssues <= 2 &&
      !firstTrackIssue,
    sampleSize,
    explicitIssues,
    energyIssues,
    instrumentationIssues,
    languageIssues,
    firstTrackIssue,
    avgEnergyDelta,
    avgEnergyDirection,
    reasons
  };
}

function getFirstTrackIssue(track, featuresEntry, profile) {
  if (!track || !featuresEntry) {
    return null;
  }

  if (profile.lyricSafety === 'clean' && track.explicit) {
    return 'First track failed quality check because it is explicit for a clean profile.';
  }

  const firstTrackEnergyDelta = Math.abs(featuresEntry.energy - profile.targetEnergy);
  if (firstTrackEnergyDelta > 0.2) {
    return 'First track failed quality check because it misses the target energy too far.';
  }

  if (typeof track.popularity === 'number' && track.popularity < 18) {
    return 'First track failed quality check due to very low confidence/popularity.';
  }

  return null;
}

function failsLanguageFitCheck(track, languagePreference) {
  if (!languagePreference || !track) {
    return false;
  }

  const normalized = String(languagePreference).trim().toLowerCase();
  const hints = LANGUAGE_KEYWORD_HINTS[normalized];
  if (!hints || !hints.length) {
    return false;
  }

  const artistNames = (track.artists || []).map((artist) => artist.name || '').join(' ');
  const haystack = `${track.name || ''} ${artistNames}`.toLowerCase();
  return !hints.some((hint) => haystack.includes(hint));
}

function failsInstrumentationCheck(featuresEntry, cue) {
  if (!featuresEntry) {
    return false;
  }

  switch (cue) {
    case 'percussion':
      return featuresEntry.danceability < 0.55;
    case 'strings':
      return featuresEntry.acousticness < 0.35 && featuresEntry.instrumentalness < 0.15;
    case 'acoustic':
      return featuresEntry.acousticness < 0.4;
    case 'pads':
      return featuresEntry.instrumentalness < 0.2;
    case 'playful':
      return featuresEntry.danceability < 0.6;
    default:
      return false;
  }
}

function adjustProfileForGuardrail(profile, guardrail) {
  if (guardrail.explicitIssues > 0) {
    profile.lyricSafety = 'clean';
  }

  if (guardrail.energyIssues > 1) {
    const direction = guardrail.avgEnergyDirection;
    if (direction > 0) {
      profile.targetEnergy = Math.max(0.12, profile.targetEnergy - 0.08);
    } else {
      profile.targetEnergy = Math.min(0.95, profile.targetEnergy + 0.08);
    }
    profile.maxEnergy = Math.min(0.99, profile.targetEnergy + 0.25);
    profile.minEnergy = Math.max(0.05, profile.targetEnergy - 0.2);
  }

  if (guardrail.languageIssues > 1 && profile.languagePreference) {
    profile.languagePreference = String(profile.languagePreference).toLowerCase();
  }

  profile.maxGuardrailEnergyDelta = Math.min(0.5, (profile.maxGuardrailEnergyDelta || 0.35) + 0.05);
}

function adjustSeedsForGuardrail(seeds, guardrail, profile) {
  if (guardrail.explicitIssues > 0) {
    seeds.seedGenres = mergeGenres(seeds.seedGenres, ['acoustic', 'chill']);
  }
  if (guardrail.instrumentationIssues > 0) {
    const instrumentationHints = INSTRUMENTATION_GENRE_HINTS[profile.instrumentationCue] || [];
    seeds.seedGenres = mergeGenres(seeds.seedGenres, instrumentationHints);
  }
  if (guardrail.energyIssues > 2) {
    seeds.seedGenres = mergeGenres(seeds.seedGenres, ['dance', 'ambient']);
  }
  if (guardrail.languageIssues > 1) {
    seeds.seedGenres = mergeGenres(seeds.seedGenres, ['world-music', 'singer-songwriter']);
  }
  if (guardrail.firstTrackIssue) {
    seeds.seedGenres = mergeGenres(seeds.seedGenres, ['pop', 'indie-pop']);
  }
  seeds.seedGenres = seeds.seedGenres.slice(0, 5);

  if ((seeds.recommendationPlans || []).length) {
    seeds.recommendationPlans = seeds.recommendationPlans.map((plan) => ({
      ...plan,
      seedGenres: mergeGenres(plan.seedGenres, seeds.seedGenres).slice(0, 5)
    }));
  }
}

function mergeGenres(existing = [], additions = []) {
  const combined = [...existing];
  additions.forEach((genre) => {
    if (!combined.includes(genre)) {
      combined.push(genre);
    }
  });
  return combined;
}

async function weaveRegionSurprises(accessToken, baseTracks, profile, seeds) {
  if (!profile.regionSurpriseBudget) {
    return baseTracks.slice(0, profile.playlistLength);
  }

  const regionParams = {
    limit: Math.min(profile.regionSurpriseBudget + 3, 8),
    seed_genres: seeds.regionSurpriseGenres.join(',')
  };
  regionParams.target_energy = Number(profile.targetEnergy.toFixed(2));
  const regionRecommendations = await spotifyClient.getRecommendations(accessToken, regionParams);
  const surprises = (regionRecommendations.tracks || [])
    .filter((track) => !baseTracks.some((base) => base.id === track.id))
    .slice(0, profile.regionSurpriseBudget)
    .map((track) => ({ ...track, regionSurprise: true }));

  if (!surprises.length) {
    return baseTracks.slice(0, profile.playlistLength);
  }

  const target = baseTracks.slice(0, profile.playlistLength);
  surprises.forEach((surprise, index) => {
    const insertIndex = Math.min(
      target.length - 1,
      Math.max(1, Math.round(((index + 1) * target.length) / (surprises.length + 1)))
    );
    target.splice(insertIndex, 0, surprise);
  });

  return target.slice(0, profile.playlistLength);
}

function formatTracks(tracks = []) {
  return tracks.map((track, index) => ({
    position: index + 1,
    id: track.id,
    name: track.name,
    artists: track.artists.map((artist) => artist.name),
    album: track.album?.name,
    durationMs: track.duration_ms,
    explicit: track.explicit,
    uri: track.uri,
    previewUrl: track.preview_url,
    regionSurprise: Boolean(track.regionSurprise),
    externalUrl: track.external_urls?.spotify
  }));
}

async function generatePlaylist({ trip, preferences = {}, spotify = {} }) {
  if (!trip) {
    throw new Error('Trip data is required to build a playlist.');
  }

  const moodProfile = moodHeuristics.buildProfile(trip, preferences);
  const seedContext = seedCatalog.chooseSeeds(moodProfile, trip, preferences);
  const spotifyContext = await resolveSpotifyContext(spotify);
  const paramsForError = { tripId: trip.tripId || 'unknown' };

  let guardrailResult = null;
  let recommendedTracks = null;
  const guardrailAttempts = [];

  for (let attempt = 1; attempt <= MAX_GUARDRAIL_ATTEMPTS; attempt += 1) {
    const tracks = await fetchRecommendationsForPlans(
      spotifyContext.accessToken,
      moodProfile,
      seedContext,
      attempt
    );
    const trackIds = tracks.map((track) => track.id).filter(Boolean);
    const features = await spotifyClient.getAudioFeatures(spotifyContext.accessToken, trackIds);
    guardrailResult = evaluateGuardrails(tracks, features, moodProfile);
    guardrailResult.attempt = attempt;
    guardrailResult.trackCount = tracks.length;
    guardrailAttempts.push({
      ...guardrailResult,
      tags: moodProfile.tags,
      timeSegment: moodProfile.timeSegment,
      languagePreference: moodProfile.languagePreference,
      instrumentationCue: moodProfile.instrumentationCue
    });

    if (guardrailResult.pass) {
      recommendedTracks = tracks;
      break;
    }

    adjustProfileForGuardrail(moodProfile, guardrailResult);
    adjustSeedsForGuardrail(seedContext, guardrailResult, moodProfile);
  }

  if (!recommendedTracks) {
    throw new Error(
      `Unable to satisfy playlist guardrails for trip ${paramsForError.tripId}. Try adding more explicit tags or refreshing the mood hints.`
    );
  }

  const curatedTracks = await weaveRegionSurprises(
    spotifyContext.accessToken,
    recommendedTracks.slice(0, moodProfile.playlistLength),
    moodProfile,
    seedContext
  );

  const playlist = await spotifyClient.createPlaylist(spotifyContext.accessToken, spotifyContext.userId, {
    name: moodProfile.playlistName,
    description: moodProfile.playlistDescription,
    isPublic: false
  });

  await spotifyClient.addTracksToPlaylist(
    spotifyContext.accessToken,
    playlist.id,
    curatedTracks.map((track) => track.uri)
  );

  return {
    playlistId: playlist.id,
    playlistUrl: playlist.external_urls?.spotify,
    playlistName: playlist.name,
    moodProfile,
    seeds: {
      genres: seedContext.seedGenres,
      summary: seedContext.summary,
      clusters: seedContext.selectedClusters
    },
    tracks: formatTracks(curatedTracks),
    guardrailReport: guardrailResult,
    guardrailAttempts,
    spotifyUser: spotifyContext.profile?.display_name || spotifyContext.userId
  };
}

module.exports = {
  generatePlaylist,
  __internals: {
    evaluateGuardrails,
    failsLanguageFitCheck,
    getFirstTrackIssue
  }
};
