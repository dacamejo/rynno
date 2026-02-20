const CLUSTERS = [
  {
    id: 'heritage',
    name: 'Heritage grooves',
    genres: ['soul', 'jazz', 'funk'],
    instrumentation: 'warm',
    description: 'Warm, soulful grooves stretching from the 60s-90s.'
  },
  {
    id: 'widescreen',
    name: 'Widescreen travel',
    genres: ['soundtrack', 'ambient', 'classical'],
    instrumentation: 'strings',
    description: 'Cinematic textures and orchestral flourishes for expansive legs.'
  },
  {
    id: 'indie',
    name: 'Indie craft',
    genres: ['indie', 'alternative', 'rock'],
    instrumentation: 'strings',
    description: 'Thoughtful indie/alt cuts that favor lyricism and depth.'
  },
  {
    id: 'serene',
    name: 'Serene journeys',
    genres: ['ambient', 'classical', 'chill'],
    instrumentation: 'pads',
    description: 'Ambient, neo-classical, and minimalist textures for reflective stretches.'
  },
  {
    id: 'playful',
    name: 'Playful family',
    genres: ['pop', 'dance', 'funk'],
    instrumentation: 'percussion',
    description: 'Clean, upbeat pop/world songs ready for family-friendly rides.'
  }
];

const REGION_GENRES = {
  Alps: ['folk', 'classical'],
  'Lake Geneva': ['acoustic', 'chill'],
  'Italian-speaking Switzerland': ['latin', 'dance'],
  Urban: ['electronic', 'dance'],
  Surprise: ['world', 'reggae']
};

const INSTRUMENTATION_GENRE_HINTS = {
  percussion: ['dance', 'pop'],
  strings: ['classical', 'soundtrack'],
  acoustic: ['acoustic', 'folk'],
  pads: ['ambient', 'chill'],
  playful: ['pop', 'funk']
};

function chooseSeeds(profile = {}, trip = {}, preferences = {}) {
  const clusterScores = {
    heritage: 1,
    widescreen: 1,
    indie: 1,
    serene: 1,
    playful: 1
  };

  profile.eraBias?.forEach((clusterId) => {
    if (clusterScores[clusterId] !== undefined) {
      clusterScores[clusterId] += 0.8;
    }
  });

  if (preferences.moodHints?.calm) {
    clusterScores.serene += 0.5;
  }
  if (preferences.moodHints?.energetic) {
    clusterScores.playful += 0.5;
  }

  const genreWeights = {};

  function pushGenres(genres, weight) {
    genres.forEach((genre) => {
      genreWeights[genre] = (genreWeights[genre] || 0) + weight;
    });
  }

  Object.entries(clusterScores).forEach(([clusterId, weight]) => {
    const cluster = CLUSTERS.find((entry) => entry.id === clusterId);
    if (!cluster) return;
    pushGenres(cluster.genres, weight);
  });

  const instrumentationHints = INSTRUMENTATION_GENRE_HINTS[profile.instrumentationCue] || [];
  pushGenres(instrumentationHints, 0.6);

  const regionSeeds = [];
  (trip.preferredRegions || []).forEach((region) => {
    const hint = REGION_GENRES[region];
    if (hint) {
      pushGenres(hint, 0.8);
      regionSeeds.push(...hint);
    }
  });

  const sortedGenres = Object.entries(genreWeights)
    .sort((a, b) => b[1] - a[1])
    .map(([genre]) => genre)
    .filter(Boolean);

  const seedGenres = sortedGenres.slice(0, 5);
  if (!seedGenres.length) {
    seedGenres.push('indie', 'pop');
  }

  const summary = sortedGenres.slice(0, 4);

  const sortedClusters = Object.entries(clusterScores)
    .sort((a, b) => b[1] - a[1])
    .map(([clusterId, weight]) => ({ clusterId, weight }));
  const topClusterTotal = sortedClusters
    .slice(0, 3)
    .reduce((acc, entry) => acc + entry.weight, 0);

  const recommendationPlans = sortedClusters.slice(0, 3).map((entry) => {
    const cluster = CLUSTERS.find((item) => item.id === entry.clusterId);
    const clusterGenres = cluster?.genres || [];
    const instrumentationHints = INSTRUMENTATION_GENRE_HINTS[profile.instrumentationCue] || [];
    const blended = [...new Set([...clusterGenres, ...instrumentationHints, ...sortedGenres])];
    return {
      clusterId: entry.clusterId,
      weight: Number((entry.weight / (topClusterTotal || 1)).toFixed(3)),
      seedGenres: blended.slice(0, 5)
    };
  });

  return {
    seedGenres,
    regionSurpriseGenres: regionSeeds.length ? [...new Set(regionSeeds)] : ['world', 'latin'],
    selectedClusters: Object.entries(clusterScores)
      .filter(([, weight]) => weight > 1)
      .map(([clusterId]) => clusterId),
    summary,
    totalGenreWeights: genreWeights,
    recommendationPlans
  };
}

module.exports = {
  chooseSeeds,
  INSTRUMENTATION_GENRE_HINTS
};
