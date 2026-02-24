const createTemplateParser = require('./templateParserFactory');
const { buildSample } = require('./samplePayloads');

module.exports = createTemplateParser('Betway', (bookingCode) => buildSample('betway', bookingCode));
