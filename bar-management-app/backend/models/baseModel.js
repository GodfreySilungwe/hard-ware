const dynamodb = require('../lib/dynamodb');

class QueryBuilder {
  constructor(model, query = {}, req = null) {
    this.model = model;
    this.query = query;
    this.req = req;
    this.populatePaths = [];
    this.sortConfig = null;
  }

  populate(path) {
    this.populatePaths.push(path);
    return this;
  }

  sort(sortConfig) {
    this.sortConfig = sortConfig;
    return this;
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }

  async exec() {
    const records = await this.model._find(this.query, this.req);
    let results = [...records];

    if (this.sortConfig) {
      const entries = Object.entries(this.sortConfig);
      results = results.sort((a, b) => {
        for (const [key, direction] of entries) {
          const left = a[key] ?? '';
          const right = b[key] ?? '';
          if (left < right) return direction === -1 ? 1 : -1;
          if (left > right) return direction === -1 ? -1 : 1;
        }
        return 0;
      });
    }

    if (this.populatePaths.length) {
      return Promise.all(results.map((record) => this.model._populateRecord(record, this.populatePaths, this.req)));
    }

    return results;
  }
}

class FindByIdBuilder {
  constructor(model, id, req = null) {
    this.model = model;
    this.id = id;
    this.req = req;
    this.populatePaths = [];
    this._promise = null;
  }

  populate(path) {
    this.populatePaths.push(path);
    return this;
  }

  async exec() {
    if (!this._promise) {
      this._promise = (async () => {
        const item = await dynamodb.getEntity(this.model.entityType, this.id);
        if (!item) {
          return null;
        }

        const tenantScope = this.model.getTenantScope(this.req);
        if (tenantScope && item.tenantId && item.tenantId !== tenantScope.tenantId) {
          return null;
        }

        const model = new this.model(item);
        Object.defineProperty(model, '_req', {
          value: this.req,
          writable: true,
          enumerable: false,
          configurable: true
        });

        if (this.populatePaths.length) {
          for (const path of this.populatePaths) {
            await model.populate(path, null, this.req);
          }
        }

        return model;
      })();
    }

    return this._promise;
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }
}

class BaseModel {
  constructor(data = {}) {
    Object.assign(this, data);
    if (!this.id && this._id) {
      this.id = this._id;
    }
    if (!this._id && this.id) {
      this._id = this.id;
    }
  }

  static getTenantScope(req) {
    const user = req?.user;
    if (user?.role === 'owner') {
      return null;
    }

    const tenantId = user?.tenantId || null;
    return tenantId ? { tenantId } : null;
  }

  static applyTenantFilter(query = {}, req = null) {
    const tenantScope = this.getTenantScope(req);
    if (!tenantScope) {
      return query;
    }

    return {
      ...query,
      tenantId: tenantScope.tenantId
    };
  }

  static entityType = 'item';

