const test = require('node:test');
const assert = require('node:assert/strict');

const { __internals } = require('../services/playlistBuilder');

const {
  buildRecommendationParams,
  mergeUniqueTracks,
  adjustProfileForGuardrail,
  adjustSeedsForGuardrail
} = __internals;

test('buildRecommendationParams nudges target energy on retries', () => {
  const profile = { playlistLength: 10, targetEnergy: 0.5, maxEnergy: 0.7 };
  const base = buildRecommendationParams(profile, { seedGenres: ['pop'] }, 1);
  const retry = buildRecommendationParams(profile, { seedGenres: ['pop'] }, 2);

  assert.equal(base.target_energy, 0.5);
  assert.notEqual(retry.target_energy, base.target_energy);
  assert.ok(retry.max_energy >= base.max_energy);
});

test('mergeUniqueTracks removes duplicate track ids across groups', () => {
  const merged = mergeUniqueTracks([
    [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    [{ id: 'b', name: 'B2' }, { id: 'c', name: 'C' }]
  ]);

  assert.deepEqual(
    merged.map((track) => track.id),
    ['a', 'b', 'c']
  );
});

test('guardrail profile/seed adjustment hardens clean-mode and genre hints', () => {
  const profile = { targetEnergy: 0.8, maxGuardrailEnergyDelta: 0.35, instrumentationCue: 'strings', languagePreference: 'ENGLISH' };
  const seeds = { seedGenres: ['electro'], recommendationPlans: [{ seedGenres: ['electro'] }] };
  const guardrail = {
    explicitIssues: 1,
    energyIssues: 2,
    avgEnergyDirection: 0.4,
    languageIssues: 2,
    instrumentationIssues: 1,
    firstTrackIssue: 'bad open'
  };

  adjustProfileForGuardrail(profile, guardrail);
  adjustSeedsForGuardrail(seeds, guardrail, profile);

  assert.equal(profile.lyricSafety, 'clean');
  assert.equal(profile.languagePreference, 'english');
  assert.ok(seeds.seedGenres.includes('acoustic'));
  assert.ok(seeds.seedGenres.length <= 5);
});
