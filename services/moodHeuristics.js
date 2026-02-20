const MODE_ENERGY_OFFSETS = {
  IC: 0.12,
  IR: 0.1,
  RE: 0.08,
  'S-Bahn': 0.04,
  Regio: 0.03,
  tram: 0.02,
  bus: 0.01,
  walk: -0.04,
  ferry: 0.01,
  bike: -0.03
};

const TIME_SEGMENTS = [
  { name: 'sunrise', start: 5, end: 8, energy: 0.45, valence: 0.58, instrumentation: 'acoustic' },
  { name: 'day', start: 8, end: 18, energy: 0.65, valence: 0.55, instrumentation: 'percussion' },
  { name: 'evening', start: 18, end: 22, energy: 0.55, valence: 0.62, instrumentation: 'strings' },
  { name: 'night', start: 22, end: 24, energy: 0.35, valence: 0.48, instrumentation: 'pads' },
  { name: 'night', start: 0, end: 5, energy: 0.35, valence: 0.48, instrumentation: 'pads' }
];

const TAG_PROFILES = {
  family: {
    energy: -0.1,
    valence: 0.2,
    lyricSafety: 'clean',
    instrumentation: 'percussion',
    clusters: ['heritage', 'playful']
  },
  kids: {
    energy: -0.15,
    valence: 0.3,
    lyricSafety: 'clean',
    instrumentation: 'playful',
    clusters: ['playful']
  },
  celebration: {
    energy: 0.15,
    valence: 0.25,
    lyricSafety: 'any',
    instrumentation: 'percussion',
    clusters: ['widescreen', 'playful']
  },
  solo: {
    energy: -0.02,
    valence: 0.05,
    lyricSafety: 'any',
    instrumentation: 'strings',
    clusters: ['indie', 'serene']
  },
  couple: {
    energy: 0.05,
    valence: 0.1,
    lyricSafety: 'any',
    instrumentation: 'strings',
    clusters: ['widescreen', 'heritage']
  },
  'no-preference': {
    energy: 0,
    valence: 0,
    lyricSafety: 'any',
    instrumentation: 'acoustic',
    clusters: ['indie', 'heritage', 'serene']
  }
};

const INSTRUMENTATION_TARGETS = {
  percussion: { targetDanceability: 0.7, targetAcousticness: 0.25, targetInstrumentalness: 0.05 },
  strings: { targetDanceability: 0.55, targetAcousticness: 0.45, targetInstrumentalness: 0.2 },
  acoustic: { targetDanceability: 0.5, targetAcousticness: 0.6, targetInstrumentalness: 0.25 },
  pads: { targetDanceability: 0.35, targetAcousticness: 0.4, targetInstrumentalness: 0.35 },
  playful: { targetDanceability: 0.75, targetAcousticness: 0.2, targetInstrumentalness: 0.1 }
};

const RHYTHM_PROFILE_VERSION = 'RhythmProfile_v1';

function clamp(val, min = 0, max = 1) {
  return Math.max(min, Math.min(max, val));
}

function splitTimeSegment(hour) {
  return TIME_SEGMENTS.find(
    (segment) => hour >= segment.start && hour < segment.end
  ) || TIME_SEGMENTS.find((segment) => segment.name === 'day');
}

function normalizeTags(tags = []) {
  if (!Array.isArray(tags)) {
    return [];
  }
  return [...new Set(tags.map((tag) => tag.toLowerCase()))];
}

function getLegEnergyOffset(legs = []) {
  if (!legs.length) {
    return 0;
  }

  const offsets = legs
    .map((leg) => {
      const mode = leg.mode || leg.transport || '';
      const normalized = Object.keys(MODE_ENERGY_OFFSETS).find((key) =>
        mode.toLowerCase().includes(key.toLowerCase())
      );
      return MODE_ENERGY_OFFSETS[normalized] ?? 0;
    })
    .filter((offset) => offset !== undefined);

  if (!offsets.length) {
    return 0;
  }

  const total = offsets.reduce((acc, value) => acc + value, 0);
  return total / offsets.length;
}

