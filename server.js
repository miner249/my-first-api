require('dotenv').config(); // Load environment variables first!

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Disable caching
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// Initialize SQLite Database
const db = new sqlite3.Database('./trackit.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

// Create tables
function initializeDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      share_code TEXT UNIQUE,
      total_odds REAL,
      stake REAL,
      potential_win REAL,
      currency TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      raw_data TEXT
    )
  `, (err) => {
    if (err) console.error('Error creating bets table:', err);
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bet_id INTEGER,
      match_id TEXT,
      home_team TEXT,
      away_team TEXT,
      league TEXT,
      match_time DATETIME,
      selection TEXT,
      odds REAL,
      market_name TEXT,
      outcome TEXT,
      FOREIGN KEY (bet_id) REFERENCES bets(id)
    )
  `, (err) => {
    if (err) console.error('Error creating matches table:', err);
  });
}

// ═══════════════════════════════════════════════════════════
// 🆕 FOOTBALL-DATA.ORG API PROXY ROUTES
// ═══════════════════════════════════════════════════════════

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';
const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

// Validate API key exists
if (!FOOTBALL_DATA_API_KEY) {
  console.error('❌ FOOTBALL_DATA_API_KEY is not set in environment variables!');
  console.error('💡 Please create a .env file with your API key');
  process.exit(1);
}

const FOOTBALL_DATA_HEADERS = {
  'X-Auth-Token': FOOTBALL_DATA_API_KEY,
  'Accept': 'application/json',
};

// Simple in-memory cache to reduce API calls
const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds

