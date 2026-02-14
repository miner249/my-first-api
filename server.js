require('dotenv').config(); // Load environment variables FIRST!

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');

const { getLiveMatches, getTodayMatchesCached, getMatchDetails } = require('./lib/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
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
// 🔴 LIVE TRACKING API ROUTES (HYBRID)
// ═══════════════════════════════════════════════════════════

async function handleLive(req, res) {
  try {
    const { matches, source } = await getLiveMatches();

    res.json({
      success: true,
      matches,
      count: matches.length,
      source,
    });
  } catch (error) {
    console.error('❌ [API] Error in /live:', error);
    res.json({ success: false, error: error.message, matches: [], source: 'error' });
  }
}

async function handleToday(req, res) {
  try {
    const { matches, source } = await getTodayMatchesCached();

    res.json({
      success: true,
      matches,
      count: matches.length,
      source,
    });
  } catch (error) {
    console.error('❌ [API] Error in /today:', error);
    res.json({ success: false, error: error.message, matches: [], source: 'error' });
  }
}

// Route 1: Get all live matches (Live tab)
app.get('/api/live', handleLive);
// Backward-compatible alias
app.get('/api/live-matches', handleLive);

// Route 2: Daily cached "All" matches
app.get('/api/today', handleToday);
// Backward-compatible alias
app.get('/api/today-matches', handleToday);

app.get('/api/match/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { match, source } = await getMatchDetails(id);

    if (match) {
      res.json({ success: true, match, source });
    } else {
      res.json({ success: false, match: null, error: 'Match not found' });
    }
  } catch (error) {
    console.error('❌ [API] Error in /match/:id:', error);
    res.json({ success: false, error: error.message, match: null });
  }
});

// Route 4: Match user's tracked bets to live matches
app.get('/api/tracked-live-matches', async (req, res) => {
  try {
    db.all('SELECT * FROM bets', [], async (err, bets) => {
      if (err) {
        return res.json({ success: false, error: err.message, matches: [] });
      }

      const { matches: liveMatches } = await getLiveMatches();
      const trackedLive = [];

      for (const bet of bets) {
        const betMatches = await new Promise((resolve) => {
          db.all('SELECT * FROM matches WHERE bet_id = ?', [bet.id], (err, rows) => {
            resolve(err ? [] : rows);
          });
        });

        for (const betMatch of betMatches) {
          const liveMatch = liveMatches.find(live => {
            const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const liveHome = normalize(live.home || live.home_team || '');
            const liveAway = normalize(live.away || live.away_team || '');
            const betHome = normalize(betMatch.home_team);
            const betAway = normalize(betMatch.away_team);

            return (
              (liveHome === betHome && liveAway === betAway) ||
              (liveHome.includes(betHome) && liveAway.includes(betAway)) ||
              (betHome.includes(liveHome) && betAway.includes(liveAway))
            );
          });

          if (liveMatch) {
            trackedLive.push({
              betId: bet.id,
              shareCode: bet.share_code,
              match: {
                ...liveMatch,
                home: liveMatch.home || liveMatch.home_team,
                away: liveMatch.away || liveMatch.away_team,
                homeScore: liveMatch.homeScore ?? liveMatch.home_score,
                awayScore: liveMatch.awayScore ?? liveMatch.away_score,
              },
              selection: betMatch.selection,
              marketName: betMatch.market_name,
            });
          }
        }
      }

      res.json({
        success: true,
        matches: trackedLive,
        count: trackedLive.length,
      });
    });
  } catch (error) {
    console.error('❌ [API] Error in /tracked-live-matches:', error);
    res.json({ success: false, error: error.message, matches: [] });
  }
});

// ═══════════════════════════════════════════════════════════
// 📊 BET TRACKING ROUTES
// ═══════════════════════════════════════════════════════════

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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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

      parsedMatches.push({
        match_id: outcome.eventId || 'N/A',
        home_team: outcome.homeTeamName || 'Unknown',
        away_team: outcome.awayTeamName || 'Unknown',
        league: outcome.sport?.category?.tournament?.name || 'Unknown',
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
        if (parsedMatches.length === 0) {
          return res.json({ success: true, message: 'Bet tracked (no matches)', betId });
        }

        let processed = 0;
        parsedMatches.forEach((match) => {
          db.run(
            `INSERT INTO matches (bet_id, match_id, home_team, away_team, league, match_time, selection, odds, market_name, outcome)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [betId, match.match_id, match.home_team, match.away_team, match.league, match.match_time, match.selection, match.odds, match.market_name, match.status],
            (err) => {
              if (err) console.error(`❌ [SERVER] Error inserting match:`, err);
              processed++;
              if (processed === parsedMatches.length) {
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

app.get('/bets', (req, res) => {
  db.all('SELECT * FROM bets ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.json({ success: false, error: err.message, bets: [] });
    res.json({ success: true, bets: rows });
  });
});

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

app.delete('/bets/:id', (req, res) => {
  const { id } = req.params;
  
  console.log(`🗑️ [SERVER] Deleting bet ID: ${id}`);

  // First delete matches
  db.run('DELETE FROM matches WHERE bet_id = ?', [id], (err) => {
    if (err) {
      console.error('❌ [SERVER] Error deleting matches:', err);
      return res.json({ success: false, error: 'Error deleting matches' });
    }
    
    console.log(`✅ [SERVER] Matches deleted for bet ${id}`);

    // Then delete bet
    db.run('DELETE FROM bets WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('❌ [SERVER] Error deleting bet:', err);
        return res.json({ success: false, error: 'Error deleting bet' });
      }
      
      if (this.changes === 0) {
        console.warn(`⚠️ [SERVER] Bet ${id} not found`);
        return res.json({ success: false, error: 'Bet not found' });
      }
      
      console.log(`✅ [SERVER] Bet ${id} deleted successfully`);
      
      // Verify deletion
      db.get('SELECT * FROM bets WHERE id = ?', [id], (err, row) => {
        if (row) {
          console.error(`❌ [SERVER] Bet ${id} still exists after deletion!`);
          return res.json({ success: false, error: 'Deletion failed - bet still exists' });
        }
        
        res.json({ success: true, message: 'Bet deleted successfully' });
      });
    });
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Track It API is running',
    footballData: process.env.FOOTBALL_DATA_API_KEY ? '✅ Configured' : '❌ Missing',
    apify: process.env.APIFY_API_KEY ? '✅ Configured' : '❌ Missing',
    database: '✅ Connected'
  });
});

// Serve React frontend
const buildPath = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));
  app.use((req, res) => res.sendFile(path.join(buildPath, 'index.html')));
} else {
  app.use((req, res) => res.json({ error: 'Frontend not built' }));
}

app.listen(PORT, () => {
  console.log(`\n🚀 Track It running on http://localhost:${PORT}`);
  console.log(`📊 Database: trackit.db`);
  console.log(`🔴 Hybrid Live Tracking: ${process.env.FOOTBALL_DATA_API_KEY ? '✅ Enabled' : '⚠️  Football-Data key missing'}`);
  console.log(`⚡ Apify Fallback: ${process.env.APIFY_API_KEY ? '✅ Enabled' : '⚠️  Disabled'}\n`);
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  db.close(() => process.exit(0));
});