  static _find(query = {}, req = null) {
    const entityType = this.entityType;
    return dynamodb.listEntities(entityType).then((records) => {
      const scopedQuery = this.applyTenantFilter(query, req);
      if (!scopedQuery || Object.keys(scopedQuery).length === 0) {
        return records;
      }

      return records.filter((record) => {
        return Object.entries(scopedQuery).every(([key, value]) => {
          if (key === '$or') {
            return value.some((condition) => Object.entries(condition).every(([subKey, subValue]) => record[subKey] === subValue));
          }

          if (key === '$expr') {
            const expr = value;
            if (expr.$lte && Array.isArray(expr.$lte) && expr.$lte.length === 2) {
              const [leftKey, rightKey] = expr.$lte;
              return (record[leftKey.replace(/\$/g, '')] ?? 0) <= (record[rightKey.replace(/\$/g, '')] ?? 0);
            }
            return false;
          }

          if (Array.isArray(value)) {
            return value.includes(record[key]);
          }

          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const recordValue = record[key] ?? 0;

            if (value.$gte !== undefined && recordValue < value.$gte) {
              return false;
            }
            if (value.$lte !== undefined && recordValue > value.$lte) {
              return false;
            }
            if (value.$gt !== undefined && recordValue <= value.$gt) {
              return false;
            }
            if (value.$lt !== undefined && recordValue >= value.$lt) {
              return false;
            }
            if (value.$ne !== undefined) {
              return recordValue !== value.$ne;
            }

            // Fallback for exact object matching or unsupported operators.
            return Object.entries(value).every(([subKey, subValue]) => {
              if (subKey === '$gte') return recordValue >= subValue;
              if (subKey === '$lte') return recordValue <= subValue;
              if (subKey === '$gt') return recordValue > subValue;
              if (subKey === '$lt') return recordValue < subValue;
              if (subKey === '$ne') return recordValue !== subValue;
              return record[key] === value;
            });
          }

          return record[key] === value;
        });
      });
    });
  }

  static find(query = {}, req = null) {
    return new QueryBuilder(this, query, req);
  }

  static findById(id, req = null) {
    return new FindByIdBuilder(this, id, req);
  }

  static async findOne(query = {}, req = null) {
    const records = await this._find(query, req);
    return records[0] ? new this(records[0]) : null;
  }

  static async findByIdAndDelete(id, req = null) {
    const existing = await this.findById(id, req);
    if (!existing) return null;
    await existing.delete();
    return existing;
  }

  static async findByIdAndUpdate(id, updates, options = {}, req = null) {
    const existing = await this.findById(id, req);
    if (!existing) return null;
    Object.assign(existing, updates);
    await existing.save();
    return existing;
  }

  static async aggregate(pipeline = []) {
    const records = await dynamodb.listEntities(this.entityType);
    const groupStage = pipeline.find((stage) => stage.$group);
    if (!groupStage) return [];

    const grouped = {};
    for (const record of records) {
      const key = record[groupStage.$group._id?.replace(/\$/g, '')] ?? 'default';
      if (!grouped[key]) {
        grouped[key] = { _id: key, totalQuantity: 0, count: 0 };
      }
      grouped[key].totalQuantity += Number(record.quantity || 0);
      grouped[key].count += 1;
    }

    return Object.values(grouped);
  }

  static async _populateRecord(record, populatePaths, req) {
    const populated = { ...record };
    for (const path of populatePaths) {
      if (path === 'category' && populated.category) {
        populated.category = { _id: populated.category, name: 'Category' };
      }
      if (path === 'customer' && populated.customer) {
        populated.customer = { _id: populated.customer, name: 'Customer' };
      }
      if (path === 'supplier' && populated.supplier) {
        populated.supplier = { _id: populated.supplier, name: 'Supplier' };
      }
      if (path === 'items.product' && Array.isArray(populated.items)) {
        const Product = require('./Product');
        populated.items = await Promise.all(populated.items.map(async (item) => {
          if (!item || !item.product) return { ...item, product: null };

          const productId = typeof item.product === 'string'
            ? item.product
            : item.product?._id || item.product?.id;
          if (!productId) return { ...item, product: null };

          const product = await Product.findById(productId, req);
          return {
            ...item,
            product: product ? { _id: productId, name: product.name || 'Unknown' } : { _id: productId, name: 'Unknown' }
          };
        }));
      }
    }
    return populated;
  }

  async save() {
    const data = this.toJSON();
    const existingId = this._id || this.id;

    if (existingId) {
      const existing = await dynamodb.getEntity(this.constructor.entityType, existingId);
      if (existing) {
        const updated = await dynamodb.updateEntity(this.constructor.entityType, existingId, data);
        Object.assign(this, updated);
        return this;
      }
    }

    const created = await dynamodb.createEntity(this.constructor.entityType, data);
    Object.assign(this, created);
    return this;
  }

  async delete() {
    const id = this._id || this.id;
    if (!id) return null;
    return dynamodb.deleteEntity(this.constructor.entityType, id);
  }

  async populate(path, select, req = null) {
    const requestContext = req || this._req || null;

    if (path === 'category' && this.category) {
      this.category = { _id: this.category, name: 'Category' };
    }
    if (path === 'customer' && this.customer) {
      this.customer = { _id: this.customer, name: 'Customer' };
    }
    if (path === 'supplier' && this.supplier) {
      this.supplier = { _id: this.supplier, name: 'Supplier' };
    }
    if (path === 'items.product' && Array.isArray(this.items)) {
      const Product = require('./Product');
      this.items = await Promise.all(this.items.map(async (item) => {
        if (!item || !item.product) return { ...item, product: null };

        const productId = typeof item.product === 'string'
          ? item.product
          : item.product?._id || item.product?.id;
        if (!productId) return { ...item, product: null };

        const product = await Product.findById(productId, requestContext);
        const productName = product?.name || 'Unknown';
        return {
          ...item,
          product: product ? { _id: productId, name: productName } : { _id: productId, name: 'Unknown' },
          productName
        };
      }));
    }
    return this;
  }

  toJSON() {
    return { ...this };
  }
}

module.exports = BaseModel;
