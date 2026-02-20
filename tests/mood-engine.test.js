const test = require('node:test');
const assert = require('node:assert/strict');

const { buildProfile } = require('../services/moodHeuristics');
const { chooseSeeds } = require('../services/seedCatalog');

test('buildProfile returns RhythmProfile_v1 with core target fields', () => {
  const profile = buildProfile(
    {
      firstDeparture: '2026-02-20T18:30:00.000Z',
      tags: ['family', 'celebration'],
      legs: [{ mode: 'IC' }, { mode: 'walk' }],
      preferredRegions: ['Alps']
    },
    {
      moodHints: { energetic: true },
      eraPreference: 'heritage'
    }
  );

  assert.equal(profile.profileVersion, 'RhythmProfile_v1');
  assert.ok(profile.targetEnergy >= 0.1 && profile.targetEnergy <= 0.95);
  assert.ok(profile.targetValence >= 0.05 && profile.targetValence <= 0.95);
  assert.ok(profile.eraBias.includes('heritage'));
  assert.ok(typeof profile.instrumentationCue === 'string');
});

test('chooseSeeds builds weighted recommendation plans', () => {
  const profile = {
    instrumentationCue: 'strings',
    eraBias: ['widescreen', 'heritage']
  };

  const seeds = chooseSeeds(
    profile,
    { preferredRegions: ['Lake Geneva'] },
    { moodHints: { calm: true } }
  );

  assert.ok(Array.isArray(seeds.recommendationPlans));
  assert.ok(seeds.recommendationPlans.length > 0);
  const totalWeight = seeds.recommendationPlans.reduce((acc, plan) => acc + plan.weight, 0);
  assert.ok(totalWeight > 0.98 && totalWeight <= 1.01);
  seeds.recommendationPlans.forEach((plan) => {
    assert.ok(plan.seedGenres.length > 0 && plan.seedGenres.length <= 5);
  });
});
