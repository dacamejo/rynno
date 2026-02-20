const { URL, URLSearchParams } = require('url');
const REGION_HINTS = [
  { pattern: /Z[üu]rich/i, region: 'Zurich & Zurich Oberland', languages: ['de'], locale: 'de-CH' },
  { pattern: /Gen[èe]ve|Geneva/i, region: 'Lake Geneva (Romandie)', languages: ['fr'], locale: 'fr-CH' },
  { pattern: /Lausanne/i, region: 'Lake Geneva (Romandie)', languages: ['fr'], locale: 'fr-CH' },
  { pattern: /Bern/i, region: 'Bernese Mittelland', languages: ['de'], locale: 'de-CH' },
  { pattern: /Basel/i, region: 'Basel & Aargau', languages: ['de'], locale: 'de-CH' },
  { pattern: /Lugano|Bellinzona|Chiasso/i, region: 'Italian-speaking Switzerland', languages: ['it'], locale: 'it-CH' },
  { pattern: /St\. Gallen|St Gallen|Sankt Gallen/i, region: 'St. Gallen / Eastern Switzerland', languages: ['de'], locale: 'de-CH' },
  { pattern: /Sion|Valais|Wallis|Martigny/i, region: 'Valais & Rhône Valley', languages: ['fr'], locale: 'fr-CH' },
  { pattern: /Interlaken|Grindelwald/i, region: 'Bernese Alps', languages: ['de'], locale: 'de-CH' }
];

const ENERGY_CUE_MAP = {
  IC: 'high',
  IR: 'high',
  ICE: 'high',
  EC: 'high',
  RE: 'medium',
  REX: 'medium',
  S: 'calm',
  R: 'medium',
  TGV: 'high',
  Eurocity: 'high',
  Intercity: 'high',
  RegioExpress: 'medium',
  Regio: 'calm',
  Tram: 'calm',
  Bus: 'calm',
  Walk: 'calm',
  TRANSIT: 'medium',
  DRIVING: 'high',
  BICYCLING: 'medium',
  WALKING: 'calm'
};

const DEFAULT_CONFIDENCE = 60;
const MANUAL_CONFIDENCE = 70;
const CONFIDENCE_MANUAL_REVIEW_THRESHOLD = 70;

function parseTextForFirstUrl(input) {
  if (!input || typeof input !== 'string') return null;
  const match = input.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

function parseSbbShareUrl(sbbUrl) {
  if (!sbbUrl) {
    throw new Error('SBB share URL is required for the SBB adapter.');
  }

  const parsed = new URL(sbbUrl);
  const q = parsed.searchParams;
  const from = q.get('von') || q.get('from') || q.get('fromStation');
  const to = q.get('nach') || q.get('to') || q.get('toStation');
  const date = q.get('date');
  const time = q.get('time');
  const journey = q.get('journeyId') || q.get('journey');
  return { from, to, date, time, journey };
}

function parseGoogleShareUrl(googleUrl) {
  if (!googleUrl) {
    throw new Error('Google Maps URL is required for the Google adapter.');
  }

  const parsed = new URL(googleUrl);
  const q = parsed.searchParams;
  const origin = q.get('origin') || q.get('saddr');
  const destination = q.get('destination') || q.get('daddr');
  const travelMode = (q.get('travelmode') || q.get('mode') || 'transit').toLowerCase();
  const departureEpoch = q.get('departure_time') || q.get('depart') || null;
  const arrivalEpoch = q.get('arrival_time') || null;
  const waypoints = (q.get('waypoints') || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);

  let departureTime = null;
  if (departureEpoch && /^\d+$/.test(departureEpoch)) {
    const dt = new Date(Number(departureEpoch) * 1000);
    departureTime = Number.isNaN(dt.getTime()) ? null : dt;
  }

  return {
    origin,
    destination,
    travelMode,
    departureTime,
    arrivalTime: arrivalEpoch,
    waypoints
  };
}

function detectSourceFromPayload(payload = {}) {
  const url = payload.url || payload.sharedUrl || parseTextForFirstUrl(payload.sharedText || payload.text || '');
  if (!url) return 'manual';

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('sbb.ch')) return 'sbb';
    if (host.includes('google.') || host.includes('goo.gl')) return 'google';
  } catch (_error) {
    return 'manual';
  }

  return 'manual';
}

