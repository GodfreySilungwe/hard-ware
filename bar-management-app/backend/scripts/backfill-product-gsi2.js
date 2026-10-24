const { DynamoDBClient, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { buildProductGsi2Keys } = require('../lib/dynamodb');

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'sampla-hardware-table';
const REGION = process.env.AWS_REGION || 'us-east-1';
const PAGE_SIZE = 100;

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

async function assertGsi2Exists() {
  const result = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
  const gsi2 = result.Table?.GlobalSecondaryIndexes?.find((index) => index.IndexName === 'GSI2');

  if (!gsi2) {
    throw new Error(`GSI2 was not found on DynamoDB table ${TABLE_NAME}`);
  }

  if (gsi2.IndexStatus !== 'ACTIVE' && gsi2.IndexStatus !== 'CREATING') {
    throw new Error(`GSI2 must be ACTIVE or CREATING before backfill; current status: ${gsi2.IndexStatus || 'unknown'}`);
  }
}

async function backfillProductGsi2() {
  await assertGsi2Exists();
  console.log(`Starting GSI2 product backfill for ${TABLE_NAME}`);

  const counts = {
    scanned: 0,
    updated: 0,
    alreadyCurrent: 0,
    skippedWithoutTenant: 0,
    failed: 0
  };
  let lastEvaluatedKey;
  let pageNumber = 0;
  const failures = [];

  do {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'PRODUCT' },
      ConsistentRead: true,
      Limit: PAGE_SIZE,
      ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {})
    }));
    const products = result.Items || [];
    lastEvaluatedKey = result.LastEvaluatedKey;
    pageNumber += 1;
    counts.scanned += products.length;

    for (const product of products) {
      const keys = buildProductGsi2Keys(product);
      if (!keys) {
        counts.skippedWithoutTenant += 1;
        continue;
      }

      if (product.GSI2PK === keys.GSI2PK && product.GSI2SK === keys.GSI2SK) {
        counts.alreadyCurrent += 1;
        continue;
      }

      const productId = product.id || product._id;
      try {
        if (!productId) throw new Error('Product has no id');

        await docClient.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            pk: 'PRODUCT',
            sk: `PRODUCT#${productId}`
          },
          UpdateExpression: 'SET GSI2PK = :gsi2pk, GSI2SK = :gsi2sk',
          ExpressionAttributeValues: {
            ':gsi2pk': keys.GSI2PK,
            ':gsi2sk': keys.GSI2SK
          },
          ConditionExpression: 'attribute_exists(pk)'
        }));
        counts.updated += 1;
      } catch (error) {
        counts.failed += 1;
        failures.push({ productId: productId || 'unknown', message: error.message });
        console.error(`Failed to backfill product ${productId || 'unknown'}: ${error.message}`);
      }
    }

    console.log(
      `Page ${pageNumber}: scanned ${products.length}; ` +
      `updated ${counts.updated}; skipped without tenant ${counts.skippedWithoutTenant}; ` +
      `already current ${counts.alreadyCurrent}; failed ${counts.failed}`
    );
  } while (lastEvaluatedKey);

  console.log('\nGSI2 product backfill summary:');
  console.log(`Scanned: ${counts.scanned}`);
  console.log(`Updated: ${counts.updated}`);
  console.log(`Already current: ${counts.alreadyCurrent}`);
  console.log(`Skipped (no tenantId): ${counts.skippedWithoutTenant}`);
  console.log(`Failed: ${counts.failed}`);

  if (failures.length > 0) {
    throw new Error(`${failures.length} product records failed; rerun the script to retry`);
  }
}

backfillProductGsi2()
  .catch((error) => {
    console.error('Product GSI2 backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    client.destroy();
  });