function getCached(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`✅ [CACHE] Using cached data for: ${key}`);
    return cached.data;
  }
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// Helper function to fetch from Football-Data.org
async function fetchFootballData(endpoint) {
  const url = `${FOOTBALL_DATA_BASE}${endpoint}`;
  
  // Check cache first
  const cached = getCached(endpoint);
  if (cached) {
    return { error: null, data: cached };
  }
  
  try {
    console.log(`📡 [FOOTBALL-DATA] Fetching: ${endpoint}`);
    
    const response = await fetch(url, {
      headers: FOOTBALL_DATA_HEADERS,
      timeout: 10000,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [FOOTBALL-DATA] HTTP ${response.status}: ${errorText}`);
      return { error: `HTTP ${response.status}`, data: null };
    }

    const data = await response.json();
    console.log(`✅ [FOOTBALL-DATA] Success - ${data.matches?.length || 0} matches`);
    
    // Cache the response
    setCache(endpoint, data);
    
    return { error: null, data };

  } catch (error) {
    console.error(`❌ [FOOTBALL-DATA] Error:`, error.message);
    return { error: error.message, data: null };
  }
}

// Route 1: Get live matches
app.get('/api/sofascore/live-matches', async (req, res) => {
  try {
    // Get matches with status IN_PLAY, PAUSED, or LIVE
    const { error, data } = await fetchFootballData('/matches?status=LIVE');

    if (error || !data || !data.matches) {
      return res.json({ 
        success: false, 
        error: error || 'No data',
        matches: [] 
      });
    }

    const liveMatches = data.matches.map(match => ({
      eventId: match.id,
      home: match.homeTeam?.name || match.homeTeam?.shortName || 'Unknown',
      away: match.awayTeam?.name || match.awayTeam?.shortName || 'Unknown',
      league: match.competition?.name || 'Unknown',
      status: match.status === 'IN_PLAY' ? 'Live' : (match.status === 'PAUSED' ? 'HT' : match.status),
      homeScore: match.score?.fullTime?.home ?? match.score?.halfTime?.home ?? 0,
      awayScore: match.score?.fullTime?.away ?? match.score?.halfTime?.away ?? 0,
    }));

    res.json({ 
      success: true, 
      matches: liveMatches,
      total: liveMatches.length 
    });

  } catch (error) {
    console.error('❌ [API] Error in /live-matches:', error);
    res.json({ success: false, error: error.message, matches: [] });
  }
});

// Route 2: Get today's matches (all scheduled)
app.get('/api/sofascore/today-matches', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    const { error, data } = await fetchFootballData(`/matches?dateFrom=${today}&dateTo=${tomorrowStr}`);

    if (error || !data || !data.matches) {
      return res.json({ 
        success: false, 
        error: error || 'No data',
        matches: [] 
      });
    }

    const matches = data.matches.map(match => ({
      eventId: match.id,
      home: match.homeTeam?.name || match.homeTeam?.shortName || 'Unknown',
      away: match.awayTeam?.name || match.awayTeam?.shortName || 'Unknown',
      league: match.competition?.name || 'Unknown',
      startTime: match.utcDate || null,
      status: match.status === 'TIMED' ? 'Upcoming' : 
              match.status === 'IN_PLAY' ? 'Live' : 
              match.status === 'FINISHED' ? 'Finished' : 
              match.status === 'PAUSED' ? 'HT' : match.status,
      homeScore: match.score?.fullTime?.home ?? match.score?.halfTime?.home ?? null,
      awayScore: match.score?.fullTime?.away ?? match.score?.halfTime?.away ?? null,
    }));

    res.json({ 
      success: true, 
      matches,
      total: matches.length 
    });

  } catch (error) {
    console.error('❌ [API] Error in /today-matches:', error);
    res.json({ success: false, error: error.message, matches: [] });
  }
});

// Route 3: Get match statistics
app.get('/api/sofascore/match-stats/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { error, data } = await fetchFootballData(`/matches/${eventId}`);

    if (error || !data) {
      return res.json({ 
        success: false, 
        error: error || 'No stats data',
        stats: null 
      });
    }

    // Note: Football-data.org free tier has limited statistics
    res.json({
      success: true,
      stats: {
        corners: {
          home: 0, // Not available in free tier
          away: 0,
          total: 0,
        },
        goals: {
          home: data.score?.fullTime?.home ?? 0,
          away: data.score?.fullTime?.away ?? 0,
        },
        yellowCards: {
          home: 0, // Not available in free tier
          away: 0,
        },
        shotsOnTarget: {
          home: 0, // Not available in free tier
          away: 0,
        },
      },
      matchInfo: {
        status: data.status,
        minute: data.minute || null,
        referee: data.referees?.[0]?.name || 'N/A',
        venue: data.venue || 'N/A',
      }
    });

  } catch (error) {
    console.error('❌ [API] Error in /match-stats:', error);
    res.json({ success: false, error: error.message, stats: null });
  }
});

// Route 4: Match user's bet teams to Football-Data.org events
app.post('/api/sofascore/find-match', async (req, res) => {
  try {
    const { homeTeam, awayTeam } = req.body;
    
    if (!homeTeam || !awayTeam) {
      return res.json({ success: false, error: 'Missing team names', match: null });
    }

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    const { error, data } = await fetchFootballData(`/matches?dateFrom=${today}&dateTo=${tomorrowStr}`);

    if (error || !data || !data.matches) {
      return res.json({ success: false, error: error || 'No data', match: null });
    }

    // Fuzzy match team names
    const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const bHome = normalize(homeTeam);
    const bAway = normalize(awayTeam);

    const match = data.matches.find(m => {
      const mHome = normalize(m.homeTeam?.name || m.homeTeam?.shortName || '');
      const mAway = normalize(m.awayTeam?.name || m.awayTeam?.shortName || '');
      const mHomeTLA = normalize(m.homeTeam?.tla || '');
      const mAwayTLA = normalize(m.awayTeam?.tla || '');
      
      return (
        (mHome === bHome && mAway === bAway) ||
        (mHomeTLA === bHome && mAwayTLA === bAway) ||
        ((mHome.includes(bHome) || bHome.includes(mHome)) &&
         (mAway.includes(bAway) || bAway.includes(mAway)))
      );
    });

    if (match) {
      res.json({
        success: true,
        match: {
          eventId: match.id,
          home: match.homeTeam?.name || match.homeTeam?.shortName,
          away: match.awayTeam?.name || match.awayTeam?.shortName,
          league: match.competition?.name,
          startTime: match.utcDate,
          homeScore: match.score?.fullTime?.home ?? match.score?.halfTime?.home ?? null,
          awayScore: match.score?.fullTime?.away ?? match.score?.halfTime?.away ?? null,
          status: match.status,
        },
      });
    } else {
      res.json({ success: false, match: null, error: 'Match not found' });
    }

  } catch (error) {
    console.error('❌ [API] Error in /find-match:', error);
    res.json({ success: false, error: error.message, match: null });
  }
});

// ═══════════════════════════════════════════════════════════
// EXISTING BET TRACKING ROUTES
// ═══════════════════════════════════════════════════════════

// Track bet endpoint
app.post('/track-bet', async (req, res) => {
  const { shareCode } = req.body;

  if (!shareCode) {
    return res.json({ success: false, error: 'Share code is required' });
  }

  console.log(`\n🔍 [SERVER] Fetching bet: ${shareCode}`);

  try {
    const timestamp = Date.now();
    const sportyUrl = `https://www.sportybet.com/api/ng/orders/share/${shareCode.trim()}?_t=${timestamp}`;

    const sportyResponse = await fetch(sportyUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.sportybet.com/',
        'Origin': 'https://www.sportybet.com'
      }
    });

    if (!sportyResponse.ok) {
      return res.json({ success: false, error: `Failed to fetch bet (Status: ${sportyResponse.status})` });
    }

    const sportyData = await sportyResponse.json();

    if (sportyData.code !== undefined && sportyData.code !== 0) {
      return res.json({ success: false, error: sportyData.msg || 'Invalid share code' });
    }

    const betData = sportyData.data || sportyData;

    if (!betData) {
      return res.json({ success: false, error: 'No bet data found' });
    }

    console.log(`📦 [SERVER] Top-level keys:`, Object.keys(betData));
    console.log(`📦 [SERVER] ticket keys:`, Object.keys(betData.ticket || {}));

    const ticket = betData.ticket || {};
    const outcomes = betData.outcomes || [];

    let totalOdds = 1;
    const parsedMatches = [];

    outcomes.forEach((outcome, index) => {
      const selection = ticket.selections ? ticket.selections[index] : null;
      const selectedOutcomeId = selection ? selection.outcomeId : null;

      let matchOdds = 0;
      let marketName = 'N/A';
      let selectionName = 'N/A';

      if (outcome.markets && outcome.markets.length > 0) {
        const market = outcome.markets[0];
        marketName = market.desc || market.name || 'N/A';

        if (market.outcomes && market.outcomes.length > 0) {
          const selectedOutcome = market.outcomes.find(o => o.id === selectedOutcomeId) || market.outcomes[0];
          matchOdds = parseFloat(selectedOutcome.odds) || 0;
          selectionName = selectedOutcome.desc || selectedOutcome.name || 'N/A';
        }
      }

      totalOdds *= matchOdds;

      const league = outcome.sport?.category?.tournament?.name || 'Unknown';

      parsedMatches.push({
        match_id: outcome.eventId || 'N/A',
        home_team: outcome.homeTeamName || 'Unknown',
        away_team: outcome.awayTeamName || 'Unknown',
        league: league,
        match_time: outcome.estimateStartTime ? new Date(outcome.estimateStartTime).toISOString() : null,
        selection: selectionName,
        odds: matchOdds,
        market_name: marketName,
        status: outcome.matchStatus || 'pending'
      });
    });

    totalOdds = Math.round(totalOdds * 100) / 100;

    const stake = betData.stake || ticket.stake || betData.stakeAmount || 0;
    const potentialWin = betData.maxWinAmount || ticket.maxWinAmount || (stake * totalOdds) || 0;

    console.log(`💰 [SERVER] Total Odds: ${totalOdds} | Stake: ${stake} | Potential Win: ${potentialWin}`);

    db.run(
      `INSERT OR REPLACE INTO bets (share_code, total_odds, stake, potential_win, currency, raw_data)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [shareCode.trim(), totalOdds, stake, potentialWin, 'NGN', JSON.stringify(betData)],
      function(err) {
        if (err) {
          console.error('❌ [SERVER] Error inserting bet:', err);
          return res.json({ success: false, error: 'Database error saving bet' });
        }

        const betId = this.lastID;
        console.log(`✅ [SERVER] Bet saved, ID: ${betId}`);

        if (parsedMatches.length === 0) {
          return res.json({ success: true, message: 'Bet tracked (no matches)', betId });
        }

        let processed = 0;

        parsedMatches.forEach((match) => {
          db.run(
            `INSERT INTO matches (bet_id, match_id, home_team, away_team, league, match_time, selection, odds, market_name, outcome)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              betId,
              match.match_id,
              match.home_team,
              match.away_team,
              match.league,
              match.match_time,
              match.selection,
              match.odds,
              match.market_name,
              match.status
            ],
            (err) => {
              if (err) console.error(`❌ [SERVER] Error inserting match:`, err);
              processed++;

              if (processed === parsedMatches.length) {
                console.log(`🎉 [SERVER] Done! ${parsedMatches.length} match(es) saved\n`);
                res.json({ success: true, message: 'Bet tracked successfully', betId, matchCount: parsedMatches.length });
              }
            }
          );
        });
      }
    );

  } catch (error) {
    console.error('❌ [SERVER] Error:', error);
    return res.json({ success: false, error: error.message || 'Server error' });
  }
});

