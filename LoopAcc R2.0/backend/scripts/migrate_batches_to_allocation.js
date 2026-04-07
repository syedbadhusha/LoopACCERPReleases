import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || "tally_clone";

async function migrateBatchAllocation() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);

    console.log("\n=== Migrating Items to Batch Allocation Collection ===\n");

    const items = await db.collection("item_master").find({}).toArray();

    if (items.length === 0) {
      console.log("No items found.");
      return;
    }

    let migratedCount = 0;

    for (const item of items) {
      // Check if item has batch_details array
      if (item.batch_details && Array.isArray(item.batch_details)) {
        const batchDetails = item.batch_details.map((batch) => ({
          id: batch.id || `${item.id}-${Math.random()}`,
          item_id: item.id,
          company_id: item.company_id,
          batch_number: batch.batch_number || "primary",
          opening_qty: batch.opening_qty || 0,
          opening_rate: batch.opening_rate || 0,
          opening_value: batch.opening_value || 0,
          created_at: new Date(),
          updated_at: new Date(),
        }));

        // Insert into batch_allocation collection
        if (batchDetails.length > 0) {
          try {
            await db
              .collection("batch_allocation")
              .insertMany(batchDetails, { ordered: false });
            console.log(
              `✓ Item "${item.name}": Moved ${batchDetails.length} batches to batch_allocation`
            );
            migratedCount++;
          } catch (err) {
            // Ignore duplicate key errors - batches may already exist
            if (err.code !== 11000) {
              console.error(
                `✗ Item "${item.name}": Failed to insert batches`,
                err.message
              );
            } else {
              console.log(
                `✓ Item "${item.name}": Batch allocations already migrated (skipped)`
              );
            }
          }
        }
      }
    }

    console.log(
      `\n✓ Migration complete! Processed ${migratedCount} items with batch details`
    );
  } catch (error) {
    console.error("Migration error:", error);
  } finally {
    await client.close();
  }
}

migrateBatchAllocation();
