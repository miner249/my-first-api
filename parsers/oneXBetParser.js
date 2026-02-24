const createTemplateParser = require('./templateParserFactory');
const { buildSample } = require('./samplePayloads');

module.exports = createTemplateParser('1xBet', (bookingCode) => buildSample('1xbet', bookingCode));
