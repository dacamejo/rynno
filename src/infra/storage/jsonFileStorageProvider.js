const path = require('path');
const fs = require('fs/promises');
const { StorageProvider } = require('./storageProvider');

const DATA_DIR = path.resolve(__dirname, '..', '..', '..', 'data');
const FALLBACK_FILE = path.join(DATA_DIR, 'trips.json');

function normalizeState(state = {}) {
  return {
    trips: state.trips || {},
    users: state.users || {},
    oauthTokens: state.oauthTokens || {},
    reminders: state.reminders || {},
    feedbackEvents: state.feedbackEvents || []
  };
}

class JsonFileStorageProvider extends StorageProvider {
  async #ensureDataDir() {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  async load() {
    try {
      const text = await fs.readFile(FALLBACK_FILE, 'utf8');
      return normalizeState(JSON.parse(text));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Unable to read fallback trip store', error);
      }
      return normalizeState();
    }
  }

  async save(state) {
    await this.#ensureDataDir();
    await fs.writeFile(FALLBACK_FILE, JSON.stringify(normalizeState(state), null, 2));
  }
}

module.exports = {
  JsonFileStorageProvider,
  normalizeState
};
