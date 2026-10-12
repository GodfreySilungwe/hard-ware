const test = require('node:test');
const assert = require('node:assert/strict');
const { queryAllPages, buildGsiKeyConditionExpression } = require('../lib/dynamodb');

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