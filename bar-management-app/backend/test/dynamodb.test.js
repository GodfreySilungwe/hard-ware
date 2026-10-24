const test = require('node:test');
const assert = require('node:assert/strict');
const {
  queryAllPages,
  buildGsiKeyConditionExpression,
  buildProductGsi2QueryParams,
  buildProductGsi2Keys,
  toDynamoItem
} = require('../lib/dynamodb');

test('adds tenant and category GSI2 keys to product records', () => {
  const item = toDynamoItem('product', {
    id: 'product-1',
    tenantId: 'hardware-1',
    category: 'category-1',
    createdAt: '2026-10-24T12:00:00.000Z'
  });

  assert.equal(item.GSI2PK, 'TENANT#hardware-1');
  assert.equal(item.GSI2SK, 'PRODUCT#CATEGORY#category-1#2026-10-24T12:00:00.000Z#product-1');
});

test('adds GSI2 keys for populated categories and uncategorized products', () => {
  const populatedCategoryItem = toDynamoItem('product', {
    tenantId: 'hardware-1',
    id: 'product-2',
    category: { _id: 'category-2', name: 'Fasteners' }
  });
  const uncategorizedItem = toDynamoItem('product', { tenantId: 'hardware-1' });

  assert.equal(
    populatedCategoryItem.GSI2SK,
    `PRODUCT#CATEGORY#category-2#${populatedCategoryItem.createdAt}#product-2`
  );
  assert.match(uncategorizedItem.GSI2SK, /^PRODUCT#CATEGORY#UNCATEGORIZED#/);
});

test('does not add GSI2 keys to products without a tenant', () => {
  const item = toDynamoItem('product', { id: 'legacy-product' });

  assert.equal(item.GSI2PK, undefined);
  assert.equal(item.GSI2SK, undefined);
  assert.equal(buildProductGsi2Keys({ id: 'legacy-product' }), null);
});

test('builds tenant-scoped GSI2 product queries with optional category, page, and projection', () => {
  const query = buildProductGsi2QueryParams('hardware-1', {
    categoryId: 'category-1',
    limit: 20,
    exclusiveStartKey: { pk: 'PRODUCT', sk: 'PRODUCT#product-1' },
    projection: ['id', 'name']
  });

  assert.equal(query.IndexName, 'GSI2');
  assert.equal(query.KeyConditionExpression, 'GSI2PK = :gsi2pk AND begins_with(GSI2SK, :gsi2skPrefix)');
  assert.equal(query.ExpressionAttributeValues[':gsi2pk'], 'TENANT#hardware-1');
  assert.equal(query.ExpressionAttributeValues[':gsi2skPrefix'], 'PRODUCT#CATEGORY#category-1#');
  assert.equal(query.Limit, 20);
  assert.deepEqual(query.ExclusiveStartKey, { pk: 'PRODUCT', sk: 'PRODUCT#product-1' });
  assert.deepEqual(query.ExpressionAttributeNames, { '#field0': 'id', '#field1': 'name' });
});

test('requires a tenant ID for GSI2 product queries', () => {
  assert.throws(() => buildProductGsi2QueryParams(null), /tenantId is required/);
});

test('builds a valid GSI date-range key condition', () => {
  assert.equal(
    buildGsiKeyConditionExpression('2026-10-11T22:00:00.000Z', '2026-10-12T16:59:59.999Z'),
    'GSI1PK = :gsi1pk AND GSI1SK BETWEEN :startDate AND :endDate'
  );
});

test('builds valid one-sided GSI date key conditions', () => {
  assert.equal(buildGsiKeyConditionExpression('start', null), 'GSI1PK = :gsi1pk AND GSI1SK >= :startDate');
  assert.equal(buildGsiKeyConditionExpression(null, 'end'), 'GSI1PK = :gsi1pk AND GSI1SK <= :endDate');
  assert.equal(buildGsiKeyConditionExpression(null, null), 'GSI1PK = :gsi1pk');
});

test('queryAllPages follows DynamoDB continuation keys', async () => {
  const requests = [];
  const pages = [
    { Items: [{ id: 'first' }], LastEvaluatedKey: { pk: 'ORDER', sk: 'ORDER#first' } },
    { Items: [{ id: 'second' }], LastEvaluatedKey: { pk: 'ORDER', sk: 'ORDER#second' } },
    { Items: [{ id: 'third' }] }
  ];

  const items = await queryAllPages(async (params) => {
    requests.push(params);
    return pages[requests.length - 1];
  }, { TableName: 'test-table', KeyConditionExpression: 'pk = :pk' });

  assert.deepEqual(items, [{ id: 'first' }, { id: 'second' }, { id: 'third' }]);
  assert.equal(requests.length, 3);
  assert.equal(requests[0].ExclusiveStartKey, undefined);
  assert.deepEqual(requests[1].ExclusiveStartKey, pages[0].LastEvaluatedKey);
  assert.deepEqual(requests[2].ExclusiveStartKey, pages[1].LastEvaluatedKey);
});