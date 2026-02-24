const createTemplateParser = require('./templateParserFactory');
const { buildSample } = require('./samplePayloads');

module.exports = createTemplateParser('22Bet', (bookingCode) => buildSample('22bet', bookingCode));
