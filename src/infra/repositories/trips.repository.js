function getTripWindow(entry = {}) {
  const startsAt = entry.canonical?.firstDeparture || entry.metadata?.firstDeparture || null;
  const endsAt = entry.canonical?.finalArrival || entry.metadata?.finalArrival || null;
  return { startsAt, endsAt };
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

function createTripsRepository({ query, fallbackState, persistFallbackState }) {
  return {
    async saveTripEntry(tripId, entry) {
      const { startsAt, endsAt } = getTripWindow(entry);
      if (query) {
        await query(
          `INSERT INTO trips (trip_id, user_id, status, canonical, raw_payload, source, metadata, starts_at, ends_at, last_updated, errors, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
           ON CONFLICT (trip_id) DO UPDATE SET
             user_id = COALESCE(EXCLUDED.user_id, trips.user_id),
             status = EXCLUDED.status,
             canonical = EXCLUDED.canonical,
             raw_payload = EXCLUDED.raw_payload,
             source = EXCLUDED.source,
             metadata = EXCLUDED.metadata,
             starts_at = COALESCE(EXCLUDED.starts_at, trips.starts_at),
             ends_at = COALESCE(EXCLUDED.ends_at, trips.ends_at),
             last_updated = EXCLUDED.last_updated,
             errors = EXCLUDED.errors,
             updated_at = NOW();`,
          [
            tripId,
            entry.metadata?.userId || null,
            entry.status,
            entry.canonical,
            entry.rawPayload,
            entry.source,
            entry.metadata,
            startsAt,
            endsAt,
            entry.lastUpdated,
            entry.errors
          ]
        );
        return;
      }

      fallbackState.trips[tripId] = entry;
      await persistFallbackState();
    },

    async getTripEntry(tripId) {
      if (query) {
        const result = await query('SELECT * FROM trips WHERE trip_id = $1', [tripId]);
        return result.rowCount === 0 ? null : transformRow(result.rows[0]);
      }
      return fallbackState.trips[tripId] || null;
    },

    async listTripsForRefresh(referenceIso, horizonMinutes = 120, limit = 20) {
      const upperBound = new Date(new Date(referenceIso).getTime() + horizonMinutes * 60 * 1000).toISOString();
      if (query) {
        const result = await query(
          `SELECT trip_id, status, canonical, raw_payload, source, metadata, last_updated, errors
           FROM trips
           WHERE status = 'complete'
             AND starts_at IS NOT NULL
             AND starts_at >= $1::timestamptz
             AND starts_at <= $2::timestamptz
           ORDER BY starts_at ASC
           LIMIT $3`,
          [referenceIso, upperBound, limit]
        );
        return result.rows.map((row) => ({ tripId: row.trip_id, entry: transformRow(row) }));
      }

      return Object.entries(fallbackState.trips)
        .map(([tripId, entry]) => ({ tripId, entry }))
        .filter(({ entry }) => {
          if (entry.status !== 'complete') return false;
          const startsAt = entry.canonical?.firstDeparture || null;
          if (!startsAt) return false;
          return new Date(startsAt) >= new Date(referenceIso) && new Date(startsAt) <= new Date(upperBound);
        })
        .sort((a, b) => new Date(a.entry.canonical.firstDeparture) - new Date(b.entry.canonical.firstDeparture))
        .slice(0, limit);
    }
  };
}

module.exports = { createTripsRepository };
