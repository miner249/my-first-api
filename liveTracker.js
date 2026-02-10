const fetch = require('node-fetch');
const { ApifyClient } = require('apify-client');

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

const APIFY_API_KEY = process.env.APIFY_API_KEY;
const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

// Validate environment variables
if (!FOOTBALL_DATA_API_KEY) {
  console.warn('⚠️  FOOTBALL_DATA_API_KEY not set - Football-Data will not work');
}
if (!APIFY_API_KEY) {
  console.warn('⚠️  APIFY_API_KEY not set - Flashscore fallback will not work');
}

const apifyClient = APIFY_API_KEY ? new ApifyClient({ token: APIFY_API_KEY }) : null;

// In-memory cache (lasts until server restart)
const cache = {
  liveMatches: { data: null, timestamp: 0, ttl: 30000 }, // 30 seconds
  matchStats: new Map(), // eventId -> { data, timestamp }
};

// Track pending Apify runs
const pendingRuns = new Map(); // runId -> { type, startedAt, status }

// ═══════════════════════════════════════════════════════════
// FOOTBALL-DATA.ORG (PRIMARY SOURCE)
// ═══════════════════════════════════════════════════════════

async function fetchFootballData(endpoint) {
  if (!FOOTBALL_DATA_API_KEY) {
    return { error: 'FOOTBALL_DATA_NOT_CONFIGURED', data: null };
  }

  try {
    const url = `https://api.football-data.org/v4${endpoint}`;
    console.log(`📡 [Football-Data] GET ${endpoint}`);

    const response = await fetch(url, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY },
    });

    if (response.status === 429) {
      console.warn('⚠️  [Football-Data] Rate limit hit');
      return { error: 'RATE_LIMIT', data: null };
    }

    if (!response.ok) {
      console.error(`❌ [Football-Data] HTTP ${response.status}`);
      return { error: `HTTP_${response.status}`, data: null };
    }

    const data = await response.json();
    console.log(`✅ [Football-Data] Success - ${data.matches?.length || 0} matches`);
    return { error: null, data };

  } catch (error) {
    console.error(`❌ [Football-Data] Error:`, error.message);
    return { error: error.message, data: null };
  }
}

// ═══════════════════════════════════════════════════════════
// APIFY/FLASHSCORE (FALLBACK SOURCE)
// ═══════════════════════════════════════════════════════════

/**
 * Scrape live matches from Flashscore using Apify
 * @param {boolean} async - If true, starts run and returns immediately
 */
async function scrapeFlashscoreLive(async = false) {
  if (!apifyClient) {
    console.error('❌ [Apify] API key not configured');
    return { error: 'APIFY_NOT_CONFIGURED', matches: [] };
  }

  try {
    console.log(`📡 [Apify] ${async ? 'Starting' : 'Running'} Flashscore scraper...`);

    if (async) {
      // Non-blocking: start and return immediately
      const run = await apifyClient
        .actor('statanow/flashscore-scraper-live')
        .start({
          // This actor scrapes live matches automatically
          // Check https://apify.com/statanow/flashscore-scraper-live for input options
        });

      pendingRuns.set(run.id, {
        type: 'live_matches',
        startedAt: Date.now(),
        status: 'RUNNING',
      });

      console.log(`✅ [Apify] Started run ${run.id}`);
      return { runId: run.id, status: 'RUNNING' };

    } else {
      // Blocking: wait for results
      const run = await apifyClient
        .actor('statanow/flashscore-scraper-live')
        .call({
          // Add any required input parameters here
          // Most Flashscore scrapers work without input
        });

      const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
      
      console.log(`✅ [Apify] Got ${items.length} matches`);

      // Map Flashscore data to our format
      const matches = items.map(item => ({
        eventId: item.eventId || item.id || `flash_${Date.now()}_${Math.random()}`,
        home: item.homeTeam?.name || item.homeTeam || 'Unknown',
        away: item.awayTeam?.name || item.awayTeam || 'Unknown',
        league: item.tournament?.name || item.league || item.category || 'Unknown',
        status: item.status || (item.isLive ? 'Live' : 'Scheduled'),
        homeScore: parseInt(item.homeScore?.current || item.homeScore) || 0,
        awayScore: parseInt(item.awayScore?.current || item.awayScore) || 0,
        time: item.time || item.startTime || null,
        source: 'flashscore',
      }));

      return { error: null, matches };
    }

  } catch (error) {
    console.error(`❌ [Apify] Error:`, error.message);
    return { error: error.message, matches: [] };
  }
}

/**
 * Check status of pending Apify run
 */
