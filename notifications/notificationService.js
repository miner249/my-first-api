class NotificationService {
  constructor({ store }) {
    this.store = store;
  }

  async subscribe({ betId, channel = 'webpush', target }) {
    return this.store.createSubscription({ betId, channel, target });
  }

  async processLiveUpdate(snapshot) {
    // Phase-1 skeleton: wire Firebase Cloud Messaging or Web Push here.
    if (!snapshot?.matches?.length) return;
  }
}

module.exports = NotificationService;
