const { StorageProvider } = require('./storageProvider');
const { normalizeState } = require('./jsonFileStorageProvider');

class MemoryStorageProvider extends StorageProvider {
  constructor(initialState = {}) {
    super();
    this.state = normalizeState(initialState);
  }

  async load() {
    return normalizeState(this.state);
  }

  async save(state) {
    this.state = normalizeState(state);
  }
}

module.exports = { MemoryStorageProvider };
