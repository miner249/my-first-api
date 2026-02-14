const fetch = require('node-fetch');
const { ApifyClient } = require('apify-client');
const { getCached, setCached } = require('./cache');

const APIFY_TOKEN = process.env.APIFY_API_KEY || process.env.APIFY_API_KEY_1;
const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const FLASHSCORE_ACTOR = 'statanow/flashscore-scraper-live';

const apifyClient = APIFY_TOKEN ? new ApifyClient({ token: APIFY_TOKEN }) : null;

function createMatchId(match) {
  const id = `${match.home_team || ''}-${match.away_team || ''}-${match.start_time || ''}`;
  return encodeURIComponent(id.toLowerCase().replace(/\s+/g, '-'));
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

async function fetchApifyFlashscoreMatches() {
  if (!apifyClient) throw new Error('APIFY_API_KEY is missing');

  const run = await apifyClient.actor(FLASHSCORE_ACTOR).call({});
  const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
  return (items || []).map(normalizeFlashscoreMatch);
}

async function fetchFootballDataTodayMatches() {
  if (!FOOTBALL_DATA_API_KEY) throw new Error('FOOTBALL_DATA_API_KEY is missing');

  const today = new Date();
  const dateTo = new Date(today);
  dateTo.setDate(dateTo.getDate() + 1);
  const from = today.toISOString().split('T')[0];
  const to = dateTo.toISOString().split('T')[0];

  const response = await fetch(`https://api.football-data.org/v4/matches?dateFrom=${from}&dateTo=${to}`, {
    headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY },
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
