require('dotenv').config();

const express = require('express');
const cors = require('cors');
const EventEmitter = require('events');

const { getParser, getSupportedPlatforms } = require('./parsers');
const { createStore } = require('./database/store');
const LiveBetEngine = require('./live_engine/liveBetEngine');
const liveDataProvider = require('./live_engine/liveDataProvider');
const NotificationService = require('./notifications/notificationService');

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  const app = express();
  const realtime = new EventEmitter();

  const store = createStore();
  await store.init();

  const notifications = new NotificationService({ store });
  const liveEngine = new LiveBetEngine({ realtime, store, dataProvider: liveDataProvider, notifications });

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_, res) => {
    res.json({
      status: 'ok',
      platforms: getSupportedPlatforms(),
      realtime: 'SSE (Socket.io-ready abstraction in live_engine)',
      db: 'memory (see database/postgres.schema.sql for PostgreSQL production schema)',
    });
  });

  app.post('/track-bet', async (req, res) => {
    try {
      const { bookingCode, platform } = req.body;
      if (!bookingCode || !platform) {
        return res.status(400).json({ success: false, error: 'bookingCode and platform are required' });
      }

      const parser = getParser(platform);
      if (!parser) {
        return res.status(400).json({ success: false, error: `Unsupported platform: ${platform}` });
      }

      const selections = await parser.parse(bookingCode);
      const bet = await store.insertBet({ bookingCode, platform, selections });
      await store.addEventLog({ event_type: 'bet_tracked', payload: bet });

      realtime.emit('bet:tracked', bet);
      res.json({ success: true, bet });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/bets', async (_, res) => {
    const bets = await store.getBets();
    res.json({ success: true, bets });
  });

  app.get('/live', async (_, res) => {
    try {
     const cached = liveEngine.getCachedLive();
     if (cached.matches.length) {
       return res.json({ success: true, ...cached, cache: true });
    }

    const snapshot = await liveDataProvider.fetchLiveSnapshot();
    res.json({ success: true, ...snapshot, cache: false });
      
  } catch (error) {
    console.error( 'Live fetch failed:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch live snapshot'
    });
  }    
});
  
  app.get('/schedule', async (req_, res) => {
    try {
     const snapshot = await liveDataProvider.fetchScheduleSnapshot();
      
    res.json({ success: true, ...snapshot });
    }catch (error) {
     console.error('Schedule fetch failed:', error);

    res.status(500).json({
      success: false,
      error: 'failed to fetch schedule'
    });
   }   
});

  app.post('/subscribe', async (req, res) => {
    const { betId, channel, target } = req.body;
    if (!betId || !target) {
      return res.status(400).json({ success: false, error: 'betId and target are required' });
    }

    const subscription = await notifications.subscribe({ betId, channel, target });
    await store.addEventLog({ event_type: 'subscription_created', payload: subscription });
    res.json({ success: true, subscription });
  });

  app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const send = (event, payload) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const onLive = (payload) => send('live:update', payload);
    const onBet = (payload) => send('bet:tracked', payload);

    realtime.on('live:update', onLive);
    realtime.on('bet:tracked', onBet);

    send('ready', { ok: true });

    req.on('close', () => {
      realtime.off('live:update', onLive);
      realtime.off('bet:tracked', onBet);
    });
  });

  liveEngine.start();

  app.listen(PORT, () => {
    console.log(`TrackIT backend listening on http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start TrackIT backend:', error);
  process.exit(1);
});
