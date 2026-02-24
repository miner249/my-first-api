class LiveBetEngine {
  constructor({ realtime, store, dataProvider, notifications, intervalMs = 30000 }) {
    this.realtime = realtime;
    this.store = store;
    this.dataProvider = dataProvider;
    this.notifications = notifications;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.cache = { matches: [], source: 'init' };
  }

  async tick() {
    try {
      const snapshot = await this.dataProvider.fetchLiveSnapshot();
      this.cache = snapshot;

      this.realtime.emit('live:update', snapshot);
      await this.store.addEventLog({ event_type: 'live_update', payload: snapshot });
      await this.notifications.processLiveUpdate(snapshot);
    } catch (error) {
      this.realtime.emit('live:error', { message: error.message });
    }
  }

  start() {
    this.tick();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  getCachedLive() {
    return this.cache;
  }
}

module.exports = LiveBetEngine;
