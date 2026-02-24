const fetch = require('node-fetch');
const BaseParser = require('./baseParser');

class SportyBetParser extends BaseParser {
  constructor() {
    super('SportyBet');
  }

  async fetchTicket(bookingCode) {
    const timestamp = Date.now();
    const url = `https://www.sportybet.com/api/ng/orders/share/${bookingCode}?_t=${timestamp}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'TrackIT/1.0',
        Referer: 'https://www.sportybet.com/',
      },
    });

    if (!response.ok) {
      throw new Error(`SportyBet request failed: ${response.status}`);
    }

    const payload = await response.json();
    if (payload.code !== undefined && payload.code !== 0) {
      throw new Error(payload.msg || 'Invalid SportyBet booking code');
    }

    return payload.data || payload;
  }

  mapTicket(ticket = {}) {
    const outcomes = ticket.outcomes || [];
    const selections = ticket.ticket?.selections || [];

    return outcomes.map((outcome, idx) => {
      const selectedOutcomeId = selections[idx]?.outcomeId;
      const market = outcome.markets?.[0] || {};
      const selectedMarketOutcome =
        market.outcomes?.find((item) => item.id === selectedOutcomeId) || market.outcomes?.[0] || {};

      return this.normalizeSelection({
        match_id: outcome.eventId,
        home_team: outcome.homeTeamName,
        away_team: outcome.awayTeamName,
        market_type: market.desc || market.name,
        selection: selectedMarketOutcome.desc || selectedMarketOutcome.name,
        odds: selectedMarketOutcome.odds,
        start_time: outcome.estimateStartTime ? new Date(outcome.estimateStartTime).toISOString() : null,
      });
    });
  }

  async parse(bookingCode) {
    const ticket = await this.fetchTicket(bookingCode);
    return this.mapTicket(ticket);
  }
}

module.exports = SportyBetParser;
