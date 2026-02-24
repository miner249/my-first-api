const BaseParser = require('./baseParser');

function createTemplateParser(platformName, sampleMapper) {
  return class TemplateParser extends BaseParser {
    constructor() {
      super(platformName);
    }

    async fetchTicket(bookingCode) {
      // Phase-1 example: replace this with official platform API integration.
      return sampleMapper(bookingCode);
    }

    mapTicket(ticket = {}) {
      return this.normalizeTicket(ticket.selections || []);
    }

    async parse(bookingCode) {
      const payload = await this.fetchTicket(bookingCode);
      return this.mapTicket(payload);
    }
  };
}

module.exports = createTemplateParser;
