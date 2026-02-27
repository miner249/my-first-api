/**
 * live_engine/liveDataProvider.js
 */

const { getLiveMatches, findMatch, getMatchStats } = require('../live_engine/liveTracker');

function stamp(matches, source) {
  return {
    matches:   matches || [],
    source:    source  || 'none',
    fetchedAt: new Date().toISOString(),
    count:     (matches || []).length,
  };
}

async function fetchLiveSnapshot() {
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

  return stamp(normalized, source);
}

async function fetchScheduleSnapshot() {
  const fetch = require('node-fetch');
  const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

  if (!FOOTBALL_DATA_API_KEY) {
    console.warn('⚠️  [Schedule] FOOTBALL_DATA_API_KEY not set – returning empty schedule');
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

    if (response.status === 429) {
      console.warn('⚠️  [Schedule] Football-Data rate limit hit');
      return stamp([], 'rate-limited');
    }

    if (!response.ok) {
      console.error(`❌ [Schedule] Football-Data HTTP ${response.status}`);
      return stamp([], 'error');
    }

    const data = await response.json();

    const matches = (data.matches || []).map((m) => ({
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

    console.log(`✅ [Schedule] ${matches.length} fixtures from Football-Data`);
    return stamp(matches, 'football-data');

  } catch (error) {
    console.error('❌ [Schedule] Error:', error.message);
    return stamp([], 'error');
  }
}

module.exports = {
  fetchLiveSnapshot,
  fetchScheduleSnapshot,
  findMatch,
  getMatchStats,
};