const path = require('path');
const fs = require('fs/promises');
const { Pool } = require('pg');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const FALLBACK_FILE = path.join(DATA_DIR, 'trips.json');

let pool = null;
let fallbackStore = {};

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadFallbackStore() {
  try {
    const text = await fs.readFile(FALLBACK_FILE, 'utf8');
    fallbackStore = JSON.parse(text);
  } catch (error) {
    if (error.code === 'ENOENT') {
      fallbackStore = {};
    } else {
      console.error('Unable to read fallback trip store', error);
      fallbackStore = {};
    }
  }
}

async function persistFallbackStore() {
  await ensureDataDir();
  await fs.writeFile(FALLBACK_FILE, JSON.stringify(fallbackStore, null, 2));
}

async function ensureTripsTableExists() {
  const result = await pool.query(`
    SELECT to_regclass('public.trips') AS trips_table;
  `);
  if (!result.rows[0]?.trips_table) {
    throw new Error('Missing `trips` table. Run `npm run db:migrate` before starting the server.');
  }
}

async function initDb() {
  if (process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await ensureTripsTableExists();
  } else {
    await ensureDataDir();
    await loadFallbackStore();
  }
}

function transformRow(row) {
  if (!row) return null;
  return {
    status: row.status,
    canonical: row.canonical,
    rawPayload: row.raw_payload,
    source: row.source,
    metadata: row.metadata || {},
    lastUpdated: row.last_updated,
    errors: row.errors || []
  };
}

async function saveTripEntry(tripId, entry) {
  if (pool) {
    await pool.query(
      `INSERT INTO trips (trip_id, status, canonical, raw_payload, source, metadata, last_updated, errors, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (trip_id) DO UPDATE SET
         status = EXCLUDED.status,
         canonical = EXCLUDED.canonical,
         raw_payload = EXCLUDED.raw_payload,
         source = EXCLUDED.source,
         metadata = EXCLUDED.metadata,
         last_updated = EXCLUDED.last_updated,
         errors = EXCLUDED.errors,
         updated_at = NOW();`,
      [
        tripId,
        entry.status,
        entry.canonical,
        entry.rawPayload,
        entry.source,
        entry.metadata,
        entry.lastUpdated,
        entry.errors
      ]
    );
    return;
  }

  fallbackStore[tripId] = entry;
  await persistFallbackStore();
}

async function getTripEntry(tripId) {
  if (pool) {
    const result = await pool.query('SELECT * FROM trips WHERE trip_id = $1', [tripId]);
    if (result.rowCount === 0) {
      return null;
    }
    return transformRow(result.rows[0]);
  }

  return fallbackStore[tripId] || null;
}

module.exports = {
  initDb,
  saveTripEntry,
  getTripEntry
};
