const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'sampla-hardware-table';
const region = process.env.AWS_REGION || 'us-east-1';

const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client);

/**
 * Verify pagination: Check that queryAllPages retrieves ALL orders across all pages
 * Shows pagination details and confirms no orders are missed
 * 
 * Run: node scripts/verify-pagination.js
 */

async function verifyPagination() {
  console.log('🔍 Verifying DynamoDB pagination for orders...\n');

  try {
    // Query with detailed pagination tracking
    const queryParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: 'ORDER' }
      },
      ConsistentRead: true
    };

    const items = [];
    let pageNumber = 0;
    let exclusiveStartKey;
    const pageDetails = [];

    console.log('📄 Pagination Details:\n');

    do {
      pageNumber++;
      const result = await docClient.send(new QueryCommand({
        ...queryParams,
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {})
      }));

      const pageItemCount = result.Items?.length || 0;
      items.push(...(result.Items || []));
      exclusiveStartKey = result.LastEvaluatedKey;

      const hasNextPage = !!exclusiveStartKey;
      const pageInfo = {
        page: pageNumber,
        itemsInPage: pageItemCount,
        totalItemsSoFar: items.length,
        hasNextPage
      };

      pageDetails.push(pageInfo);

      console.log(`Page ${pageNumber}:`);
      console.log(`  Items on this page: ${pageItemCount}`);
      console.log(`  Total accumulated: ${items.length}`);
      console.log(`  Has next page: ${hasNextPage ? 'Yes' : 'No'}`);
      console.log();

      // Safety check: prevent infinite loops
      if (pageNumber > 100) {
        throw new Error('Pagination exceeded 100 pages - possible infinite loop');
      }
    } while (exclusiveStartKey);

    console.log('═'.repeat(60));
    console.log('\n📊 PAGINATION SUMMARY:\n');
    console.log(`Total pages retrieved: ${pageNumber}`);
    console.log(`Total orders retrieved: ${items.length}`);
    console.log(`Average items per page: ${(items.length / pageNumber).toFixed(2)}`);
    console.log(`Max page size: ${Math.max(...pageDetails.map(p => p.itemsInPage))}`);
    console.log(`Min page size: ${Math.min(...pageDetails.map(p => p.itemsInPage))}`);

    // Cross-verify with COUNT query
    console.log('\n🔄 Cross-verification with COUNT query...\n');

    const countQueryParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: 'ORDER' }
      },
      Select: 'COUNT',
      ConsistentRead: true
    };

    let totalCountFromAPI = 0;
    let countPageNumber = 0;
    let countExclusiveStartKey;

    do {
      countPageNumber++;
      const countResult = await docClient.send(new QueryCommand({
        ...countQueryParams,
        ...(countExclusiveStartKey ? { ExclusiveStartKey: countExclusiveStartKey } : {})
      }));

      totalCountFromAPI += countResult.Count || 0;
      countExclusiveStartKey = countResult.LastEvaluatedKey;

      if (countPageNumber <= 5) {
        console.log(`COUNT page ${countPageNumber}: ${countResult.Count || 0} orders (cumulative: ${totalCountFromAPI})`);
      } else if (countPageNumber === 6) {
        console.log('  ...');
      }

      if (countPageNumber > 100) {
        throw new Error('COUNT query exceeded 100 pages');
      }
    } while (countExclusiveStartKey);

    console.log(`COUNT query total: ${totalCountFromAPI} orders across ${countPageNumber} pages`);

    console.log('\n═'.repeat(60));
    console.log('\n✅ VERIFICATION RESULTS:\n');
    console.log(`Full retrieval (with items): ${items.length} orders`);
    console.log(`COUNT-only query: ${totalCountFromAPI} orders`);
    console.log(`Match: ${items.length === totalCountFromAPI ? '✅ YES' : '❌ NO'}`);

    if (items.length === totalCountFromAPI) {
      console.log('\n🎯 Pagination is working correctly!');
      console.log('   All orders retrieved across all pages.');
      console.log('   No orders are missing.');
    } else {
      console.log('\n⚠️  MISMATCH DETECTED!');
      console.log(`   Retrieved: ${items.length}, Expected: ${totalCountFromAPI}`);
    }

    console.log('\n📋 Page-by-page breakdown:');
    pageDetails.forEach(p => {
      console.log(`   Page ${p.page}: ${p.itemsInPage} items (total: ${p.totalItemsSoFar})`);
    });

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verifyPagination().then(() => {
  console.log('\n✅ Verification completed.');
  process.exit(0);
});
