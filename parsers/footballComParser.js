const createTemplateParser = require('./templateParserFactory');
const { buildSample } = require('./samplePayloads');

module.exports = createTemplateParser('Football.com', (bookingCode) => buildSample('footballcom', bookingCode));
