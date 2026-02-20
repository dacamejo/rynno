function toIso(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function getReminderScheduleTime(trip, leadMinutes = 20) {
  const departureIso = toIso(trip?.firstDeparture);
  if (!departureIso) {
    return null;
  }

  const departure = new Date(departureIso);
  return new Date(departure.getTime() - leadMinutes * 60 * 1000).toISOString();
}

function detectTimingShift(previousTrip, refreshedTrip, delayThresholdSeconds = 300) {
  const previousDeparture = toIso(previousTrip?.firstDeparture);
  const refreshedDeparture = toIso(refreshedTrip?.firstDeparture);

  if (!previousDeparture || !refreshedDeparture) {
    return {
      changed: false,
      deltaSeconds: 0,
      reason: 'missing_departure'
    };
  }

  const deltaSeconds = Math.round((new Date(refreshedDeparture) - new Date(previousDeparture)) / 1000);
  const changed = Math.abs(deltaSeconds) >= delayThresholdSeconds;

  return {
    changed,
    deltaSeconds,
    reason: changed ? 'departure_shift' : 'within_threshold'
  };
}

async function dispatchDueReminders({
  db,
  now = new Date().toISOString(),
  limit = 25,
  notifyReminder
}) {
  const dueReminders = await db.listDueReminders(now, limit);
  const sent = [];
  const failed = [];

  for (const reminder of dueReminders) {
    try {
      const tripEntry = await db.getTripEntry(reminder.trip_id);
      const payload = {
        reminderId: reminder.reminder_id,
        tripId: reminder.trip_id,
        userId: reminder.user_id,
        channel: reminder.channel,
        scheduledFor: reminder.scheduled_for,
        trip: tripEntry?.canonical || null,
        metadata: reminder.metadata || {}
      };

      if (typeof notifyReminder === 'function') {
        await notifyReminder(payload);
      }

      const updated = await db.markReminderStatus(reminder.reminder_id, {
        status: 'sent',
        sentAt: new Date().toISOString(),
        metadataPatch: { dispatchedAt: new Date().toISOString() }
      });
      sent.push(updated || reminder);
    } catch (error) {
      const message = error?.message || 'unknown reminder dispatch error';
      await db.markReminderStatus(reminder.reminder_id, {
        status: 'failed',
        failureReason: message,
        metadataPatch: { failedAt: new Date().toISOString() }
      });
      failed.push({ reminderId: reminder.reminder_id, error: message });
    }
  }

  return {
    processed: dueReminders.length,
    sentCount: sent.length,
    failedCount: failed.length,
    sent,
    failed
  };
}

async function refreshTripsForDelays({
  db,
  runTripRefresh,
  maybeRefreshPlaylist,
  now = new Date().toISOString(),
  horizonMinutes = 120,
  limit = 20,
  delayThresholdSeconds = 300
}) {
  const candidates = await db.listTripsForRefresh(now, horizonMinutes, limit);
  const refreshedTrips = [];

  for (const candidate of candidates) {
    const before = candidate.entry?.canonical || {};
    const refreshedEntry = await runTripRefresh(candidate.tripId);
    const after = refreshedEntry?.canonical || refreshedEntry || {};

    const timingShift = detectTimingShift(before, after, delayThresholdSeconds);
    let playlistRefresh = null;

    if (timingShift.changed && typeof maybeRefreshPlaylist === 'function') {
      playlistRefresh = await maybeRefreshPlaylist({
        tripId: candidate.tripId,
        previousTrip: before,
        refreshedTrip: after,
        timingShift
      });
    }

    refreshedTrips.push({
      tripId: candidate.tripId,
      timingShift,
      playlistRefresh
    });
  }

  return {
    scanned: candidates.length,
    refreshedCount: refreshedTrips.length,
    refreshedTrips
  };
}

module.exports = {
  getReminderScheduleTime,
  detectTimingShift,
  dispatchDueReminders,
  refreshTripsForDelays
};
