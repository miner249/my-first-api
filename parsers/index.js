const SportyBetParser = require('./sportyBetParser');
const Bet9jaParser = require('./bet9jaParser');
const OneXBetParser = require('./oneXBetParser');
const TwentyTwoBetParser = require('./twentyTwoBetParser');
const BetwayParser = require('./betwayParser');
const BetKingParser = require('./betKingParser');
const FootballComParser = require('./footballComParser');

const parserRegistry = {
  sportybet: new SportyBetParser(),
  bet9ja: new Bet9jaParser(),
  '1xbet': new OneXBetParser(),
  '22bet': new TwentyTwoBetParser(),
  betway: new BetwayParser(),
  betking: new BetKingParser(),
  'football.com': new FootballComParser(),
};

function getSupportedPlatforms() {
  return Object.keys(parserRegistry);
}

function getParser(platform = '') {
  return parserRegistry[platform.toLowerCase()];
}

module.exports = { getParser, getSupportedPlatforms };
