class MemoryStore {
  constructor() {
    this.bets = [];
    this.liveEvents = [];
    this.subscriptions = [];
  }

  async init() {}

  async insertBet({ bookingCode, platform, selections }) {
    const id = this.bets.length + 1;
    const bet = {
      id,
      booking_code: bookingCode,
      platform,
      created_at: new Date().toISOString(),
      selections,
    };
    this.bets.push(bet);
    return bet;
  }

  async getBets() {
    return this.bets;
  }

  async addEventLog(event) {
    this.liveEvents.push({ id: this.liveEvents.length + 1, ...event, created_at: new Date().toISOString() });
  }

  async createSubscription({ betId, channel, target }) {
    const subscription = { id: this.subscriptions.length + 1, bet_id: betId, channel, target };
    this.subscriptions.push(subscription);
    return subscription;
  }
}

function createStore() {
  return new MemoryStore();
}

module.exports = { createStore };
