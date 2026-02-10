const fetch = require('node-fetch');
const { ApifyClient } = require('apify-client');

// ═══════════════════════════════════════════════════════════
// CONFIGURATION - MULTI-KEY APIFY SUPPORT
// ═══════════════════════════════════════════════════════════

const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

// Load all Apify API keys (supports multiple keys for failover)
const APIFY_API_KEYS = [];
for (let i = 1; i <= 10; i++) {
  const key = process.env[`APIFY_API_KEY_${i}`];
  if (key) {
    APIFY_API_KEYS.push({
      key,
      client: new ApifyClient({ token: key }),
      failures: 0,
      lastFailure: null,
      disabled: false,
    });
  }
}

// Fallback: Check for single APIFY_API_KEY (backward compatible)
if (APIFY_API_KEYS.length === 0 && process.env.APIFY_API_KEY) {
  APIFY_API_KEYS.push({
    key: process.env.APIFY_API_KEY,
    client: new ApifyClient({ token: process.env.APIFY_API_KEY }),
    failures: 0,
    lastFailure: null,
    disabled: false,
  });
}

// Validate environment variables
if (APIFY_API_KEYS.length === 0) {
  console.warn('⚠️  No APIFY_API_KEY found - Primary source will not work');
} else {
  console.log(`✅ Loaded ${APIFY_API_KEYS.length} Apify API key(s)`);
}
if (!FOOTBALL_DATA_API_KEY) {
  console.warn('⚠️  FOOTBALL_DATA_API_KEY not set - Fallback will not work');
}

// Track current key index
let currentKeyIndex = 0;

// In-memory cache (lasts until server restart)
const cache = {
  liveMatches: { data: null, timestamp: 0, ttl: 30000 }, // 30 seconds
  matchStats: new Map(),
};

// Track pending Apify runs
const pendingRuns = new Map();

// ═══════════════════════════════════════════════════════════
// APIFY KEY ROTATION LOGIC
// ═══════════════════════════════════════════════════════════

/**
 * Get the next available Apify client
 */
function getApifyClient() {
  if (APIFY_API_KEYS.length === 0) {
    return null;
  }

  for (let i = 0; i < APIFY_API_KEYS.length; i++) {
    const keyData = APIFY_API_KEYS[currentKeyIndex];
    
    // Re-enable disabled keys after 1 hour
    if (keyData.disabled) {
      const hourAgo = Date.now() - 3600000;
      if (keyData.lastFailure && keyData.lastFailure < hourAgo) {
        console.log(`🔄 [Apify] Re-enabling key ${currentKeyIndex + 1} after cooldown`);
        keyData.disabled = false;
        keyData.failures = 0;
      } else {
        currentKeyIndex = (currentKeyIndex + 1) % APIFY_API_KEYS.length;
        continue;
      }
    }

    return {
      client: keyData.client,
      index: currentKeyIndex,
      keyData,
    };
  }

  console.error('❌ [Apify] All API keys are disabled!');
  return null;
}

/**
 * Mark a key as failed (disables after 3 failures)
 */
function markKeyFailed(keyIndex, error) {
  const keyData = APIFY_API_KEYS[keyIndex];
  keyData.failures++;
  keyData.lastFailure = Date.now();

  console.warn(`⚠️  [Apify] Key ${keyIndex + 1} failed (${keyData.failures} times): ${error}`);

  if (keyData.failures >= 3) {
    keyData.disabled = true;
    console.error(`❌ [Apify] Key ${keyIndex + 1} DISABLED (will retry in 1 hour)`);
    currentKeyIndex = (currentKeyIndex + 1) % APIFY_API_KEYS.length;
  }
}

/**
 * Mark a key as successful
 */
