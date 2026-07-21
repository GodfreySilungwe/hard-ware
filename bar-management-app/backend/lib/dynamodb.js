const { DynamoDBClient, DescribeTableCommand, CreateTableCommand, DeleteTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutItemCommand, GetItemCommand, ScanCommand, DeleteItemCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'sampla-hardware-table';
const region = process.env.AWS_REGION || 'us-east-1';

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
  const record = {
    pk: entityName,
    sk: `${entityName}#${id}`,
    entityType: String(entityType).toLowerCase(),
    id,
    _id: id,
    createdAt: data?.createdAt || now,
    updatedAt: data?.updatedAt || now,
    ...data
  };

  if (record.id && !record._id) record._id = record.id;
  if (record._id && !record.id) record.id = record._id;

  delete record.pk;
  delete record.sk;
  delete record.entityType;

  return {
    pk: entityName,
    sk: `${entityName}#${id}`,
    entityType: String(entityType).toLowerCase(),
    id,
    _id: id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...record
  };
}

function fromDynamoItem(item) {
  if (!item) return null;
  const record = { ...item };
  delete record.pk;
  delete record.sk;
  delete record.entityType;
  return normalizeRecord(record);
}

async function ensureTableExists() {
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    return true;
  } catch (error) {
    if (error?.name !== 'ResourceNotFoundException') {
      console.warn('DynamoDB table check skipped:', error.message);
      return false;
    }

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

      return true;
    } catch (createError) {
      console.warn('DynamoDB table creation skipped:', createError.message);
      return false;
    }
  }
}

async function listEntities(entityType) {
  await ensureTableExists();
  const result = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'entityType = :entityType',
    ExpressionAttributeValues: {
      ':entityType': String(entityType).toLowerCase()
    }
  }));

  return (result.Items || []).map(fromDynamoItem);
}

async function getEntity(entityType, id) {
  await ensureTableExists();
  const result = await docClient.send(new GetItemCommand({
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
  await docClient.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: item
  }));
  return fromDynamoItem(item);
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
  await docClient.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: item
  }));

  return fromDynamoItem(item);
}

async function deleteEntity(entityType, id) {
  await ensureTableExists();
  const existing = await getEntity(entityType, id);
  if (!existing) return null;

  await docClient.send(new DeleteItemCommand({
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
  updateEntity,
  deleteEntity,
  findByField,
  fromDynamoItem,
  toDynamoItem
};
