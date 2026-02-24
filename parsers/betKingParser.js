const createTemplateParser = require('./templateParserFactory');
const { buildSample } = require('./samplePayloads');

module.exports = createTemplateParser('BetKing', (bookingCode) => buildSample('betking', bookingCode));
