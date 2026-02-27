require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const EventEmitter = require('events');

const { getParser, getSupportedPlatforms } = require('./parsers');
const { createStore }      = require('./database/store');
const LiveBetEngine        = require('./live_engine/liveBetEngine');
const liveDataProvider     = require('./live_engine/liveDataProvider');
const NotificationService  = require('./notifications/notificationService');

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  const app      = express();
  const realtime = new EventEmitter();
  realtime.setMaxListeners(50);

  const store         = createStore();
  await store.init();

  const notifications = new NotificationService({ store });
  const liveEngine    = new LiveBetEngine({
    realtime,
    store,
    dataProvider: liveDataProvider,
    notifications,
  });

  app.use(cors());
  app.use(express.json());

  // ──────────────────────────────────────────────────────────────
  // Health
  // ──────────────────────────────────────────────────────────────
  app.get('/health', (_, res) => {
    res.json({
      status:    'ok',
      platforms: getSupportedPlatforms(),
      realtime:  'SSE  (/events)',
      db:        'memory (see database/postgres.schema.sql for PostgreSQL schema)',
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Track a bet  (accepts shareCode OR bookingCode + platform)
  // ──────────────────────────────────────────────────────────────
  app.post('/track-bet', async (req, res) => {
    try {
      // Accept either shareCode (frontend) or bookingCode (legacy)
      const shareCode   = req.body.shareCode   || req.body.bookingCode;
      const platform    = req.body.platform;

      if (!shareCode) {
        return res.status(400).json({
          success: false,
          error:   'shareCode is required',
        });
      }

      if (!platform) {
        return res.status(400).json({
          success: false,
          error:   'platform is required',
        });
      }

      const parser = getParser(platform);
      if (!parser) {
        return res.status(400).json({
          success: false,
          error:   `Unsupported platform: ${platform}. Supported: ${getSupportedPlatforms().join(', ')}`,
        });
      }

      console.log(`🔍 [/track-bet] ${platform.toUpperCase()} — ${shareCode}`);

      const selections = await parser.parse(shareCode);
      const bet        = await store.insertBet({
        bookingCode: shareCode,
        shareCode,
        platform,
        selections,
      });
      await store.addEventLog({ event_type: 'bet_tracked', payload: bet });

      realtime.emit('bet:tracked', bet);
      res.json({ success: true, bet });

    } catch (error) {
      console.error('❌ [POST /track-bet]', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // List bets
  // ──────────────────────────────────────────────────────────────
  app.get('/bets', async (_, res) => {
    try {
      const bets = await store.getBets();
      res.json({ success: true, count: bets.length, bets });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // Get single bet by ID
  // ──────────────────────────────────────────────────────────────
  app.get('/bets/:id', async (req, res) => {
    try {
      const bet = await store.getBetById(req.params.id);
      if (!bet) {
        return res.status(404).json({ success: false, error: 'Bet not found' });
      }
      res.json({ success: true, bet });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // Delete a bet
  // ──────────────────────────────────────────────────────────────
  app.delete('/bets/:id', async (req, res) => {
    try {
      const deleted = await store.deleteBet(req.params.id);
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Bet not found' });
      }
      res.json({ success: true, message: 'Bet deleted' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // Live matches
  // ──────────────────────────────────────────────────────────────
  app.get('/live', async (_, res) => {
    try {
      const cached = liveEngine.getCachedLive();
      if (cached.matches.length) {
        return res.json({ success: true, ...cached, cache: true });
      }
      const snapshot = await liveDataProvider.fetchLiveSnapshot();
      res.json({ success: true, ...snapshot, cache: false });
    } catch (error) {
      console.error('❌ [GET /live]', error.message);
      res.status(500).json({ success: false, error: 'Failed to fetch live snapshot' });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // Schedule
  // ──────────────────────────────────────────────────────────────
  app.get('/schedule', async (_, res) => {
    try {
      const snapshot = await liveDataProvider.fetchScheduleSnapshot();
      res.json({ success: true, ...snapshot });
    } catch (error) {
      console.error('❌ [GET /schedule]', error.message);
      res.status(500).json({ success: false, error: 'Failed to fetch schedule' });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // Subscribe to notifications
  // ──────────────────────────────────────────────────────────────
  app.post('/subscribe', async (req, res) => {
    try {
      const { betId, channel = 'console', target } = req.body;

      if (!betId || !target) {
        return res.status(400).json({
          success: false,
          error:   'betId and target are required',
        });
      }

      const bet = await store.getBetById(betId);
      if (!bet) {
        return res.status(404).json({ success: false, error: `Bet ${betId} not found` });
      }

      const subscription = await notifications.subscribe({ betId, channel, target });
      await store.addEventLog({ event_type: 'subscription_created', payload: subscription });

      res.json({ success: true, subscription });

    } catch (error) {
      console.error('❌ [POST /subscribe]', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // SSE – Server-Sent Events stream
  // ──────────────────────────────────────────────────────────────
  app.get('/events', (req, res) => {
    res.setHeader('Content-Type',      'text/event-stream');
    res.setHeader('Cache-Control',     'no-cache');
    res.setHeader('Connection',        'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event, payload) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const onLive    = (payload) => send('live:update',     payload);
    const onBet     = (payload) => send('bet:tracked',     payload);
    const onBetLive = (payload) => send('bet:live-update', payload);

    realtime.on('live:update',     onLive);
    realtime.on('bet:tracked',     onBet);
    realtime.on('bet:live-update', onBetLive);

    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000);

    send('ready', { ok: true, timestamp: new Date().toISOString() });

    req.on('close', () => {
      clearInterval(heartbeat);
      realtime.off('live:update',     onLive);
      realtime.off('bet:tracked',     onBet);
      realtime.off('bet:live-update', onBetLive);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // API aliases for the frontend
  // ──────────────────────────────────────────────────────────────
  app.get('/api/live', async (_, res) => {
    try {
      const snapshot = await liveDataProvider.fetchLiveSnapshot();
      res.json({ success: true, ...snapshot });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get('/api/today', async (_, res) => {
    try {
      const snapshot = await liveDataProvider.fetchScheduleSnapshot();
      res.json({ success: true, ...snapshot });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get('/api/match/:id', async (req, res) => {
    try {
      const snapshot = await liveDataProvider.fetchLiveSnapshot();
      const match    = (snapshot.matches || []).find(
        m => String(m.id) === String(req.params.id)
      );
      if (!match) return res.status(404).json({ success: false, error: 'Match not found' });
      res.json({ success: true, match });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get('/api/tracked-live-matches', async (_, res) => {
    try {
      const bets        = await store.getBets();
      const snapshot    = await liveDataProvider.fetchLiveSnapshot();
      const liveMatches = snapshot.matches || [];

      const matches = bets.flatMap(bet =>
        (bet.selections || []).map(sel => {
          const live = liveMatches.find(m =>
            m.home_team?.includes(sel.home_team) ||
            m.away_team?.includes(sel.away_team)
          );
          if (!live) return null;
          return {
            shareCode:  bet.shareCode || bet.bookingCode,
            platform:   bet.platform,
            match:      live,
            marketName: sel.market_name,
            selection:  sel.selection,
          };
        }).filter(Boolean)
      );

      res.json({ success: true, matches });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ──────────────────────────────────────────────────────────────
  // Serve React frontend
  // ──────────────────────────────────────────────────────────────
  app.use(express.static(path.join(__dirname, 'client/dist')));
  app.get('/{*splat}', (_, res) => {
    res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
  });

  // ──────────────────────────────────────────────────────────────
  // Start
  // ──────────────────────────────────────────────────────────────
  liveEngine.start();

  app.listen(PORT, () => {
    console.log(`TrackIT backend listening on http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start TrackIT backend:', error);
  process.exit(1);
});