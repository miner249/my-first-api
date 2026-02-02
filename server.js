const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

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

// NEW ENDPOINT: Save bet data (called from frontend after frontend fetches from Sportybet)
app.post('/save-bet', async (req, res) => {
  const { shareCode, betData } = req.body;

  if (!shareCode || !betData) {
    return res.json({ success: false, error: 'Share code and bet data are required' });
  }

  console.log(`\n💾 Saving bet: ${shareCode}`);
  console.log(`📊 Bet data received:`, JSON.stringify(betData, null, 2).substring(0, 500) + '...');

  try {
    // Save to database
    const betInsert = `
      INSERT OR REPLACE INTO bets (share_code, total_odds, stake, potential_win, currency, raw_data)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.run(
      betInsert,
      [
        shareCode,
        betData.totalOdds || betData.odds,
        betData.stake,
        betData.maxWinAmount || betData.potentialWin,
        betData.currencyCode || 'NGN',
        JSON.stringify(betData)
      ],
      function(err) {
        if (err) {
          console.error('❌ Error inserting bet:', err);
          return res.json({ success: false, error: 'Database error while saving bet' });
        }

        const betId = this.lastID;
        console.log(`✅ Bet saved with ID: ${betId}`);

        // Parse and save matches
        const outcomes = betData.outcomes || [];
        
        if (outcomes.length === 0) {
          console.log('⚠️ No outcomes/matches found in bet');
          return res.json({
            success: true,
            message: 'Bet tracked successfully (no matches found)',
            betId
          });
        }

        console.log(`📋 Processing ${outcomes.length} matches...`);
        let processedMatches = 0;
        let errors = 0;

        outcomes.forEach((outcome, index) => {
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
                console.error(`❌ Error inserting match ${index + 1}:`, err);
                errors++;
              } else {
                console.log(`✅ Match ${index + 1} saved`);
              }

              processedMatches++;

              // Send response after all matches are processed
              if (processedMatches === outcomes.length) {
                console.log(`🎉 Processing complete! ${outcomes.length - errors} matches saved, ${errors} errors\n`);
                res.json({
                  success: true,
                  message: 'Bet tracked successfully',
                  betId,
                  matchCount: outcomes.length - errors
                });
              }
            }
          );
        });
      }
    );

  } catch (error) {
    console.error('❌ Error saving bet:', error);
    return res.json({ 
      success: false,
      error: 'Server error while saving bet'
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
  res.json({ status: 'OK', message: 'Sportybet Tracker API is running' });
});

// Serve static files from the React app (AFTER all API routes)
const buildPath = path.join(__dirname, 'dist');
app.use(express.static(buildPath));

// The "catchall" handler: for any request that doesn't match API routes,
// send back the React app's index.html file.
app.use((req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

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