async function checkApifyRunStatus(runId) {
  try {
    const run = await apifyClient.run(runId).get();
    
    if (run.status === 'SUCCEEDED') {
      const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
      
      const matches = items.map(item => ({
        eventId: item.eventId || item.id || `flash_${Date.now()}_${Math.random()}`,
        home: item.homeTeam?.name || item.homeTeam || 'Unknown',
        away: item.awayTeam?.name || item.awayTeam || 'Unknown',
        league: item.tournament?.name || item.league || item.category || 'Unknown',
        status: item.status || (item.isLive ? 'Live' : 'Scheduled'),
        homeScore: parseInt(item.homeScore?.current || item.homeScore) || 0,
        awayScore: parseInt(item.awayScore?.current || item.awayScore) || 0,
        time: item.time || item.startTime || null,
        source: 'flashscore',
      }));
      
      return { status: 'SUCCEEDED', matches };
    }
    
    if (run.status === 'FAILED' || run.status === 'ABORTED') {
      return { status: run.status, error: run.statusMessage };
    }
    
    return { status: 'RUNNING' };
    
  } catch (error) {
    return { status: 'ERROR', error: error.message };
  }
}

// Background polling for pending runs (optional)
setInterval(async () => {
  for (const [runId, job] of pendingRuns) {
    // Skip if job is too recent (give it time)
    if (Date.now() - job.startedAt < 10000) continue;
    
    // Timeout after 5 minutes
    if (Date.now() - job.startedAt > 300000) {
      console.warn(`⏰ [Apify] Run ${runId} timed out`);
      pendingRuns.delete(runId);
      continue;
    }
    
    const result = await checkApifyRunStatus(runId);
    
    if (result.status === 'SUCCEEDED') {
      // Update cache
      cache.liveMatches = {
        data: result.matches,
        timestamp: Date.now(),
        source: 'flashscore',
      };
      
      pendingRuns.delete(runId);
      console.log(`✅ [Poll] Run ${runId} completed with ${result.matches.length} matches`);
      
    } else if (result.status === 'FAILED' || result.status === 'ABORTED') {
      pendingRuns.delete(runId);
      console.error(`❌ [Poll] Run ${runId} failed`);
    }
  }
}, 15000); // Check every 15 seconds

// ═══════════════════════════════════════════════════════════
// HYBRID LOGIC - AUTO FALLBACK
// ═══════════════════════════════════════════════════════════

/**
 * Get live matches - tries Football-Data first, falls back to Apify
 */
async function getLiveMatches() {
  const now = Date.now();
  
  // Check cache first
  if (cache.liveMatches.data && (now - cache.liveMatches.timestamp) < cache.liveMatches.ttl) {
    console.log('💾 [Cache] Returning cached live matches');
    return { matches: cache.liveMatches.data, source: cache.liveMatches.source };
  }

  console.log('\n🔄 [Hybrid] Fetching live matches...');

  // TRY 1: Football-Data.org
  const { error: fdError, data: fdData } = await fetchFootballData('/matches?status=LIVE');

  // ✅ FIXED: Check if we got matches AND they're not empty
  const fdHasMatches = !fdError && fdData && fdData.matches && fdData.matches.length > 0;

  if (fdHasMatches) {
    const matches = fdData.matches.map(m => ({
      eventId: m.id,
      home: m.homeTeam?.name || m.homeTeam?.shortName || 'Unknown',
      away: m.awayTeam?.name || m.awayTeam?.shortName || 'Unknown',
      league: m.competition?.name || 'Unknown',
      status: m.status === 'IN_PLAY' ? 'Live' : m.status === 'PAUSED' ? 'HT' : m.status,
      homeScore: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0,
      awayScore: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0,
      source: 'football-data',
    }));

    console.log(`✅ [Hybrid] Football-Data returned ${matches.length} matches`);
    
    cache.liveMatches = { data: matches, timestamp: now, source: 'football-data' };
    return { matches, source: 'football-data' };
  }

  // TRY 2: Apify/Flashscore (fallback)
  // ✅ NOW triggers if Football-Data has error OR no matches
  if (!fdError && fdData && fdData.matches && fdData.matches.length === 0) {
    console.log('⚠️  [Hybrid] Football-Data has no live matches, trying Flashscore...');
  } else {
    console.log('⚠️  [Hybrid] Football-Data failed, trying Flashscore...');
  }

  const { error: apifyError, matches: apifyMatches } = await scrapeFlashscoreLive(false);

  if (!apifyError && apifyMatches && apifyMatches.length > 0) {
    console.log(`✅ [Hybrid] Flashscore returned ${apifyMatches.length} matches`);
    
    cache.liveMatches = { data: apifyMatches, timestamp: now, source: 'flashscore' };
    return { matches: apifyMatches, source: 'flashscore' };
  }

  // Both failed or returned no matches
  console.error('❌ [Hybrid] Both sources failed or returned no matches');
  return { matches: [], source: 'none' };
}

