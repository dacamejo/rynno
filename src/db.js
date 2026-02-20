const { createDbConnection } = require('./infra/db/connection');
const { JsonFileStorageProvider } = require('./infra/storage/jsonFileStorageProvider');
const { MemoryStorageProvider } = require('./infra/storage/memoryStorageProvider');
const { createTripsRepository } = require('./infra/repositories/trips.repository');
const { createOAuthRepository } = require('./infra/repositories/oauth.repository');
const { createReminderRepository } = require('./infra/repositories/reminder.repository');
const { createFeedbackRepository } = require('./infra/repositories/feedback.repository');

let repositories = null;

async function initDb({ storageProvider = null } = {}) {
  const pool = await createDbConnection();
  const query = pool ? pool.query.bind(pool) : null;

  const activeStorageProvider = pool ? null : storageProvider || new JsonFileStorageProvider();
  const fallbackState = activeStorageProvider ? await activeStorageProvider.load() : null;
  const persistFallbackState = activeStorageProvider
    ? async () => activeStorageProvider.save(fallbackState)
    : async () => {};

  repositories = {
    ...createTripsRepository({ query, fallbackState, persistFallbackState }),
    ...createOAuthRepository({ query, fallbackState, persistFallbackState }),
    ...createReminderRepository({ query, fallbackState, persistFallbackState }),
    ...createFeedbackRepository({ query, fallbackState, persistFallbackState })
  };
}

function getRepositories() {
  if (!repositories) {
    throw new Error('Database not initialized. Call initDb() before using repository methods.');
  }
  return repositories;
}

module.exports = {
  initDb,
  saveTripEntry: (...args) => getRepositories().saveTripEntry(...args),
  getTripEntry: (...args) => getRepositories().getTripEntry(...args),
  listTripsForRefresh: (...args) => getRepositories().listTripsForRefresh(...args),
  upsertUser: (...args) => getRepositories().upsertUser(...args),
  saveOAuthToken: (...args) => getRepositories().saveOAuthToken(...args),
  getOAuthToken: (...args) => getRepositories().getOAuthToken(...args),
  createReminder: (...args) => getRepositories().createReminder(...args),
  getReminder: (...args) => getRepositories().getReminder(...args),
  listDueReminders: (...args) => getRepositories().listDueReminders(...args),
  markReminderStatus: (...args) => getRepositories().markReminderStatus(...args),
  recordFeedbackEvent: (...args) => getRepositories().recordFeedbackEvent(...args),
  listFeedbackEvents: (...args) => getRepositories().listFeedbackEvents(...args),
  getFeedbackDashboard: (...args) => getRepositories().getFeedbackDashboard(...args),
  __internals: {
    MemoryStorageProvider
  }
};
