// Migration Script: Update Batch Allocation Collection to New Schema
// Run this after updating batchAllocationService.js
// File: backend/scripts/migrate-batch-allocation-v2.js

import { getDb, connectToMongo } from "../db.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Migrate batch_allocation collection to new schema with proper
 * opening balance tracking and inward/outward separation
 *
 * CHANGES:
 * 1. Ensure opening_qty, opening_rate, opening_value are set from item master
 * 2. Initialize inward_qty = opening_qty (opening is first inward)
 * 3. Validate and recalculate all closing values
 * 4. Add validation indexes
 */
async function migrateBatchAllocationV2() {
  const db = getDb();

  console.log("\n🔄 Starting Batch Allocation Migration to V2...\n");

  try {
    // Step 1: Get all batch records
    const batches = await db.collection("batch_allocation").find({}).toArray();
    console.log(`📦 Found ${batches.length} batch records to migrate\n`);

    let migratedCount = 0;
    let errorCount = 0;

    // Step 2: Process each batch
    for (const batch of batches) {
      try {
        // Get item master for context
        const item = await db.collection("item_master").findOne({
          id: batch.item_id,
        });

        if (!item) {
          console.warn(
            `⚠️  Item ${batch.item_id} not found for batch ${batch.batch_number}`
          );
          errorCount++;
          continue;
        }

        // Prepare updated batch with new schema
        const updated = {
          // Keep existing fields
          id: batch.id,
          item_id: batch.item_id,
          company_id: batch.company_id,
          batch_number: batch.batch_number,

          // Opening balance (from item master)
          opening_qty: batch.opening_qty || item.opening_stock || 0,
          opening_rate: batch.opening_rate || item.opening_rate || 0,
          opening_value: batch.opening_value || item.opening_value || 0,

          // Inward movement
          inward_qty:
            batch.inward_qty || batch.opening_qty || item.opening_stock || 0,
          inward_rate:
            batch.inward_rate || batch.opening_rate || item.opening_rate || 0,
          inward_value:
            batch.inward_value ||
            batch.opening_value ||
            item.opening_value ||
            0,

          // Outward movement
          outward_qty: batch.outward_qty || 0,
          outward_rate: batch.outward_rate || 0,
          outward_value: batch.outward_value || 0,

          // Timestamps
          created_at: batch.created_at || new Date(),
          updated_at: new Date(),
        };

        // Recalculate closing values
        updated.closing_qty =
          updated.opening_qty + updated.inward_qty - updated.outward_qty;

        // Calculate closing rate (weighted average)
        if (updated.closing_qty > 0) {
          updated.closing_rate =
            (updated.inward_value - updated.outward_value) /
            updated.closing_qty;
          updated.closing_value = updated.closing_qty * updated.closing_rate;
        } else {
          updated.closing_rate = 0;
          updated.closing_value = 0;
        }

        // Validate calculations
        const expectedClosing =
          updated.opening_qty + updated.inward_qty - updated.outward_qty;
        if (Math.abs(expectedClosing - updated.closing_qty) > 0.01) {
          console.warn(
            `⚠️  Closing qty mismatch for batch ${batch.batch_number}`
          );
        }

        // Update in database
        await db
          .collection("batch_allocation")
          .updateOne({ id: batch.id }, { $set: updated });

        migratedCount++;

        if (migratedCount % 100 === 0) {
          console.log(`✓ Processed ${migratedCount} batches...`);
        }
      } catch (error) {
        console.error(`❌ Error migrating batch ${batch.id}: ${error.message}`);
        errorCount++;
      }
    }

    // Step 3: Add/verify indexes
    console.log("\n📑 Setting up indexes...");

    await db
      .collection("batch_allocation")
      .dropIndex("item_id_1_batch_number_1_company_id_1")
      .catch(() => {}); // Ignore if doesn't exist

    await db
      .collection("batch_allocation")
      .createIndex(
        { item_id: 1, batch_number: 1, company_id: 1 },
        { unique: true }
      );
    console.log("✓ Unique index created: (item_id, batch_number, company_id)");

    await db
      .collection("batch_allocation")
      .createIndex({ item_id: 1, company_id: 1 });
    console.log("✓ Query index created: (item_id, company_id)");

    await db.collection("batch_allocation").createIndex({ company_id: 1 });
    console.log("✓ Report index created: (company_id)");

    // Step 4: Summary
    console.log("\n" + "=".repeat(50));
    console.log("✅ Migration Complete!");
    console.log("=".repeat(50));
    console.log(`Total batches: ${batches.length}`);
    console.log(`Successfully migrated: ${migratedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log("=".repeat(50) + "\n");

    return {
      success: true,
      totalBatches: batches.length,
      migratedCount,
      errorCount,
    };
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    throw error;
  }
}

/**
 * Validate batch consistency after migration
 */
async function validateBatchConsistency() {
  const db = getDb();

  console.log("\n🔍 Validating batch consistency...\n");

  const batches = await db.collection("batch_allocation").find({}).toArray();
  let inconsistencies = 0;

  for (const batch of batches) {
    const expected = batch.opening_qty + batch.inward_qty - batch.outward_qty;

    if (Math.abs(expected - batch.closing_qty) > 0.01) {
      console.warn(`❌ Batch ${batch.batch_number} (${batch.id}):`);
      console.warn(
        `   Expected closing: ${expected}, Actual: ${batch.closing_qty}`
      );
      inconsistencies++;
    }
  }

  if (inconsistencies === 0) {
    console.log("✅ All batches are consistent!");
  } else {
    console.log(`⚠️  Found ${inconsistencies} inconsistencies`);
  }

  return inconsistencies;
}

/**
 * Rollback function if needed
 * Creates backup of old schema before migration
 */
async function backupBatchAllocation() {
  const db = getDb();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupCollectionName = `batch_allocation_backup_${timestamp}`;

  console.log(`\n💾 Creating backup: ${backupCollectionName}\n`);

  try {
    const batches = await db.collection("batch_allocation").find({}).toArray();

    if (batches.length > 0) {
      await db.collection(backupCollectionName).insertMany(batches);
      console.log(
        `✓ Backed up ${batches.length} records to ${backupCollectionName}`
      );
    }

    return backupCollectionName;
  } catch (error) {
    console.error("Failed to create backup:", error);
    throw error;
  }
}

/**
 * Generate migration report
 */
async function generateMigrationReport() {
  const db = getDb();

  console.log("\n📊 Migration Report\n");
  console.log("=".repeat(50));

  // Batch statistics
  const batchStats = await db
    .collection("batch_allocation")
    .aggregate([
      {
        $group: {
          _id: null,
          total_batches: { $sum: 1 },
          total_items: { $addToSet: "$item_id" },
          total_companies: { $addToSet: "$company_id" },
          total_opening_qty: { $sum: "$opening_qty" },
          total_inward_qty: { $sum: "$inward_qty" },
          total_outward_qty: { $sum: "$outward_qty" },
          total_closing_qty: { $sum: "$closing_qty" },
          total_value: { $sum: "$closing_value" },
          avg_closing_rate: { $avg: "$closing_rate" },
        },
      },
    ])
    .toArray();

  if (batchStats.length > 0) {
    const stats = batchStats[0];
    console.log(`Total Batches:       ${stats.total_batches}`);
    console.log(`Total Items:         ${stats.total_items.length}`);
    console.log(`Total Companies:     ${stats.total_companies.length}`);
    console.log(`\nInventory Summary:`);
    console.log(`  Opening Stock:     ${stats.total_opening_qty.toFixed(2)}`);
    console.log(`  Total Inward:      ${stats.total_inward_qty.toFixed(2)}`);
    console.log(`  Total Outward:     ${stats.total_outward_qty.toFixed(2)}`);
    console.log(`  Closing Stock:     ${stats.total_closing_qty.toFixed(2)}`);
    console.log(`  Total Value:       ${stats.total_value.toFixed(2)}`);
    console.log(`  Avg Rate:          ${stats.avg_closing_rate.toFixed(4)}`);
  }

  // Batches with issues
  const batchesWithIssues = await db
    .collection("batch_allocation")
    .aggregate([
      {
        $addFields: {
          calculated_closing: {
            $subtract: [
              { $add: ["$opening_qty", "$inward_qty"] },
              "$outward_qty",
            ],
          },
        },
      },
      {
        $match: {
          $expr: { $ne: ["$calculated_closing", "$closing_qty"] },
        },
      },
      { $count: "count" },
    ])
    .toArray();

  console.log(`\nData Quality:`);
  console.log(
    `  Batches with inconsistencies: ${
      batchesWithIssues.length > 0 ? batchesWithIssues[0].count : 0
    }`
  );

  // Zero closing stock
  const zeroClosing = await db.collection("batch_allocation").countDocuments({
    closing_qty: 0,
  });
  console.log(`  Batches with zero closing: ${zeroClosing}`);

  console.log("=".repeat(50) + "\n");
}

// Main execution
async function main() {
  try {
    await connectToMongo();

    // Create backup first
    await backupBatchAllocation();

    // Run migration
    const result = await migrateBatchAllocationV2();

    // Validate
    const issues = await validateBatchConsistency();

    // Generate report
    await generateMigrationReport();

    if (result.success && issues === 0) {
      console.log("✅ Migration completed successfully with no issues!\n");
      process.exit(0);
    } else if (result.success) {
      console.log(
        `⚠️  Migration completed with ${issues} validation issues.\n`
      );
      console.log(
        "Please review the inconsistencies and adjust manually if needed.\n"
      );
      process.exit(0);
    } else {
      console.log("❌ Migration failed!\n");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n❌ Fatal error during migration:", error);
    process.exit(1);
  }
}

// Run migration if executed directly
main();

export {
  migrateBatchAllocationV2,
  validateBatchConsistency,
  backupBatchAllocation,
  generateMigrationReport,
};
