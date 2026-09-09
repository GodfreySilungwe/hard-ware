const { DynamoDBClient, DescribeTableCommand, CreateTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, QueryCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'sampla-hardware-table';
const region = process.env.AWS_REGION || 'us-east-1';
const TABLE_CREATION_WAIT_MS = 2000;
const TABLE_CREATION_MAX_ATTEMPTS = 20;

const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client);

function generateId() {
  return crypto.randomUUID();
}

function normalizeRecord(record) {
  if (!record) return null;
  const normalized = { ...record };
  if (normalized.id && !normalized._id) normalized._id = normalized.id;
  if (normalized._id && !normalized.id) normalized.id = normalized._id;
  return normalized;
}

function toDynamoItem(entityType, data) {
  const now = new Date().toISOString();
  const entityName = String(entityType).toUpperCase();
  const id = data?.id || data?._id || generateId();
  const createdAt = data?.createdAt || now;
  const record = {
    pk: entityName,
    sk: `${entityName}#${id}`,
    entityType: String(entityType).toLowerCase(),
    id,
    _id: id,
    createdAt,
    updatedAt: data?.updatedAt || now,
    ...data
  };

  if (record.id && !record._id) record._id = record.id;
  if (record._id && !record.id) record.id = record._id;

  delete record.pk;
  delete record.sk;
  delete record.entityType;

  const item = {
    pk: entityName,
    sk: `${entityName}#${id}`,
    entityType: String(entityType).toLowerCase(),
    id,
    _id: id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...record
  };

  // Populate GSI1 keys for orders to enable efficient tenant + date-range queries
  if (String(entityType).toLowerCase() === 'order' && data?.tenantId) {
    item.GSI1PK = data.tenantId;
    item.GSI1SK = createdAt;
  }

  return item;
}

function fromDynamoItem(item) {
  if (!item) return null;
  const record = { ...item };
  delete record.pk;
  delete record.sk;
  return normalizeRecord(record);
}

async function ensureTableExists() {
  try {
    const result = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    if (result.Table?.TableStatus === 'ACTIVE') {
      return true;
    }
  } catch (error) {
    if (error?.name !== 'ResourceNotFoundException') {
      throw error;
    }

    console.log(`📦 Creating DynamoDB table ${TABLE_NAME}...`);
    try {
      await client.send(new CreateTableCommand({
        TableName: TABLE_NAME,
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' }
        ],
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' }
        ],
        BillingMode: 'PAY_PER_REQUEST'
      }));
    } catch (createError) {
      if (createError?.name !== 'ResourceInUseException') {
        throw createError;
      }
    }
  }

  for (let attempt = 1; attempt <= TABLE_CREATION_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
      if (result.Table?.TableStatus === 'ACTIVE') {
        return true;
      }
    } catch (error) {
      if (error?.name === 'ResourceNotFoundException') {
        // Table is still propagating; keep polling.
      } else {
        throw error;
      }
    }

    if (attempt === TABLE_CREATION_MAX_ATTEMPTS) {
      throw new Error(`DynamoDB table ${TABLE_NAME} did not become active in time`);
    }

    await new Promise((resolve) => setTimeout(resolve, TABLE_CREATION_WAIT_MS));
  }

  return false;
}

async function listEntities(entityType) {
  await ensureTableExists();
  const queryParams = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': String(entityType).toUpperCase()
    },
    ConsistentRead: true
  };

  const items = await queryAllPages(
    (params) => docClient.send(new QueryCommand(params)),
    queryParams
  );

  return items
    .map(fromDynamoItem);
}

async function queryAllPages(sendQuery, queryParams) {
  const items = [];
  let exclusiveStartKey;

  do {
    const result = await sendQuery({
      ...queryParams,
      ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {})
    });
    items.push(...(result.Items || []));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
}

async function getEntity(entityType, id) {
  await ensureTableExists();
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      pk: String(entityType).toUpperCase(),
      sk: `${String(entityType).toUpperCase()}#${id}`
    }
  }));

  return fromDynamoItem(result.Item);
}

async function createEntity(entityType, data) {
  await ensureTableExists();
  const item = toDynamoItem(entityType, data);
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: item
  }));
  return fromDynamoItem(item);
}

async function batchCreateEntities(entityType, records) {
  await ensureTableExists();
  const items = records.map((record) => toDynamoItem(entityType, record));

  for (let index = 0; index < items.length; index += 25) {
    let unprocessedItems = items.slice(index, index + 25).map((Item) => ({ PutRequest: { Item } }));
    let attempts = 0;

    while (unprocessedItems.length > 0) {
      const result = await docClient.send(new BatchWriteCommand({
        RequestItems: { [TABLE_NAME]: unprocessedItems }
      }));
      unprocessedItems = result.UnprocessedItems?.[TABLE_NAME] || [];
      attempts += 1;
      if (unprocessedItems.length > 0 && attempts >= 5) {
        throw new Error('DynamoDB could not process all imported products');
      }
    }
  }

  return items.map(fromDynamoItem);
}

async function updateEntity(entityType, id, updates) {
  await ensureTableExists();
  const existing = await getEntity(entityType, id);
  if (!existing) return null;

  const updated = {
    ...existing,
    ...updates,
    id: existing.id,
    _id: existing._id,
    updatedAt: new Date().toISOString()
  };

  const item = toDynamoItem(entityType, updated);
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: item
  }));

  return fromDynamoItem(item);
}

async function deleteEntity(entityType, id) {
  await ensureTableExists();
  const existing = await getEntity(entityType, id);
  if (!existing) return null;

  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: {
      pk: String(entityType).toUpperCase(),
      sk: `${String(entityType).toUpperCase()}#${id}`
    }
  }));

  return existing;
}

async function findByField(entityType, field, value) {
  const records = await listEntities(entityType);
  return records.find((record) => record[field] === value) || null;
}

module.exports = {
  TABLE_NAME,
  ensureTableExists,
  generateId,
  listEntities,
  getEntity,
  createEntity,
  batchCreateEntities,
  updateEntity,
  deleteEntity,
  findByField,
  queryAllPages,
  fromDynamoItem,
  toDynamoItem
};
