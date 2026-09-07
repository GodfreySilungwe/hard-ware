const test = require('node:test');
const assert = require('node:assert/strict');
const { queryAllPages } = require('../lib/dynamodb');

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