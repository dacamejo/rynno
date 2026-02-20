const test = require('node:test');
const assert = require('node:assert/strict');

const { __internals } = require('../services/playlistBuilder');

const { evaluateGuardrails, failsLanguageFitCheck, getFirstTrackIssue } = __internals;

test('failsLanguageFitCheck flags tracks that do not match preferred language hints', () => {
  const englishTrack = {
    name: 'Love in the Night Train',
    artists: [{ name: 'City Lights' }]
  };

  const frenchTrack = {
    name: 'Bonjour Gare',
    artists: [{ name: 'Les Voix' }]
  };

  assert.equal(failsLanguageFitCheck(englishTrack, 'english'), false);
  assert.equal(failsLanguageFitCheck(frenchTrack, 'english'), true);
});

test('getFirstTrackIssue catches explicit and energy quality misses', () => {
  const baseProfile = {
    lyricSafety: 'clean',
    targetEnergy: 0.55
  };

  const explicitIssue = getFirstTrackIssue(
    { explicit: true, popularity: 50 },
    { energy: 0.55 },
    baseProfile
  );
  assert.match(explicitIssue, /explicit/i);

  const energyIssue = getFirstTrackIssue(
    { explicit: false, popularity: 50 },
    { energy: 0.92 },
    baseProfile
  );
  assert.match(energyIssue, /energy/i);
});

test('evaluateGuardrails returns failure reasons including language and first-track checks', () => {
  const tracks = [
    {
      id: 't1',
      name: 'Bonjour Gare',
      artists: [{ name: 'Les Voix' }],
      explicit: false,
      popularity: 10
    },
    {
      id: 't2',
      name: 'Bonjour Nuit',
      artists: [{ name: 'Les Voix' }],
      explicit: false,
      popularity: 35
    }
  ];

  const features = [
    { id: 't1', energy: 0.9, danceability: 0.7, acousticness: 0.1, instrumentalness: 0.1 },
    { id: 't2', energy: 0.88, danceability: 0.7, acousticness: 0.1, instrumentalness: 0.1 }
  ];

  const profile = {
    targetEnergy: 0.55,
    lyricSafety: 'clean',
    instrumentationCue: 'percussion',
    languagePreference: 'english',
    maxGuardrailEnergyDelta: 0.35,
    guardrailSampleSize: 2
  };

  const result = evaluateGuardrails(tracks, features, profile);
  assert.equal(result.pass, false);
  assert.ok(result.languageIssues > 0);
  assert.ok(result.firstTrackIssue);
  assert.ok(result.reasons.some((reason) => /off-language/.test(reason)));
});
