/**
 * live_engine/liveDataProvider.js
 */

const fetch = require('node-fetch');

// ──────────────────────────────────────────────────────────────
// Server-side cache
// ──────────────────────────────────────────────────────────────
const cache = {
  live: {
    data:          null,
    fetchedAt:     0,
    ttl:           30_000,
    rateLimitedAt: 0,
    rateLimitTtl:  120_000,
  },
  schedule: {
    data:          null,
    fetchedAt:     0,
    ttl:           90_000,
    rateLimitedAt: 0,
    rateLimitTtl:  120_000,
  },
};

function isCacheValid(entry) {
  if (!entry.data) return false;
  return (Date.now() - entry.fetchedAt) < entry.ttl;
}

function isRateLimited(entry) {
  if (!entry.rateLimitedAt) return false;
  return (Date.now() - entry.rateLimitedAt) < entry.rateLimitTtl;
}

function stamp(matches, source) {
  return {
    matches:   matches || [],
    source:    source  || 'none',
    fetchedAt: new Date().toISOString(),
    count:     (matches || []).length,
  };
}

// ──────────────────────────────────────────────────────────────
// Core Football-Data fetcher
// ──────────────────────────────────────────────────────────────
async function fetchFromFootballData(endpoint) {
  const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

  if (!FOOTBALL_DATA_API_KEY) {
    console.warn('⚠️  [Football-Data] API key not set');
    return { error: 'NO_API_KEY', data: null };
  }

  try {
    const url = `https://api.football-data.org/v4${endpoint}`;
    console.log(`📡 [Football-Data] GET ${endpoint}`);

    const response = await fetch(url, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY },
    });

    if (response.status === 429) {
      console.warn('⚠️  [Football-Data] Rate limited');
      return { error: 'RATE_LIMITED', data: null };
    }

    if (!response.ok) {
      console.error(`❌ [Football-Data] HTTP ${response.status}`);
      return { error: `HTTP_${response.status}`, data: null };
    }

    const data = await response.json();
    return { error: null, data };

  } catch (err) {
    console.error('❌ [Football-Data] Error:', err.message);
    return { error: err.message, data: null };
  }
}

// ──────────────────────────────────────────────────────────────
// Map Football-Data match to our format
// ──────────────────────────────────────────────────────────────
function mapMatch(m) {
  return {
    id:          m.id,
    home_team:   m.homeTeam?.name    || m.homeTeam?.shortName  || 'Unknown',
    away_team:   m.awayTeam?.name    || m.awayTeam?.shortName  || 'Unknown',
    league:      m.competition?.name || 'Unknown',
    status:      m.status,
    status_time: m.minute ? `${m.minute}'` : null,
    start_time:  m.utcDate,
    home_score:  m.score?.fullTime?.home  ?? m.score?.halfTime?.home  ?? null,
    away_score:  m.score?.fullTime?.away  ?? m.score?.halfTime?.away  ?? null,
    source:      'football-data',
  };
}

// ──────────────────────────────────────────────────────────────
// Schedule snapshot  (all matches today + tomorrow)
// ──────────────────────────────────────────────────────────────
async function fetchScheduleSnapshot() {
  if (isCacheValid(cache.schedule)) {
    const age = Math.round((Date.now() - cache.schedule.fetchedAt) / 1000);
    console.log(`💾 [Cache] Schedule — ${age}s old`);
    return cache.schedule.data;
  }

  if (isRateLimited(cache.schedule)) {
    const wait = Math.round((cache.schedule.rateLimitTtl - (Date.now() - cache.schedule.rateLimitedAt)) / 1000);
    console.warn(`⏳ [Schedule] Rate limited — ${wait}s remaining, serving stale`);
    return cache.schedule.data || stamp([], 'rate-limited');
  }

  const today    = new Date().toISOString().split('T')[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 2);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const { error, data } = await fetchFromFootballData(
    `/matches?dateFrom=${today}&dateTo=${tomorrowStr}`
  );

  if (error === 'RATE_LIMITED') {
    cache.schedule.rateLimitedAt = Date.now();
    return cache.schedule.data || stamp([], 'rate-limited');
  }

  if (error || !data) {
    return cache.schedule.data || stamp([], 'error');
  }

  const matches = (data.matches || []).map(mapMatch);
  const result  = stamp(matches, 'football-data');

  cache.schedule.data          = result;
  cache.schedule.fetchedAt     = Date.now();
  cache.schedule.rateLimitedAt = 0;

  console.log(`✅ [Schedule] Cached ${matches.length} fixtures`);
  return result;
}

