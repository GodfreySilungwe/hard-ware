const BaseModel = require('./baseModel');

class CashSession extends BaseModel {
  static entityType = 'cashsession';

  constructor(data = {}) {
    super({
      status: 'open',
      openingFloat: 0,
      expectedClosing: 0,
      ...data
    });
  }
}

module.exports = CashSession;