/**
 * Find a specific match by team names
 */
async function findMatch(homeTeam, awayTeam) {
  console.log(`\n🔍 [Hybrid] Finding: ${homeTeam} vs ${awayTeam}`);

  // Normalize team names for matching
  const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const targetHome = normalize(homeTeam);
  const targetAway = normalize(awayTeam);

  // TRY 1: Football-Data
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const { error: fdError, data: fdData } = await fetchFootballData(
    `/matches?dateFrom=${today}&dateTo=${tomorrowStr}`
  );

  if (!fdError && fdData && fdData.matches) {
    const match = fdData.matches.find(m => {
      const mHome = normalize(m.homeTeam?.name || m.homeTeam?.shortName || '');
      const mAway = normalize(m.awayTeam?.name || m.awayTeam?.shortName || '');
      const mHomeTLA = normalize(m.homeTeam?.tla || '');
      const mAwayTLA = normalize(m.awayTeam?.tla || '');
      
      return (
        (mHome === targetHome && mAway === targetAway) ||
        (mHomeTLA === targetHome && mAwayTLA === targetAway) ||
        ((mHome.includes(targetHome) || targetHome.includes(mHome)) &&
         (mAway.includes(targetAway) || targetAway.includes(mAway)))
      );
    });

    if (match) {
      console.log(`✅ [Hybrid] Found on Football-Data`);
      return {
        eventId: match.id,
        home: match.homeTeam?.name || match.homeTeam?.shortName,
        away: match.awayTeam?.name || match.awayTeam?.shortName,
        league: match.competition?.name,
        homeScore: match.score?.fullTime?.home ?? match.score?.halfTime?.home ?? null,
        awayScore: match.score?.fullTime?.away ?? match.score?.halfTime?.away ?? null,
        status: match.status,
        startTime: match.utcDate,
        source: 'football-data',
      };
    }
  }

  // TRY 2: Check Flashscore
  console.log('⚠️  [Hybrid] Not found in Football-Data, checking Flashscore...');
  const { error: apifyError, matches: apifyMatches } = await scrapeFlashscoreLive(false);

  if (!apifyError && apifyMatches) {
    const match = apifyMatches.find(m => {
      const mHome = normalize(m.home);
      const mAway = normalize(m.away);
      
      return (
        (mHome === targetHome && mAway === targetAway) ||
        (mHome.includes(targetHome) && mAway.includes(targetAway)) ||
        (targetHome.includes(mHome) && targetAway.includes(mAway))
      );
    });

    if (match) {
      console.log(`✅ [Hybrid] Found on Flashscore`);
      return match;
    }
  }

  console.warn(`❌ [Hybrid] Match not found`);
  return null;
}

/**
 * Get detailed match statistics
 */
async function getMatchStats(eventId, source = 'football-data') {
  // Check cache
  const cacheKey = `${source}_${eventId}`;
  const cached = cache.matchStats.get(cacheKey);
  const now = Date.now();

  if (cached && (now - cached.timestamp) < 30000) {
    console.log('💾 [Cache] Returning cached match stats');
    return cached.data;
  }

  console.log(`\n📊 [Hybrid] Getting stats for ${eventId} (source: ${source})`);

  if (source === 'football-data') {
    const { error, data } = await fetchFootballData(`/matches/${eventId}`);
    
    if (!error && data) {
      const stats = {
        corners: {
          home: 0, // Not available in free tier
          away: 0,
          total: 0,
        },
        goals: {
          home: data.score?.fullTime?.home ?? data.score?.halfTime?.home ?? 0,
          away: data.score?.fullTime?.away ?? data.score?.halfTime?.away ?? 0,
        },
        yellowCards: {
          home: 0, // Not available in free tier
          away: 0,
        },
        source: 'football-data',
      };

      // Cache it
      cache.matchStats.set(cacheKey, { data: stats, timestamp: now });
      return stats;
    }
  }

  console.warn(`⚠️  [Hybrid] Stats not available`);
  return null;
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

module.exports = {
  getLiveMatches,
  findMatch,
  getMatchStats,
  checkApifyRunStatus, // Export for manual status checks
  scrapeFlashscoreLive, // Export for direct access
};