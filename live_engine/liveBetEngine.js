/**
 * live_engine/liveBetEngine.js
 */

const POLL_INTERVAL = parseInt(process.env.LIVE_POLL_INTERVAL_MS) || 60_000;

class LiveBetEngine {
  constructor({ realtime, store, dataProvider, notifications }) {
    this.realtime      = realtime;
    this.store         = store;
    this.dataProvider  = dataProvider;
    this.notifications = notifications;

    this._cachedLive = { matches: [], source: 'none', fetchedAt: null };
    this._timer      = null;
    this._running    = false;
  }

  // ──────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────

  start() {
    if (this._running) return;
    this._running = true;
    console.log(`🚀 [LiveBetEngine] Starting — polling every ${POLL_INTERVAL / 1000}s`);
    this._tick();
    this._timer = setInterval(() => this._tick(), POLL_INTERVAL);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._running = false;
    console.log('🛑 [LiveBetEngine] Stopped');
  }

  getCachedLive() {
    return this._cachedLive;
  }

  // ──────────────────────────────────────────────────────────────
  // Internal polling
  // ──────────────────────────────────────────────────────────────

  async _tick() {
    try {
      console.log('🔄 [LiveBetEngine] Polling live data...');

      const snapshot       = await this.dataProvider.fetchLiveSnapshot();
      this._cachedLive     = snapshot;

      if (!snapshot.matches.length) {
        console.log('ℹ️  [LiveBetEngine] No live matches right now');
        return;
      }

      console.log(`✅ [LiveBetEngine] ${snapshot.matches.length} live match(es) from ${snapshot.source}`);

      this.realtime.emit('live:update', snapshot);

      await this._correlateBets(snapshot.matches);

    } catch (error) {
      console.error('❌ [LiveBetEngine] Tick error:', error.message);
    }
  }

  async _correlateBets(liveMatches) {
    const bets = await this.store.getBets();
    if (!bets.length) return;

    const normalize = (s = '') => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const bet of bets) {
      if (bet.status === 'settled') continue;

      const selections = bet.selections || bet.matches || [];
      if (!selections.length) continue;

      const enrichedSelections = selections.map(sel => {
        const matchedLive = liveMatches.find(m => {
          // Football-Data uses home_team / away_team
          const mHome = normalize(m.home_team);
          const mAway = normalize(m.away_team);
          const sHome = normalize(sel.home_team);
          const sAway = normalize(sel.away_team);

          return (
            (mHome === sHome && mAway === sAway) ||
            (mHome.includes(sHome) && mAway.includes(sAway)) ||
            (sHome.includes(mHome) && sAway.includes(mAway))
          );
        });

        if (!matchedLive) return sel;

        return {
          ...sel,
          live: {
            home_score: matchedLive.home_score,
            away_score: matchedLive.away_score,
            status:     matchedLive.status,
            status_time: matchedLive.status_time,
            id:         matchedLive.id,
            source:     matchedLive.source,
          },
        };
      });

      const hasLive = enrichedSelections.some(s => s.live);
      if (!hasLive) continue;

      const update = { ...bet, selections: enrichedSelections };
      this.realtime.emit('bet:live-update', update);

      // Notify subscribers
      try {
        const subs = await this.store.getSubscriptionsByBetId(bet.id);
        for (const sub of subs) {
          await this.notifications.send({
            channel: sub.channel,
            target:  sub.target,
            subject: `TrackIT — Live update for bet ${bet.id.slice(0, 8)}`,
            message: this._formatUpdateMessage(update),
          });
        }
      } catch (notifError) {
        console.warn(`⚠️  [LiveBetEngine] Notification error for bet ${bet.id}:`, notifError.message);
      }
    }
  }

  _formatUpdateMessage(bet) {
    const lines = (bet.selections || [])
      .filter(s => s.live)
      .map(s =>
        `  ${s.home_team} vs ${s.away_team}: ` +
        `${s.live.home_score ?? '?'}-${s.live.away_score ?? '?'} (${s.live.status_time || s.live.status})`
      );

    return [`Bet ID: ${bet.id}`, 'Live scores:', ...lines].join('\n');
  }
}

module.exports = LiveBetEngine;