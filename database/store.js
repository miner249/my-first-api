/**
 * database/store.js
 */

const { v4: uuidv4 } = require('uuid');

function createStore() {
  const bets      = [];
  const eventLogs = [];

  return {
    // ──────────────────────────────────────────────────────────
    // Lifecycle
    // ──────────────────────────────────────────────────────────
    async init() {
      console.log('✅ [Store] In-memory store initialised');
    },

    // ──────────────────────────────────────────────────────────
    // Bets
    // ──────────────────────────────────────────────────────────
    async insertBet({ bookingCode, platform, selections, stake, totalOdds, potentialWin, currency }) {
      const bet = {
        id:            uuidv4(),
        share_code:    bookingCode,
        bookingCode,
        platform,
        // Frontend-compatible fields
        total_odds:    totalOdds    || 0,
        stake:         stake        || 0,
        potential_win: potentialWin || 0,
        currency:      currency     || 'NGN',
        // Selections stored as both names so both old + new code works
        selections,
        matches: selections,        // frontend reads this
        status:     'pending',
        created_at:  new Date().toISOString(),
        createdAt:   new Date().toISOString(),
        updatedAt:   new Date().toISOString(),
      };
      bets.push(bet);
      return bet;
    },

    async getBets() {
      return [...bets].reverse();
    },

    async getBetById(id) {
      return bets.find((b) => b.id === String(id)) || null;
    },

    async updateBetStatus(id, status) {
      const bet = bets.find((b) => b.id === String(id));
      if (!bet) return null;
      bet.status    = status;
      bet.updatedAt = new Date().toISOString();
      return bet;
    },

    async deleteBet(id) {
      const index = bets.findIndex((b) => b.id === String(id));
      if (index === -1) return null;
      const [deleted] = bets.splice(index, 1);
      return deleted;
    },

    // ──────────────────────────────────────────────────────────
    // Subscriptions
    // ──────────────────────────────────────────────────────────
    async getSubscriptionsByBetId(betId) {
      return eventLogs
        .filter((e) => e.event_type === 'subscription_created' && e.payload?.betId === betId)
        .map((e) => e.payload);
    },

    // ──────────────────────────────────────────────────────────
    // Event log
    // ──────────────────────────────────────────────────────────
    async addEventLog({ event_type, payload }) {
      const entry = {
        id:        uuidv4(),
        event_type,
        payload,
        createdAt: new Date().toISOString(),
      };
      eventLogs.push(entry);
      return entry;
    },

    async getEventLogs() {
      return [...eventLogs].reverse();
    },
  };
}

module.exports = { createStore };