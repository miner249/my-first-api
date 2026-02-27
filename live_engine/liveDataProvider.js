/**
 * live_engine/liveDataProvider.js
 */

const fetch = require('node-fetch');
const { getLiveMatches, findMatch, getMatchStats } = require('../live_engine/liveTracker');

// ──────────────────────────────────────────────────────────────
// Server-side cache
// ──────────────────────────────────────────────────────────────
const cache = {
  live: {
    data:          null,
    fetchedAt:     0,
    ttl:           30_000,    // 30 seconds
    rateLimitedAt: 0,
    rateLimitTtl:  120_000,   // wait 2 minutes after rate limit before retrying
  },
  schedule: {
    data:          null,
    fetchedAt:     0,
    ttl:           90_000,    // 90 seconds — safe for free tier (10 req/min)
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

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
function stamp(matches, source) {
  return {
    matches:   matches || [],
    source:    source  || 'none',
    fetchedAt: new Date().toISOString(),
    count:     (matches || []).length,
  };
}

// ──────────────────────────────────────────────────────────────
// Live snapshot
// ──────────────────────────────────────────────────────────────
async function fetchLiveSnapshot() {
  if (isCacheValid(cache.live)) {
    const age = Math.round((Date.now() - cache.live.fetchedAt) / 1000);
    console.log(`💾 [Cache] Live — ${age}s old, TTL ${cache.live.ttl / 1000}s`);
    return cache.live.data;
  }

  console.log('🔄 [Live] Cache expired — fetching fresh data...');

  try {
    const { matches, source } = await getLiveMatches();

    const normalized = (matches || []).map(m => ({
      id:          m.eventId    || m.id,
      home_team:   m.home_team  || m.home  || 'Unknown',
      away_team:   m.away_team  || m.away  || 'Unknown',
      league:      m.league     || 'Unknown',
      status:      m.status,
      status_time: m.status_time || m.status,
      home_score:  m.homeScore  ?? m.home_score ?? null,
      away_score:  m.awayScore  ?? m.away_score ?? null,
      start_time:  m.startTime  || m.start_time || null,
      history:     m.history    || [],
      stats:       m.stats      || {},
      source:      m.source     || source,
    }));

    const result = stamp(normalized, source);

    cache.live.data      = result;
    cache.live.fetchedAt = Date.now();

    console.log(`✅ [Live] Cached ${normalized.length} matches`);
    return result;

  } catch (error) {
    console.error('❌ [Live] Error:', error.message);
    return cache.live.data || stamp([], 'error');
  }
}

// ──────────────────────────────────────────────────────────────
// Schedule snapshot
// ──────────────────────────────────────────────────────────────
async function fetchScheduleSnapshot() {
  if (isCacheValid(cache.schedule)) {
    const age = Math.round((Date.now() - cache.schedule.fetchedAt) / 1000);
    console.log(`💾 [Cache] Schedule — ${age}s old, TTL ${cache.schedule.ttl / 1000}s`);
    return cache.schedule.data;
  }

  // If rate limited recently, serve stale data but DON'T reset the cache timer
  if (isRateLimited(cache.schedule)) {
    const wait = Math.round((cache.schedule.rateLimitTtl - (Date.now() - cache.schedule.rateLimitedAt)) / 1000);
    console.warn(`⏳ [Schedule] Rate limited — waiting ${wait}s before retry, serving stale data`);
    return cache.schedule.data || stamp([], 'rate-limited');
  }

  const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

  if (!FOOTBALL_DATA_API_KEY) {
    console.warn('⚠️  [Schedule] FOOTBALL_DATA_API_KEY not set');
    return stamp([], 'none');
  }

  try {
    const today    = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const url = `https://api.football-data.org/v4/matches?dateFrom=${today}&dateTo=${tomorrowStr}`;
    console.log(`📡 [Schedule] GET ${url}`);

    const response = await fetch(url, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY },
    });

    // Rate limited — mark it but DO NOT reset fetchedAt
    if (response.status === 429) {
      console.warn('⚠️  [Schedule] Rate limited by Football-Data');
      cache.schedule.rateLimitedAt = Date.now();
      // Serve stale data if we have it, otherwise empty
      return cache.schedule.data || stamp([], 'rate-limited');
    }

    if (!response.ok) {
      console.error(`❌ [Schedule] HTTP ${response.status}`);
      return cache.schedule.data || stamp([], 'error');
    }

    const data = await response.json();

    const matches = (data.matches || []).map(m => ({
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
    }));

    const result = stamp(matches, 'football-data');

    // Update cache and clear any rate limit flag
    cache.schedule.data          = result;
    cache.schedule.fetchedAt     = Date.now();
    cache.schedule.rateLimitedAt = 0;

    console.log(`✅ [Schedule] Cached ${matches.length} fixtures`);
    return result;

  } catch (error) {
    console.error('❌ [Schedule] Error:', error.message);
    return cache.schedule.data || stamp([], 'error');
  }
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