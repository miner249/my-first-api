const { getTodayMatchesCached, getLiveMatches } = require('../lib/api');

async function fetchLiveSnapshot() {
  const { matches, source } = await getLiveMatches();
  return { matches, source };
}

async function fetchScheduleSnapshot() {
  const { matches, source } = await getTodayMatchesCached();
  return { matches, source };
}

module.exports = { fetchLiveSnapshot, fetchScheduleSnapshot };
