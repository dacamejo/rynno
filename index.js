const { createServer } = require('./src/app/createServer');
const { initDb } = require('./src/db');

const port = process.env.PORT || 3000;

async function startServer() {
  await initDb();
  const app = createServer();
  app.listen(port, () => {
    console.log(`Rynno backend listening on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
