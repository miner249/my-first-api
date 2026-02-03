const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Disable caching for development
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// Initialize SQLite Database
const db = new sqlite3.Database('./sportybet.db', (err) => {
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

// Track bet endpoint - fetches from Sportybet AND saves to DB
app.post('/track-bet', async (req, res) => {
  const { shareCode } = req.body;

  if (!shareCode) {
    return res.json({ success: false, error: 'Share code is required' });
  }

  console.log(`\n🔍 [SERVER] Fetching bet from Sportybet: ${shareCode}`);

  try {
    // Fetch from Sportybet API (server-side, no CORS issues)
    const timestamp = Date.now();
    const sportyUrl = `https://www.sportybet.com/api/ng/orders/share/${shareCode.trim()}?_t=${timestamp}`;
    
    console.log(`📡 [SERVER] Calling: ${sportyUrl}`);
    
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

    console.log(`📊 [SERVER] Sportybet response status: ${sportyResponse.status}`);

    if (!sportyResponse.ok) {
      console.error(`❌ [SERVER] Sportybet API returned status ${sportyResponse.status}`);
      return res.json({ 
        success: false, 
        error: `Failed to fetch bet from Sportybet (Status: ${sportyResponse.status})` 
      });
    }

    const sportyData = await sportyResponse.json();
    console.log(`✅ [SERVER] Full Sportybet response:`, JSON.stringify(sportyData, null, 2));

    // Check for errors — some responses use "code", some don't
    if (sportyData.code !== undefined && sportyData.code !== 0) {
      return res.json({ 
        success: false, 
        error: sportyData.msg || 'Invalid share code or bet not found' 
      });
    }

    // The bet data could be in sportyData.data OR directly in sportyData itself
    const betData = sportyData.data || sportyData;

    if (!betData) {
      return res.json({ 
        success: false, 
        error: 'Bet data not found. The share code may be invalid.' 
      });
    }

    console.log(`📦 [SERVER] Bet data keys:`, Object.keys(betData));

    // Save to database
    const betInsert = `
      INSERT OR REPLACE INTO bets (share_code, total_odds, stake, potential_win, currency, raw_data)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.run(
      betInsert,
      [
        shareCode.trim(),
        betData.totalOdds || betData.odds,
        betData.stake,
        betData.maxWinAmount || betData.potentialWin,
        betData.currencyCode || 'NGN',
        JSON.stringify(betData)
      ],
      function(err) {
        if (err) {
          console.error('❌ [SERVER] Error inserting bet:', err);
          return res.json({ success: false, error: 'Database error while saving bet' });
        }

        const betId = this.lastID;
        console.log(`✅ [SERVER] Bet saved with ID: ${betId}`);

        const outcomes = betData.outcomes || [];

        if (outcomes.length === 0) {
          console.log('⚠️ [SERVER] No outcomes/matches found in bet');
          return res.json({
            success: true,
            message: 'Bet tracked successfully (no matches found)',
            betId
          });
        }

        console.log(`📋 [SERVER] Processing ${outcomes.length} matches...`);
        let processedMatches = 0;

        outcomes.forEach((outcome) => {
          const matchInsert = `
            INSERT INTO matches (
              bet_id, match_id, home_team, away_team, league, 
              match_time, selection, odds, market_name, outcome
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          db.run(
            matchInsert,
            [
              betId,
              outcome.eventId || outcome.matchId,
              outcome.homeName || outcome.homeTeam,
              outcome.awayName || outcome.awayTeam,
              outcome.sportName || outcome.league,
              outcome.matchTime || outcome.startTime,
              outcome.outcomeAlias || outcome.selection,
              outcome.odds,
              outcome.marketName,
              outcome.outcome || 'pending'
            ],
            (err) => {
              if (err) {
                console.error(`❌ [SERVER] Error inserting match:`, err);
              }

              processedMatches++;

              if (processedMatches === outcomes.length) {
                console.log(`🎉 [SERVER] All matches processed!\n`);
                res.json({
                  success: true,
                  message: 'Bet tracked successfully',
                  betId,
                  matchCount: outcomes.length
                });
              }
            }
          );
        });
      }
    );

  } catch (error) {
    console.error('❌ [SERVER] Error tracking bet:', error);
    return res.json({ 
      success: false,
      error: error.message || 'Server error while tracking bet'
    });
  }
});

// Route to get all bets
app.get('/bets', (req, res) => {
  db.all('SELECT * FROM bets ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.json({ success: false, error: err.message, bets: [] });
    }
    res.json({ success: true, bets: rows });
  });
});

// Route to get a specific bet with matches
app.get('/bets/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM bets WHERE id = ?', [id], (err, bet) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    if (!bet) {
      return res.json({ success: false, error: 'Bet not found' });
    }

    db.all('SELECT * FROM matches WHERE bet_id = ?', [id], (err, matches) => {
      if (err) {
        return res.json({ success: false, error: err.message });
      }
      res.json({ success: true, bet: { ...bet, matches } });
    });
  });
});

// Route to delete a bet
app.delete('/bets/:id', (req, res) => {
  const { id } = req.params;

  // First delete associated matches
  db.run('DELETE FROM matches WHERE bet_id = ?', [id], (err) => {
    if (err) {
      return res.json({ success: false, error: 'Error deleting matches' });
    }

    // Then delete the bet
    db.run('DELETE FROM bets WHERE id = ?', [id], function(err) {
      if (err) {
        return res.json({ success: false, error: 'Error deleting bet' });
      }
      
      if (this.changes === 0) {
        return res.json({ success: false, error: 'Bet not found' });
      }

      res.json({ success: true, message: 'Bet deleted successfully' });
    });
  });
});

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Track It API is running' });
});

// Serve static files from the React app (AFTER all API routes)
const buildPath = path.join(__dirname, 'client', 'dist');

// Check if build path exists
const fs = require('fs');
if (fs.existsSync(buildPath)) {
  console.log('✅ Found client build directory');
  app.use(express.static(buildPath));
  
  // The "catchall" handler: for any request that doesn't match API routes,
  // send back the React app's index.html file.
  app.use((req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
} else {
  console.warn('⚠️  Client build directory not found at:', buildPath);
  console.warn('⚠️  Run "npm run build" to build the frontend');
  
  app.use((req, res) => {
    res.json({ 
      error: 'Frontend not built yet. Run: npm run build',
      buildPath: buildPath 
    });
  });
}

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📊 Database: sportybet.db`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed');
    }
    process.exit(0);
  });
});