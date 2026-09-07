const BaseModel = require('./baseModel');

class CashEntry extends BaseModel {
  static entityType = 'cashentry';

  constructor(data = {}) {
    super({
      account: 'cash',
      direction: 'in',
      status: 'posted',
      ...data
    });
  }
}

module.exports = CashEntry;