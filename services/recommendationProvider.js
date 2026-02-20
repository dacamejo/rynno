const spotifyClient = require('./spotifyClient');

function createSpotifyRecommendationProvider(client = spotifyClient) {
  return {
    async getRecommendations(accessToken, params) {
      return client.getRecommendations(accessToken, params);
    },
    async getAudioFeatures(accessToken, trackIds) {
      return client.getAudioFeatures(accessToken, trackIds);
    }
  };
}

module.exports = {
  createSpotifyRecommendationProvider
};
