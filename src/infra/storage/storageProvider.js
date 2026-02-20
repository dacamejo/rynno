class StorageProvider {
  async load() {
    throw new Error('StorageProvider.load() must be implemented');
  }

  async save(_state) {
    throw new Error('StorageProvider.save() must be implemented');
  }
}

module.exports = { StorageProvider };