// ──────────────────────────────────────────────────────────────
// Live snapshot  — derived from schedule + separate live call
// No Apify needed. Uses schedule cache to avoid extra API calls.
// ──────────────────────────────────────────────────────────────
async function fetchLiveSnapshot() {
  if (isCacheValid(cache.live)) {
    const age = Math.round((Date.now() - cache.live.fetchedAt) / 1000);
    console.log(`💾 [Cache] Live — ${age}s old`);
    return cache.live.data;
  }

  console.log('🔄 [Live] Fetching live matches from Football-Data...');

  // Step 1 — get schedule (uses cache if available, saves quota)
  const schedule = await fetchScheduleSnapshot();

  // Step 2 — filter for IN_PLAY and PAUSED from schedule cache
  const liveFromSchedule = (schedule.matches || []).filter(
    m => m.status === 'IN_PLAY' || m.status === 'PAUSED'
  );

  // Step 3 — if schedule has live matches, use them directly (no extra API call)
  if (liveFromSchedule.length > 0) {
    console.log(`✅ [Live] ${liveFromSchedule.length} live matches from schedule cache`);
    const result = stamp(liveFromSchedule, 'football-data');
    cache.live.data      = result;
    cache.live.fetchedAt = Date.now();
    return result;
  }

  // Step 4 — schedule cache might be stale, do a direct live call
  if (isRateLimited(cache.live)) {
    const wait = Math.round((cache.live.rateLimitTtl - (Date.now() - cache.live.rateLimitedAt)) / 1000);
    console.warn(`⏳ [Live] Rate limited — ${wait}s remaining`);
    return cache.live.data || stamp([], 'rate-limited');
  }

  const { error, data } = await fetchFromFootballData('/matches?status=LIVE');

  if (error === 'RATE_LIMITED') {
    cache.live.rateLimitedAt = Date.now();
    return cache.live.data || stamp([], 'rate-limited');
  }

  if (error || !data) {
    return cache.live.data || stamp([], 'error');
  }

  const matches = (data.matches || []).map(mapMatch);
  const result  = stamp(matches, 'football-data');

  cache.live.data          = result;
  cache.live.fetchedAt     = Date.now();
  cache.live.rateLimitedAt = 0;

  console.log(`✅ [Live] Cached ${matches.length} live matches`);
  return result;
}

// ──────────────────────────────────────────────────────────────
// Find a specific match by team names
// ──────────────────────────────────────────────────────────────
async function findMatch(homeTeam, awayTeam) {
  const normalize = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const tHome     = normalize(homeTeam);
  const tAway     = normalize(awayTeam);

  const schedule = await fetchScheduleSnapshot();

  const match = (schedule.matches || []).find(m => {
    const mHome = normalize(m.home_team);
    const mAway = normalize(m.away_team);
    return (
      (mHome === tHome && mAway === tAway) ||
      (mHome.includes(tHome) && mAway.includes(tAway)) ||
      (tHome.includes(mHome) && tAway.includes(mAway))
    );
  });

  return match || null;
}

// ──────────────────────────────────────────────────────────────
// Get match stats  (basic — Football-Data doesn't give deep stats)
// ──────────────────────────────────────────────────────────────
async function getMatchStats(matchId) {
  const { error, data } = await fetchFromFootballData(`/matches/${matchId}`);
  if (error || !data) return null;

  return {
    goals: {
      home: data.score?.fullTime?.home ?? data.score?.halfTime?.home ?? 0,
      away: data.score?.fullTime?.away ?? data.score?.halfTime?.away ?? 0,
    },
    source: 'football-data',
  };
}

// ──────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────
module.exports = {
  fetchLiveSnapshot,
  fetchScheduleSnapshot,
  findMatch,
  getMatchStats,
};