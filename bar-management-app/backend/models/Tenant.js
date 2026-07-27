const BaseModel = require('./baseModel');

class Tenant extends BaseModel {
  static entityType = 'tenant';
}

module.exports = Tenant;