function normalizeDateTime(dateParam, timeParam) {
  if (!dateParam) {
    return null;
  }

  const normalizedDate = dateParam.replace(/-/g, '');
  if (normalizedDate.length !== 8) {
    return null;
  }

  const [year, month, day] = [normalizedDate.slice(0, 4), normalizedDate.slice(4, 6), normalizedDate.slice(6, 8)];
  let normalizedInput = (timeParam || '00:00').trim();
  if (!normalizedInput.includes(':')) {
    if (normalizedInput.length <= 2) {
      normalizedInput = `${normalizedInput.padStart(2, '0')}:00`;
    } else if (normalizedInput.length <= 3) {
      const padded = normalizedInput.padStart(3, '0');
      normalizedInput = `${padded.slice(0, 1)}:${padded.slice(1, 3)}`;
    } else {
      const padded = normalizedInput.padStart(4, '0');
      normalizedInput = `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
    }
  }
  const parts = normalizedInput.split(':');
  const hour = (parts[0] || '00').padStart(2, '0');
  const minute = (parts[1] || '00').padStart(2, '0').slice(0, 2);
  const normalizedTime = `${hour}:${minute}`;
  const isoString = `${year}-${month}-${day}T${normalizedTime}:00`;
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? null : date;
}

function organizeStationMetadata(name) {
  if (!name) {
    return null;
  }
  for (const hint of REGION_HINTS) {
    if (hint.pattern.test(name)) {
      return hint;
    }
  }
  return null;
}

function dedupeArray(arr = []) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function aggregateRegions(stationNames = []) {
  const regions = [];
  const languages = [];

  stationNames.forEach((station) => {
    const metadata = organizeStationMetadata(station);
    if (metadata) {
      if (metadata.region) regions.push(metadata.region);
      if (metadata.languages) languages.push(...metadata.languages);
    }
  });

  return {
    preferredRegions: dedupeArray(regions).slice(0, 3),
    preferredLanguages: dedupeArray(languages).slice(0, 3)
  };
}

function mapEnergyCue(category, mode) {
  if (!category && mode) {
    const fallback = Object.keys(ENERGY_CUE_MAP).find((key) => key.toLowerCase() === mode.toLowerCase());
    return fallback ? ENERGY_CUE_MAP[fallback] : 'medium';
  }

  if (!category) {
    return 'medium';
  }

  const normalizedCategory = category.replace(/[^a-zA-Z]/g, '');
  return ENERGY_CUE_MAP[normalizedCategory] || ENERGY_CUE_MAP[category] || 'medium';
}

function energyCueForSection(section) {
  const journey = section.journey;
  if (section.walk) {
    return ENERGY_CUE_MAP.Walk;
  }
  if (journey?.category) {
    return mapEnergyCue(journey.category, journey.category);
  }
  if (journey?.name) {
    if (/bus/i.test(journey.name)) return ENERGY_CUE_MAP.Bus;
    if (/tram/i.test(journey.name)) return ENERGY_CUE_MAP.Tram;
  }
  return 'medium';
}

function normalizeMode(section) {
  if (section.walk) return 'walk';
  const journey = section.journey;
  const category = journey?.category?.toLowerCase() || '';
  if (category.includes('bus')) return 'bus';
  if (category.includes('tram') || category.includes('trolley') || category.includes('light')) return 'tram';
  if (/s|sbahn/.test(category)) return 's-bahn';
  return 'train';
}

function createLegFromSection(section, index) {
  const departureTime = section.departure?.departure || section.departure?.date || section.departure?.departureTime;
  const arrivalTime = section.arrival?.arrival || section.arrival?.date || section.arrival?.arrivalTime;
  const depTimestamp = departureTime ? new Date(departureTime) : null;
  const arrTimestamp = arrivalTime ? new Date(arrivalTime) : null;

  const durationSeconds = depTimestamp && arrTimestamp ? Math.max(0, Math.round((arrTimestamp - depTimestamp) / 1000)) : null;

  const platform = section.departure?.platform ?? section.departure?.prognosis?.platform;
  const serviceName = section.journey?.name || section.journey?.shortName || (section.walk ? 'Walk' : 'Transfer');
  const mode = normalizeMode(section);
  const energyCue = energyCueForSection(section);

  const departureStation = section.departure?.station?.name || section.departure?.station?.title;
  const arrivalStation = section.arrival?.station?.name || section.arrival?.station?.title;

  const prognosis = {
    departure: section.departure?.prognosis?.departure !== undefined ? section.departure.prognosis : null,
    arrival: section.arrival?.prognosis?.arrival !== undefined ? section.arrival.prognosis : null,
    delay: section.departure?.delay ?? section.departure?.prognosis?.delay ?? 0
  };

  const leg = {
    index,
    mode,
    departureTime: depTimestamp ? depTimestamp.toISOString() : null,
    arrivalTime: arrTimestamp ? arrTimestamp.toISOString() : null,
    durationSeconds,
    departureStation,
    arrivalStation,
    platform,
    serviceName,
    energyCue,
    distanceMeters: section.distance ?? null,
    prognosis
  };

  return leg;
}

function canonicalLegsFromConnection(connection = {}) {
  if (!Array.isArray(connection.sections) || connection.sections.length === 0) {
    return [];
  }

  const legs = [];
  connection.sections.forEach((section, index) => {
    const leg = createLegFromSection(section, index);
    if (leg.departureTime && leg.arrivalTime) {
      legs.push(leg);
    }
  });

  return legs;
}

async function fetchSbbConnection(query) {
  const baseUrl = process.env.SBB_OPENDATA_URL || 'https://transport.opendata.ch/v1/connections';
  const params = new URLSearchParams({
    from: query.from,
    to: query.to,
    date: query.date,
    time: query.time,
    limit: '3'
  });
  if (query.journey) {
    params.set('journey', query.journey);
  }

  const response = await fetch(`${baseUrl}?${params.toString()}`, {
    headers: { 'User-Agent': 'RynnoParser/1.0' },
    cache: 'no-store'
  });

  if (!response.ok) {
    const body = await response.text().catch(() => null);
    throw new Error(`Transport API failure (${response.status}): ${body || 'no details'}`);
  }

  const payload = await response.json();
  return payload.connections?.[0] ?? null;
}

function buildValidation(canonical) {
  const issues = [];
  const warnings = [];
  let scoreDelta = 0;

  if (!canonical.legs?.length) {
    issues.push('No trip legs parsed.');
    scoreDelta -= 45;
  }

  if (!canonical.firstDeparture || !canonical.finalArrival) {
    issues.push('Missing departure/arrival timestamps.');
    scoreDelta -= 20;
  }

  const hasMissingStations = canonical.legs?.some((leg) => !leg.departureStation || !leg.arrivalStation);
  if (hasMissingStations) {
    warnings.push('Some legs are missing station names.');
    scoreDelta -= 8;
  }

  const hasMissingDurations = canonical.legs?.some((leg) => !leg.durationSeconds || leg.durationSeconds <= 0);
  if (hasMissingDurations) {
    warnings.push('Some legs are missing valid durations.');
    scoreDelta -= 10;
  }

  if (!canonical.preferredRegions?.length) {
    warnings.push('No region hints inferred from parsed stations.');
    scoreDelta -= 5;
  }

  if (canonical.metadata?.fallback) {
    warnings.push(`Fallback path used: ${canonical.metadata.fallback}`);
    scoreDelta -= 12;
  }

  if (canonical.source === 'google' && canonical.metadata?.google?.waypointCount > 2) {
    warnings.push('Google route has multiple waypoints; leg detail may be coarse.');
    scoreDelta -= 5;
  }

  const score = Math.max(0, Math.min(100, canonical.confidenceScore + scoreDelta));
  return {
    score,
    threshold: CONFIDENCE_MANUAL_REVIEW_THRESHOLD,
    needsManualReview: score < CONFIDENCE_MANUAL_REVIEW_THRESHOLD,
    issues,
    warnings
  };
}

function buildCanonicalTrip({
  tripId,
  source,
  legs,
  metadata = {},
  rawPayload,
  confidence = DEFAULT_CONFIDENCE,
  fallbackReason = null
}) {
  const sortedLegs = legs.slice().sort((a, b) => {
    if (!a.departureTime || !b.departureTime) return 0;
    return new Date(a.departureTime) - new Date(b.departureTime);
  });

  const firstDeparture = sortedLegs[0]?.departureTime || null;
  const finalArrival = sortedLegs[sortedLegs.length - 1]?.arrivalTime || null;
  const totalDurationSeconds = sortedLegs.reduce((sum, leg) => sum + (leg.durationSeconds || 0), 0);
  const distanceMeters = sortedLegs.reduce((sum, leg) => sum + (leg.distanceMeters || 0), 0);

  const { preferredRegions, preferredLanguages } = aggregateRegions([
    sortedLegs[0]?.departureStation,
    sortedLegs[sortedLegs.length - 1]?.arrivalStation
  ]);

  const mergedRegions = dedupeArray([...(metadata.preferredRegions || []), ...preferredRegions]);
  const mergedLanguages = dedupeArray([...(metadata.preferredLanguages || []), ...preferredLanguages, 'en']);

  const parsedLocale = metadata.locale || mergedLanguages[0] || 'en-CH';
  const tags = metadata.tags && metadata.tags.length ? metadata.tags : ['no-preference'];

  const delays = sortedLegs
    .map((leg) => leg.prognosis?.delay || 0)
    .filter((delay) => delay > 0)
    .map((delay, index) => ({ index, delaySeconds: delay }));

  const summary = {
    tripId,
    source,
    locale: parsedLocale,
    preferredLanguages: mergedLanguages,
    preferredRegions: mergedRegions,
    tags,
    legs: sortedLegs,
    totalDurationSeconds,
    firstDeparture,
    finalArrival,
    distanceMeters,
    weatherContext: null,
    delayInfo: delays,
    confidenceScore: Math.min(100, Math.max(0, confidence)),
    metadata: {
      fallback: fallbackReason,
      rawPayload,
      parserVersion: 'v2-adapters-validation'
    }
  };

  summary.validation = buildValidation(summary);
  summary.confidenceScore = summary.validation.score;

  return summary;
}

function createFallbackLeg(parsed, metadata = {}) {
  const departureDate = normalizeDateTime(parsed.date, parsed.time) || new Date();
  const durationMinutes = metadata.durationMinutes ?? 60;
  const arrivalDate = new Date(departureDate.getTime() + durationMinutes * 60 * 1000);

  return {
    index: 0,
    mode: metadata.mode || 'train',
    departureTime: departureDate.toISOString(),
    arrivalTime: arrivalDate.toISOString(),
    durationSeconds: durationMinutes * 60,
    departureStation: parsed.from,
    arrivalStation: parsed.to,
    platform: null,
    serviceName: 'Manual estimate',
    energyCue: metadata.energyCue || 'medium',
    distanceMeters: metadata.distanceMeters ?? Math.round(durationMinutes * 850),
    prognosis: { source: 'fallback' }
  };
}

async function runSbbAdapter({ tripId, payload, metadata = {} }) {
  const sourceUrl = payload.url || payload.sharedUrl || parseTextForFirstUrl(payload.sharedText || payload.text || '');
  const parsed = parseSbbShareUrl(sourceUrl);
  if (!parsed.from || !parsed.to || !parsed.date) {
    throw new Error('Share link lacks required origin/destination/date information.');
  }

  let legs = [];
  let fallbackReason = null;
  try {
    const connection = await fetchSbbConnection({
      from: parsed.from,
      to: parsed.to,
      date: parsed.date,
      time: parsed.time || '00:00',
      journey: parsed.journey
    });

    if (connection) {
      legs = canonicalLegsFromConnection(connection);
    } else {
      fallbackReason = 'transport-api-empty';
    }
  } catch (error) {
    fallbackReason = `transport-api-error: ${error.message}`;
  }

  if (!legs.length) {
    legs.push(createFallbackLeg(parsed, metadata));
  }

  const canonical = buildCanonicalTrip({
    tripId,
    source: 'sbb',
    legs,
    metadata,
    rawPayload: payload,
    confidence: DEFAULT_CONFIDENCE + 20,
    fallbackReason
  });

  return canonical;
}

function runGoogleAdapter({ tripId, payload, metadata = {} }) {
  const sourceUrl = payload.url || payload.sharedUrl || parseTextForFirstUrl(payload.sharedText || payload.text || '');
  const parsed = parseGoogleShareUrl(sourceUrl);

  if (!parsed.origin || !parsed.destination) {
    throw new Error('Google Maps link lacks origin or destination.');
  }

  const departureDate = parsed.departureTime || new Date();
  const durationMinutes = metadata.durationMinutes || (parsed.travelMode === 'walking' ? 35 : 70);
  const arrivalDate = new Date(departureDate.getTime() + durationMinutes * 60 * 1000);

  const leg = {
    index: 0,
    mode: parsed.travelMode === 'transit' ? 'train' : parsed.travelMode,
    departureTime: departureDate.toISOString(),
    arrivalTime: arrivalDate.toISOString(),
    durationSeconds: durationMinutes * 60,
    departureStation: parsed.origin,
    arrivalStation: parsed.destination,
    platform: null,
    serviceName: `Google Maps ${parsed.travelMode}`,
    energyCue: mapEnergyCue(parsed.travelMode.toUpperCase(), parsed.travelMode),
    distanceMeters: metadata.distanceMeters ?? null,
    prognosis: { source: 'google-share-link' }
  };

  return buildCanonicalTrip({
    tripId,
    source: 'google',
    legs: [leg],
    metadata: {
      ...metadata,
      google: {
        waypoints: parsed.waypoints,
        waypointCount: parsed.waypoints.length
      }
    },
    rawPayload: payload,
    confidence: DEFAULT_CONFIDENCE + 8,
    fallbackReason: 'google-share-summary'
  });
}

function validateManualPayload(payload) {
  const required = ['from', 'to', 'date', 'time'];
  const missing = required.filter((field) => !payload[field]);
  if (missing.length) {
    throw new Error(`Manual payload missing fields: ${missing.join(', ')}`);
  }
  return true;
}

function runManualAdapter({ tripId, payload, metadata = {} }) {
  validateManualPayload(payload);
  const departureDate = normalizeDateTime(payload.date, payload.time);
  if (!departureDate) {
    throw new Error('Invalid manual date/time format.');
  }

  const leg = createFallbackLeg(
    { from: payload.from, to: payload.to, date: payload.date, time: payload.time },
    {
      durationMinutes: payload.durationMinutes,
      mode: payload.mode || 'train',
      distanceMeters: payload.distanceMeters,
      energyCue: payload.energyCue || 'medium'
    }
  );

  leg.serviceName = payload.serviceName || `Manual ${leg.mode}`;

  const canonical = buildCanonicalTrip({
    tripId,
    source: 'manual',
    legs: [leg],
    metadata,
    rawPayload: payload,
    confidence: MANUAL_CONFIDENCE,
    fallbackReason: 'manual-estimate'
  });

  return canonical;
}

async function runAdapter({ tripId, source, payload, metadata = {} }) {
  const normalizedSource = (source || payload?.source || 'manual').toLowerCase();
  const detectedSource = normalizedSource === 'share_target' ? detectSourceFromPayload(payload) : normalizedSource;

  switch (detectedSource) {
    case 'sbb':
      return runSbbAdapter({ tripId, payload, metadata });
    case 'google':
      return runGoogleAdapter({ tripId, payload, metadata });
    case 'manual':
      return runManualAdapter({ tripId, payload, metadata });
    default:
      throw new Error(`Unsupported source '${detectedSource}'. Supported sources: sbb, google, manual, share_target.`);
  }
}

module.exports = {
  runAdapter,
  parseSbbShareUrl,
  parseGoogleShareUrl,
  normalizeDateTime,
  buildCanonicalTrip,
  buildValidation
};
