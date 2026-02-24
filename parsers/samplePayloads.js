function buildSample(platform, bookingCode) {
  return {
    bookingCode,
    platform,
    selections: [
      {
        match_id: `${platform.toLowerCase()}-${bookingCode}-1`,
        home_team: 'Arsenal',
        away_team: 'Chelsea',
        market_type: 'Match Winner',
        selection: 'Arsenal',
        odds: 1.82,
        start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      {
        match_id: `${platform.toLowerCase()}-${bookingCode}-2`,
        home_team: 'Real Madrid',
        away_team: 'Barcelona',
        market_type: 'Over/Under 2.5',
        selection: 'Over 2.5',
        odds: 1.66,
        start_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      },
    ],
  };
}

module.exports = { buildSample };
