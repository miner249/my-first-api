const createTemplateParser = require('./templateParserFactory');
const { buildSample } = require('./samplePayloads');

module.exports = createTemplateParser('Bet9ja', (bookingCode) => buildSample('bet9ja', bookingCode));
