const fetch = require('node-fetch');
const { ApifyClient } = require('apify-client');
const { getCached, setCached } = require('./cache');

const FLASHSCORE_ACTOR = 'statanow/flashscore-scraper-live';

function getFootballDataToken() {
  return process.env.FOOTBALL_DATA_API_KEY;
}

const APIFY_API_KEYS = [];
for (let i = 1; i <= 10; i += 1) {
  const key = process.env[`APIFY_API_KEY_${i}`];
  if (key) APIFY_API_KEYS.push(key);
}
if (APIFY_API_KEYS.length === 0 && process.env.APIFY_API_KEY) {
  APIFY_API_KEYS.push(process.env.APIFY_API_KEY);
}

let apifyKeyIndex = 0;

function getApifyClientsInRotationOrder() {
  if (APIFY_API_KEYS.length === 0) return [];

  const ordered = [];
  for (let i = 0; i < APIFY_API_KEYS.length; i += 1) {
    const index = (apifyKeyIndex + i) % APIFY_API_KEYS.length;
    ordered.push({
      keyIndex: index,
      client: new ApifyClient({ token: APIFY_API_KEYS[index] }),
    });
  }
  return ordered;
}

function advanceApifyIndex(indexUsed) {
  if (APIFY_API_KEYS.length <= 1) return;
  apifyKeyIndex = (indexUsed + 1) % APIFY_API_KEYS.length;
}

function createMatchId(match) {
  const id = `${match.home_team || ''}-${match.away_team || ''}-${match.start_time || ''}`;
  return encodeURIComponent(id.toLowerCase().replace(/\s+/g, '-'));
}

function dedupeEvents(history) {
  const seen = new Set();
  return history.filter((event) => {
    if (!event || event.kind !== 'event') return true;
    const key = `${event.time || ''}-${event.action || ''}-${event.player || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeFlashscoreMatch(match = {}) {
  return {
    id: createMatchId(match),
    home_team: match.home_team,
    away_team: match.away_team,
    home_score: match.home_score,
    away_score: match.away_score,
    status: match.status,
    status_time: match.status_time,
    start_time: match.start_time,
    league: match.league,
    history: Array.isArray(match.history) ? dedupeEvents(match.history) : [],
  };
}

async function fetchApifyFlashscoreMatches() {
  const clients = getApifyClientsInRotationOrder();
  if (clients.length === 0) throw new Error('APIFY_API_KEY is missing');

  let lastError = null;

  for (const { keyIndex, client } of clients) {
    try {
      const run = await client.actor(FLASHSCORE_ACTOR).call({});
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      advanceApifyIndex(keyIndex);
      return (items || []).map(normalizeFlashscoreMatch);
    } catch (error) {
      lastError = error;
      const statusCode = error?.statusCode || error?.status;
      const maybeCreditExhausted = statusCode === 402 || statusCode === 429;

      if (maybeCreditExhausted) {
        advanceApifyIndex(keyIndex);
      }

      continue;
    }
  }

  throw new Error(lastError?.message || 'All Apify keys failed');
}

async function fetchFootballDataTodayMatches() {
  const footballDataToken = getFootballDataToken();
  if (!footballDataToken) throw new Error('FOOTBALL_DATA_API_KEY is missing');

  const today = new Date();
  const dateTo = new Date(today);
  dateTo.setDate(dateTo.getDate() + 1);
  const from = today.toISOString().split('T')[0];
  const to = dateTo.toISOString().split('T')[0];

  const response = await fetch(`https://api.football-data.org/v4/matches?dateFrom=${from}&dateTo=${to}`, {
    headers: { 'X-Auth-Token': footballDataToken },
  });

  if (!response.ok) {
    throw new Error(`Football-Data error: ${response.status}`);
  }

  const data = await response.json();
  return (data.matches || []).map((match) => ({
    id: encodeURIComponent(`${match.homeTeam?.name || ''}-${match.awayTeam?.name || ''}-${match.utcDate || ''}`.toLowerCase()),
    home_team: match.homeTeam?.name || 'Unknown',
    away_team: match.awayTeam?.name || 'Unknown',
    home_score: match.score?.fullTime?.home,
    away_score: match.score?.fullTime?.away,
    status: match.status,
    status_time: match.status,
    start_time: match.utcDate,
    league: match.competition?.name || 'Unknown',
    history: [],
  }));
}

async function getTodayMatchesCached() {
  const cached = getCached('today_matches');
  if (cached) return { matches: cached, source: 'cache' };

  const matches = await fetchFootballDataTodayMatches();
  setCached('today_matches', matches, { daily: true });
  return { matches, source: 'football-data' };
}

async function getLiveMatches() {
  const matches = await fetchApifyFlashscoreMatches();
  const live = matches.filter((match) => match?.status === 'Live' && match.status);
  return { matches: live, source: 'flashscore' };
}

async function getMatchDetails(id) {
  const cacheKey = `match_details_${id}`;
  const cached = getCached(cacheKey);
  if (cached) return { match: cached, source: 'cache' };

  const matches = await fetchApifyFlashscoreMatches();
  const match = matches.find((item) => item.id === id);
  if (!match) return { match: null, source: 'flashscore' };

  setCached(cacheKey, match, { ttlMs: 10 * 60 * 1000 });
  return { match, source: 'flashscore' };
}

module.exports = {
  getTodayMatchesCached,
  getLiveMatches,
  getMatchDetails,
};
