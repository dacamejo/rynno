const { Pool } = require('pg');

async function ensureTablesExist(pool) {
  const result = await pool.query(
    `SELECT
      to_regclass('public.trips') AS trips_table,
      to_regclass('public.users') AS users_table,
      to_regclass('public.oauth_tokens') AS oauth_tokens_table,
      to_regclass('public.reminders') AS reminders_table,
      to_regclass('public.feedback_events') AS feedback_events_table;`
  );
  if (!result.rows[0]?.trips_table) {
    throw new Error('Missing `trips` table. Run `npm run db:migrate` before starting the server.');
  }
  if (
    !result.rows[0]?.users_table ||
    !result.rows[0]?.oauth_tokens_table ||
    !result.rows[0]?.reminders_table ||
    !result.rows[0]?.feedback_events_table
  ) {
    throw new Error('Missing auth-related tables. Run `npm run db:migrate` before starting the server.');
  }
}

async function createDbConnection() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await ensureTablesExist(pool);
  return pool;
}

module.exports = { createDbConnection };