function markKeySuccess(keyIndex) {
  const keyData = APIFY_API_KEYS[keyIndex];
  if (keyData.failures > 0) {
    console.log(`✅ [Apify] Key ${keyIndex + 1} working again`);
    keyData.failures = 0;
    keyData.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════
// FOOTBALL-DATA.ORG (FALLBACK SOURCE)
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
// HELPER: Extract stats from Flashscore history
// ═══════════════════════════════════════════════════════════

function extractStatsFromHistory(history) {
  if (!history || !Array.isArray(history)) {
    return {
      goals: [],
      yellowCards: [],
      redCards: [],
      substitutions: [],
    };
  }

  const goals = [];
  const yellowCards = [];
  const redCards = [];
  const substitutions = [];

  history.forEach(event => {
    if (event.kind === 'event') {
      switch (event.action) {
        case 'Goal':
          goals.push({
            time: event.time,
            side: event.side,
            player: event.player,
            score: event.score,
          });
          break;
        case 'Yellow card':
          yellowCards.push({
            time: event.time,
            side: event.side,
            player: event.player,
          });
          break;
        case 'Red card':
          redCards.push({
            time: event.time,
            side: event.side,
            player: event.player,
          });
          break;
        case 'Substitution':
          substitutions.push({
            time: event.time,
            side: event.side,
            player: event.player,
          });
          break;
      }
    }
  });

  return { goals, yellowCards, redCards, substitutions };
}

// ═══════════════════════════════════════════════════════════
// APIFY/FLASHSCORE (PRIMARY SOURCE) - WITH AUTO RETRY
// ═══════════════════════════════════════════════════════════

/**
 * Scrape live matches from Flashscore using Apify (PRIMARY SOURCE)
 */
async function scrapeFlashscoreLive(async = false) {
  const maxRetries = APIFY_API_KEYS.length;
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const apifyData = getApifyClient();
    
    if (!apifyData) {
      return { error: 'ALL_APIFY_KEYS_DISABLED', matches: [] };
    }

    const { client, index, keyData } = apifyData;

    try {
      console.log(`📡 [Apify] Using key ${index + 1}/${APIFY_API_KEYS.length} - ${async ? 'Starting' : 'Running'} scraper...`);

      if (async) {
        const run = await client
          .actor('statanow/flashscore-scraper-live')
          .start({});

        pendingRuns.set(run.id, {
          type: 'live_matches',
          startedAt: Date.now(),
          status: 'RUNNING',
          keyIndex: index,
        });

        markKeySuccess(index);
        console.log(`✅ [Apify] Started run ${run.id} with key ${index + 1}`);
        return { runId: run.id, status: 'RUNNING' };

      } else {
        const run = await client
          .actor('statanow/flashscore-scraper-live')
          .call({});

        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        
        console.log(`✅ [Apify] Got ${items.length} items with key ${index + 1}`);

        const matches = items.map(item => {
          const stats = extractStatsFromHistory(item.history);
          
          return {
            eventId: item.id || `flash_${Date.now()}_${Math.random()}`,
            home: item.home_team || 'Unknown',
            away: item.away_team || 'Unknown',
            league: item.league || 'Unknown',
            status: item.status_time || item.status || 'Live',
            homeScore: parseInt(item.home_score) || 0,
            awayScore: parseInt(item.away_score) || 0,
            startTime: item.start_time || null,
            
            stats: {
              goals: stats.goals,
              yellowCards: stats.yellowCards,
              redCards: stats.redCards,
              substitutions: stats.substitutions,
              totalYellowCards: {
                home: stats.yellowCards.filter(c => c.side === 'home').length,
                away: stats.yellowCards.filter(c => c.side === 'away').length,
              },
              totalRedCards: {
                home: stats.redCards.filter(c => c.side === 'home').length,
                away: stats.redCards.filter(c => c.side === 'away').length,
              },
            },
            
            history: item.history || [],
            source: 'flashscore',
          };
        });

        markKeySuccess(index);
        console.log(`✅ [Apify] Mapped ${matches.length} matches with key ${index + 1}`);
        
        return { error: null, matches };
      }

    } catch (error) {
      lastError = error.message;
      console.error(`❌ [Apify] Key ${index + 1} error:`, error.message);
      
      if (error.message.includes('credit') || 
          error.message.includes('quota') || 
          error.message.includes('limit') ||
          error.message.includes('402')) {
        markKeyFailed(index, 'Out of credits/quota');
        console.log(`🔄 [Apify] Switching to next key...`);
        continue;
      }
      
      console.warn(`⚠️  [Apify] Key ${index + 1} had an error, but not marking as failed yet`);
      return { error: error.message, matches: [] };
    }
  }

  console.error(`❌ [Apify] All ${maxRetries} keys failed`);
  return { error: lastError || 'ALL_KEYS_FAILED', matches: [] };
}

/**
 * Check status of pending Apify run
 */
async function checkApifyRunStatus(runId) {
  const job = pendingRuns.get(runId);
  const keyIndex = job?.keyIndex || 0;
  const apifyData = APIFY_API_KEYS[keyIndex];
  
  if (!apifyData) {
    return { status: 'ERROR', error: 'API key not found' };
  }

  try {
    const run = await apifyData.client.run(runId).get();
    
    if (run.status === 'SUCCEEDED') {
      const { items } = await apifyData.client.dataset(run.defaultDatasetId).listItems();
      
      const matches = items.map(item => {
        const stats = extractStatsFromHistory(item.history);
        
        return {
          eventId: item.id || `flash_${Date.now()}_${Math.random()}`,
          home: item.home_team || 'Unknown',
          away: item.away_team || 'Unknown',
          league: item.league || 'Unknown',
          status: item.status_time || item.status || 'Live',
          homeScore: parseInt(item.home_score) || 0,
          awayScore: parseInt(item.away_score) || 0,
          startTime: item.start_time || null,
          
          stats: {
            goals: stats.goals,
            yellowCards: stats.yellowCards,
            redCards: stats.redCards,
            substitutions: stats.substitutions,
            totalYellowCards: {
              home: stats.yellowCards.filter(c => c.side === 'home').length,
              away: stats.yellowCards.filter(c => c.side === 'away').length,
            },
            totalRedCards: {
              home: stats.redCards.filter(c => c.side === 'home').length,
              away: stats.redCards.filter(c => c.side === 'away').length,
            },
          },
          
          history: item.history || [],
          source: 'flashscore',
        };
      });
      
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

// Background polling for pending runs
setInterval(async () => {
  for (const [runId, job] of pendingRuns) {
    if (Date.now() - job.startedAt < 10000) continue;
    
    if (Date.now() - job.startedAt > 300000) {
      console.warn(`⏰ [Apify] Run ${runId} timed out`);
      pendingRuns.delete(runId);
      continue;
    }
    
    const result = await checkApifyRunStatus(runId);
    
    if (result.status === 'SUCCEEDED') {
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
}, 30000);

// ═══════════════════════════════════════════════════════════
// HYBRID LOGIC - APIFY PRIMARY, FOOTBALL-DATA FALLBACK
// ═══════════════════════════════════════════════════════════

/**
 * Get live matches - tries Apify/Flashscore FIRST, falls back to Football-Data
 */
async function getLiveMatches() {
  const now = Date.now();
  
  // Check cache first
  if (cache.liveMatches.data && (now - cache.liveMatches.timestamp) < cache.liveMatches.ttl) {
    console.log('💾 [Cache] Returning cached live matches');
    return { matches: cache.liveMatches.data, source: cache.liveMatches.source };
  }

  console.log('\n🔄 [Hybrid] Fetching live matches...');

  // TRY 1: Apify/Flashscore (PRIMARY SOURCE)
  const { error: apifyError, matches: apifyMatches } = await scrapeFlashscoreLive(false);

  if (!apifyError && apifyMatches && apifyMatches.length > 0) {
    console.log(`✅ [Hybrid] Flashscore (Primary) returned ${apifyMatches.length} matches`);
    
    cache.liveMatches = { data: apifyMatches, timestamp: now, source: 'flashscore' };
    return { matches: apifyMatches, source: 'flashscore' };
  }

  // TRY 2: Football-Data.org (FALLBACK)
  if (!apifyError && apifyMatches && apifyMatches.length === 0) {
    console.log('⚠️  [Hybrid] Flashscore has no live matches, trying Football-Data...');
  } else {
    console.log('⚠️  [Hybrid] Flashscore failed, trying Football-Data fallback...');
  }

  const { error: fdError, data: fdData } = await fetchFootballData('/matches?status=LIVE');
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

    console.log(`✅ [Hybrid] Football-Data (Fallback) returned ${matches.length} matches`);
    
    cache.liveMatches = { data: matches, timestamp: now, source: 'football-data' };
    return { matches, source: 'football-data' };
  }

  // Both failed
  console.error('❌ [Hybrid] Both sources failed or returned no matches');
  return { matches: [], source: 'none' };
}

/**
 * Find a specific match by team names
 */
async function findMatch(homeTeam, awayTeam) {
  console.log(`\n🔍 [Hybrid] Finding: ${homeTeam} vs ${awayTeam}`);

  const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const targetHome = normalize(homeTeam);
  const targetAway = normalize(awayTeam);

  // TRY 1: Flashscore (PRIMARY)
  console.log('🔍 [Hybrid] Checking Flashscore first...');
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

  // TRY 2: Football-Data (FALLBACK)
  console.log('⚠️  [Hybrid] Not found in Flashscore, checking Football-Data...');
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

  console.warn(`❌ [Hybrid] Match not found`);
  return null;
}

/**
 * Get detailed match statistics
 */
async function getMatchStats(eventId, source = 'flashscore') {
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
        corners: { home: 0, away: 0, total: 0 },
        goals: {
          home: data.score?.fullTime?.home ?? data.score?.halfTime?.home ?? 0,
          away: data.score?.fullTime?.away ?? data.score?.halfTime?.away ?? 0,
        },
        yellowCards: { home: 0, away: 0 },
        source: 'football-data',
      };

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
  checkApifyRunStatus,
  scrapeFlashscoreLive,
};