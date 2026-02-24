class BaseParser {
  constructor(platform) {
    this.platform = platform;
  }

  normalizeSelection(selection = {}, fallback = {}) {
    return {
      match_id: String(selection.match_id || fallback.match_id || ''),
      home_team: selection.home_team || fallback.home_team || 'Unknown',
      away_team: selection.away_team || fallback.away_team || 'Unknown',
      market_type: selection.market_type || fallback.market_type || 'Unknown',
      selection: selection.selection || fallback.selection || 'Unknown',
      odds: Number(selection.odds || fallback.odds || 0),
      start_time: selection.start_time || fallback.start_time || null,
      source_platform: this.platform,
    };
  }

  normalizeTicket(selections = []) {
    return selections.map((selection) => this.normalizeSelection(selection));
  }
}

module.exports = BaseParser;
