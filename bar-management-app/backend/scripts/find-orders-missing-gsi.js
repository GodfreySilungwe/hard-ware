const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'sampla-hardware-table';
const region = process.env.AWS_REGION || 'us-east-1';

const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client);

/**
 * Find orders missing GSI keys and identify why
 * Helps diagnose backfill issues
 * 
 * Run: node scripts/find-orders-missing-gsi.js
 */

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

async function findOrdersMissingGSI() {
  console.log('🔍 Finding orders missing GSI keys...\n');

  try {
    // Get all orders
    const allOrdersParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: 'ORDER' }
      },
      ConsistentRead: true
    };

    const allOrders = await queryAllPages(
      (params) => docClient.send(new QueryCommand(params)),
      allOrdersParams
    );

    // Find orders without GSI keys
    const missingGSI = allOrders.filter(order => !order.GSI1PK || !order.GSI1SK);

    console.log(`📊 Total orders: ${allOrders.length}`);
    console.log(`❌ Orders missing GSI keys: ${missingGSI.length}\n`);

    if (missingGSI.length === 0) {
      console.log('✅ All orders have GSI keys!');
      return;
    }

    console.log('📋 Orders missing GSI keys:\n');
    console.log('Order ID\t\t\t\t\ttenantId\t\t\tcreatedAt\t\t\tGSI1PK\tGSI1SK');
    console.log('─'.repeat(150));

    for (const order of missingGSI) {
      const orderId = order.id?.S || order._id?.S || 'UNKNOWN';
      const tenantId = order.tenantId?.S || 'NULL';
      const createdAt = order.createdAt?.S || 'NULL';
      const gsi1pk = order.GSI1PK?.S || 'MISSING';
      const gsi1sk = order.GSI1SK?.S || 'MISSING';

      console.log(`${orderId}\t${tenantId.slice(0, 20)}...\t${createdAt}\t${gsi1pk}\t${gsi1sk}`);
    }

    console.log('\n' + '─'.repeat(150));
    console.log('\n📌 Analysis:');

    // Check if all missing orders have null tenantId
    const withoutTenantId = missingGSI.filter(o => !o.tenantId?.S);
    const withTenantIdButNoGSI = missingGSI.filter(o => o.tenantId?.S && (!o.GSI1PK?.S || !o.GSI1SK?.S));

    if (withoutTenantId.length > 0) {
      console.log(`   ⚠️  ${withoutTenantId.length} orders have NO tenantId`);
      console.log(`      → Cannot create GSI keys without tenantId (GSI1PK must be populated)`);
      console.log(`      → These orders may be test/legacy orders`);
    }

    if (withTenantIdButNoGSI.length > 0) {
      console.log(`   ⚠️  ${withTenantIdButNoGSI.length} orders have tenantId but missing GSI keys`);
      console.log(`      → Backfill script should have populated these`);
      console.log(`      → Check if there were errors during backfill`);
    }

    console.log('\n💡 Recommendation:');
    if (withoutTenantId.length > 0) {
      console.log(`   1. Review the ${withoutTenantId.length} orders without tenantId`);
      console.log(`   2. Either assign tenantId or mark as test data`);
      console.log(`   3. Rerun backfill: node scripts/backfill-order-gsi.js`);
    }
    if (withTenantIdButNoGSI.length > 0) {
      console.log(`   Rerun backfill: node scripts/backfill-order-gsi.js`);
    }

  } catch (error) {
    console.error('❌ Query failed:', error.message);
    process.exit(1);
  }
}

findOrdersMissingGSI().then(() => {
  console.log('\n✅ Diagnostic completed.');
  process.exit(0);
});
