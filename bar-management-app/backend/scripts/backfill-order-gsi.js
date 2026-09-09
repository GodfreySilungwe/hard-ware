const dynamodb = require('../lib/dynamodb');

/**
 * Backfill script: Add GSI1PK and GSI1SK to existing order records
 * - Uses UPDATE operations (safe, preserves all existing data)
 * - Batches to prevent DynamoDB throttling
 * - Logs progress for verification
 * - Reversible: Can re-run without side effects (idempotent)
 * 
 * Run: node scripts/backfill-order-gsi.js
 */

async function backfillOrdersWithGSI() {
  console.log('🔄 Starting backfill: Adding GSI keys to orders...\n');

  try {
    // Step 1: Get all orders
    const allOrders = await dynamodb.listEntities('order');
    console.log(`📊 Found ${allOrders.length} total orders\n`);

    if (allOrders.length === 0) {
      console.log('✅ No orders to backfill. Done.');
      return;
    }

    // Step 2: Filter orders that need GSI keys
    const ordersNeedingGSI = allOrders.filter(
      (order) => !order.GSI1PK || !order.GSI1SK
    );

    console.log(`📝 Orders needing GSI keys: ${ordersNeedingGSI.length}`);
    console.log(`✅ Orders already have GSI keys: ${allOrders.length - ordersNeedingGSI.length}\n`);

    if (ordersNeedingGSI.length === 0) {
      console.log('✅ All orders already have GSI keys. Done.');
      return;
    }

    // Step 3: Backfill in batches
    const BATCH_SIZE = 50; // Safe batch size to avoid throttling
    let processed = 0;
    let failed = 0;
    const failedOrders = [];

    for (let i = 0; i < ordersNeedingGSI.length; i += BATCH_SIZE) {
      const batch = ordersNeedingGSI.slice(i, i + BATCH_SIZE);
      console.log(
        `⏳ Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          ordersNeedingGSI.length / BATCH_SIZE
        )} (${batch.length} orders)...`
      );

      // Process batch sequentially with delays to avoid throttling
      for (const order of batch) {
        try {
          // Update order with GSI keys
          // NOTE: updateEntity is safe - it fetches existing record, merges updates, saves all data
          await dynamodb.updateEntity('order', order._id || order.id, {
            GSI1PK: order.tenantId,
            GSI1SK: order.createdAt
          });
          processed++;
        } catch (error) {
          console.error(`❌ Failed to backfill order ${order._id}: ${error.message}`);
          failed++;
          failedOrders.push({
            orderId: order._id,
            error: error.message
          });
        }

        // Add small delay between updates to prevent throttling
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      console.log(`   ✅ Batch complete. Total processed: ${processed}\n`);
    }

    // Step 4: Verification
    console.log('\n📊 Backfill Summary:');
    console.log(`   ✅ Successfully updated: ${processed}`);
    console.log(`   ❌ Failed: ${failed}`);

    if (failedOrders.length > 0) {
      console.log('\n⚠️  Failed Orders:');
      failedOrders.forEach(({ orderId, error }) => {
        console.log(`   - ${orderId}: ${error}`);
      });
    }

    if (failed === 0) {
      console.log('\n🎉 Backfill completed successfully! All orders now have GSI keys.');

      // Verify
      const updatedOrders = await dynamodb.listEntities('order');
      const withGSI = updatedOrders.filter((o) => o.GSI1PK && o.GSI1SK).length;
      console.log(`   Verification: ${withGSI}/${updatedOrders.length} orders have GSI keys`);
    } else {
      console.log(
        '\n⚠️  Backfill completed with errors. Re-run this script to retry failed records.'
      );
    }
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  }
}

// Run backfill
backfillOrdersWithGSI().then(() => {
  console.log('\n✅ Script completed.');
  process.exit(0);
});
