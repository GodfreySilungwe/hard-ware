const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'sampla-hardware-table';
const region = process.env.AWS_REGION || 'us-east-1';

const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client);

/**
 * Compare GSI query counts with Primary Key query counts
 * Verifies that all orders have been backfilled with GSI keys
 * 
 * Run: node scripts/compare-gsi-counts.js
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

async function compareOrderCounts() {
  console.log('📊 Comparing order counts: PK vs GSI1\n');

  try {
    // Method 1: Query by Primary Key (pk = "ORDER")
    console.log('🔍 Method 1: Query by Primary Key (pk)');
    const pkQueryParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: 'ORDER' }
      },
      ConsistentRead: true,
      Select: 'COUNT' // Only count, don't retrieve items
    };

    const pkResult = await docClient.send(new QueryCommand(pkQueryParams));
    const pkCount = pkResult.Count || 0;
    console.log(`   ✅ Found ${pkCount} orders via PK query\n`);

    // Method 2: Query by GSI1 - Get all unique tenants first, then count
    console.log('🔍 Method 2: Query by GSI1 (tenant + date range)');
    
    // Get all orders to extract unique tenants
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

    const uniqueTenants = [...new Set(allOrders.map(order => order.GSI1PK?.S).filter(Boolean))];
    console.log(`   📍 Found ${uniqueTenants.length} unique tenants\n`);

    let totalGSICount = 0;
    let ordersWithGSI = 0;
    let ordersWithoutGSI = 0;

    for (const tenant of uniqueTenants) {
      const gsiParams = {
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :gsi1pk',
        ExpressionAttributeValues: {
          ':gsi1pk': { S: tenant }
        },
        Select: 'COUNT'
      };

      const gsiResult = await docClient.send(new QueryCommand(gsiParams));
      const tenantCount = gsiResult.Count || 0;
      totalGSICount += tenantCount;
      console.log(`   - Tenant ${tenant}: ${tenantCount} orders`);
    }

    console.log(`\n   ✅ Found ${totalGSICount} orders via GSI1 query\n`);

    // Method 3: Check for orders missing GSI keys
    console.log('🔍 Method 3: Check for missing GSI keys\n');
    for (const order of allOrders) {
      if (order.GSI1PK && order.GSI1SK) {
        ordersWithGSI++;
      } else {
        ordersWithoutGSI++;
      }
    }

    // Comparison Results
    console.log('📊 COMPARISON RESULTS:');
    console.log('═'.repeat(50));
    console.log(`PK Query Count:          ${pkCount} orders`);
    console.log(`GSI1 Query Count:        ${totalGSICount} orders`);
    console.log(`Orders with GSI keys:    ${ordersWithGSI} orders`);
    console.log(`Orders without GSI keys: ${ordersWithoutGSI} orders`);
    console.log('═'.repeat(50));

    if (pkCount === totalGSICount && ordersWithoutGSI === 0) {
      console.log('\n✅ SUCCESS: All orders have been backfilled with GSI keys!');
      console.log(`   - ${pkCount} orders match between PK and GSI queries`);
      console.log(`   - 100% GSI key coverage`);
      console.log('\n🎯 Ready to implement GSI-based queries!');
    } else {
      console.log('\n⚠️  MISMATCH DETECTED:');
      if (pkCount !== totalGSICount) {
        console.log(`   - PK count (${pkCount}) ≠ GSI count (${totalGSICount})`);
      }
      if (ordersWithoutGSI > 0) {
        console.log(`   - ${ordersWithoutGSI} orders are missing GSI keys`);
      }
      console.log('\n💡 Run backfill script again to complete migration:');
      console.log('   node scripts/backfill-order-gsi.js');
    }
  } catch (error) {
    console.error('❌ Comparison failed:', error.message);
    process.exit(1);
  }
}

compareOrderCounts().then(() => {
  console.log('\n✅ Comparison completed.');
  process.exit(0);
});