function buildProfile(trip = {}, preferences = {}) {
  const tags = normalizeTags(trip.tags ?? []).length
    ? normalizeTags(trip.tags)
    : ['no-preference'];
  const firstDeparture = trip.firstDeparture
    ? new Date(trip.firstDeparture)
    : new Date();
  const hour = firstDeparture.getHours();
  const timeSegment = splitTimeSegment(hour);

  const timeEnergy = timeSegment.energy;
  const timeValence = timeSegment.valence;

  const tagEnergy = tags.reduce((acc, tag) => {
    const profile = TAG_PROFILES[tag] || TAG_PROFILES['no-preference'];
    return acc + profile.energy;
  }, 0) / tags.length;

  const tagValence = tags.reduce((acc, tag) => {
    const profile = TAG_PROFILES[tag] || TAG_PROFILES['no-preference'];
    return acc + profile.valence;
  }, 0) / tags.length;

  const instrumentationVotes = tags.reduce((votes, tag) => {
    const profile = TAG_PROFILES[tag] || TAG_PROFILES['no-preference'];
    const key = profile.instrumentation || 'acoustic';
    votes[key] = (votes[key] || 0) + 1;
    return votes;
  }, {});
  instrumentationVotes[timeSegment.instrumentation] =
    (instrumentationVotes[timeSegment.instrumentation] || 0) + 0.5;

  const instrumentationCue = Object.keys(instrumentationVotes).reduce((best, key) => {
    if (best === null || instrumentationVotes[key] > instrumentationVotes[best]) {
      return key;
    }
    return best;
  }, null) || 'acoustic';

  let instrumentationTargets = INSTRUMENTATION_TARGETS[instrumentationCue];
  if (!instrumentationTargets) {
    instrumentationTargets = INSTRUMENTATION_TARGETS.acoustic;
  }

  const moodHints = preferences.moodHints || {};
  let moodEnergyAdjustment = 0;
  if (moodHints.calm) moodEnergyAdjustment -= 0.05;
  if (moodHints.energetic) moodEnergyAdjustment += 0.1;
  if (moodHints.cinematic) moodEnergyAdjustment += 0.02;

  let moodValenceAdjustment = 0;
  if (moodHints.adventurous) moodValenceAdjustment += 0.07;
  if (moodHints.reflective) moodValenceAdjustment -= 0.03;

  const legEnergyOffset = getLegEnergyOffset(trip.legs);

  const targetEnergy = clamp(timeEnergy + tagEnergy + legEnergyOffset + moodEnergyAdjustment, 0.1, 0.95);
  const targetValence = clamp(timeValence + tagValence + moodValenceAdjustment, 0.05, 0.95);

  const eraBias = new Set();
  tags.forEach((tag) => {
    const profile = TAG_PROFILES[tag] || TAG_PROFILES['no-preference'];
    profile.clusters.forEach((clusterId) => eraBias.add(clusterId));
  });

  if (preferences.eraPreference) {
    eraBias.add(preferences.eraPreference);
  }

  const lyricSafetyPriority = tags.includes('family') || tags.includes('kids') ? 'clean' : 'any';
  const lyricSafety = preferences.explicitOverride || lyricSafetyPriority;

  const playlistLength = preferences.playlistLength || 12;
  const regionSurpriseBudget = Math.min(2, (trip.preferredRegions?.length || 0) + 1);

  const startStation = trip.legs?.[0]?.departureStation || trip.canonical?.from || 'Departure';
  const endStation = trip.legs?.[trip.legs.length - 1]?.arrivalStation || trip.canonical?.to || 'Destination';

  const playlistName = `Rynno • ${startStation} → ${endStation}`;

  const playlistDescription = `Mood: ${tags.join(', ')} · ${instrumentationCue} tone · Energy ${Math.round(targetEnergy * 100)}`;

  const summary = `${timeSegment.name} trip adjusting ${instrumentationCue} instrumentation with ${tags.join(', ')}`;

  return {
    profileVersion: RHYTHM_PROFILE_VERSION,
    tags,
    eraBias: [...eraBias],
    instrumentationCue,
    targetEnergy,
    minEnergy: clamp(targetEnergy - 0.2, 0.05, 0.9),
    maxEnergy: clamp(targetEnergy + 0.25, 0.2, 0.99),
    targetValence,
    targetDanceability: instrumentationTargets.targetDanceability,
    targetAcousticness: instrumentationTargets.targetAcousticness,
    targetInstrumentalness: instrumentationTargets.targetInstrumentalness,
    playlistLength,
    lyricSafety,
    regionSurpriseBudget,
    playlistName,
    playlistDescription,
    moodSummary: summary,
    moodHints,
    timeSegment: timeSegment.name,
    firstDeparture: firstDeparture.toISOString(),
    guardrailSampleSize: Math.min(5, playlistLength),
    maxGuardrailEnergyDelta: 0.35
  };
}

module.exports = {
  buildProfile
};
