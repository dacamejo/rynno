const fs = require('fs/promises');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'db', 'migrations');

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
    console.log(`Applied migration: ${migrationName}`);
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL not set. Skipping migrations.');
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await ensureMigrationTable(pool);
    const migrationFiles = await getMigrationFiles();
    const appliedMigrations = await getAppliedMigrations(pool);

    for (const migrationName of migrationFiles) {
      if (!appliedMigrations.has(migrationName)) {
        await applyMigration(pool, migrationName);
      }
    }

    console.log('Migration run complete.');
  } finally {
    await pool.end();
  }
}

runMigrations().catch((error) => {
  console.error('Migration failed', error);
  process.exit(1);
});