// Get all bets
app.get('/bets', (req, res) => {
  db.all('SELECT * FROM bets ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.json({ success: false, error: err.message, bets: [] });
    res.json({ success: true, bets: rows });
  });
});

// Get a specific bet with its matches
app.get('/bets/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM bets WHERE id = ?', [id], (err, bet) => {
    if (err) return res.json({ success: false, error: err.message });
    if (!bet) return res.json({ success: false, error: 'Bet not found' });

    db.all('SELECT * FROM matches WHERE bet_id = ?', [id], (err, matches) => {
      if (err) return res.json({ success: false, error: err.message });
      res.json({ success: true, bet: { ...bet, matches } });
    });
  });
});

// Delete a bet and its matches
app.delete('/bets/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM matches WHERE bet_id = ?', [id], (err) => {
    if (err) return res.json({ success: false, error: 'Error deleting matches' });

    db.run('DELETE FROM bets WHERE id = ?', [id], function(err) {
      if (err) return res.json({ success: false, error: 'Error deleting bet' });
      if (this.changes === 0) return res.json({ success: false, error: 'Bet not found' });
      res.json({ success: true, message: 'Bet deleted successfully' });
    });
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Track It API is running',
    apiKey: FOOTBALL_DATA_API_KEY ? '✅ Configured' : '❌ Missing',
    database: '✅ Connected'
  });
});

// Serve React frontend
const buildPath = path.join(__dirname, 'client', 'dist');

if (fs.existsSync(buildPath)) {
  console.log('✅ Found client build directory');
  app.use(express.static(buildPath));

  app.use((req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
} else {
  console.warn('⚠️  Client build directory not found at:', buildPath);

  app.use((req, res) => {
    res.json({ error: 'Frontend not built. Run: npm run build', buildPath });
  });
}

app.listen(PORT, () => {
  console.log(`🚀 Track It running on http://localhost:${PORT}`);
  console.log(`📊 Database: trackit.db`);
  console.log(`🔴 Football-Data.org API proxy enabled`);
  console.log(`🔑 API Key: ${FOOTBALL_DATA_API_KEY ? '✅ Loaded from .env' : '❌ MISSING'}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  db.close(() => {
    console.log('📊 Database connection closed');
    process.exit(0);
  });
});