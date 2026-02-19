const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    name: 'Rynno Backend',
    status: 'ok',
    message: 'Share your SBB itinerary to generate a soundtrack.'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Rynno backend listening on port ${port}`);
});
