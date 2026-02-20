const { Pool } = require('pg');
const fs = require('fs/promises');
const path = require('path');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', '..', 'db', 'migrations');

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

async function ensureMigrationTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getMigrationFiles() {
  const files = await fs.readdir(MIGRATIONS_DIR);
  return files
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

async function getAppliedMigrations(pool) {
  const result = await pool.query('SELECT migration_name FROM schema_migrations');
  return new Set(result.rows.map((row) => row.migration_name));
}

async function applyMigration(pool, migrationName) {
  const migrationPath = path.join(MIGRATIONS_DIR, migrationName);
  const sql = await fs.readFile(migrationPath, 'utf8');

  await pool.query('BEGIN');
  try {
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (migration_name) VALUES ($1)', [migrationName]);
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

async function runMigrations(pool) {
  await ensureMigrationTable(pool);
  const migrationFiles = await getMigrationFiles();
  const appliedMigrations = await getAppliedMigrations(pool);

  for (const migrationName of migrationFiles) {
    if (!appliedMigrations.has(migrationName)) {
      await applyMigration(pool, migrationName);
    }
  }
}

async function createDbConnection() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await ensureTablesExist(pool);
  } catch (error) {
    if (!error.message.includes('Run `npm run db:migrate`')) {
      throw error;
    }

    await runMigrations(pool);
    await ensureTablesExist(pool);
  }

  return pool;
}

module.exports = { createDbConnection };
