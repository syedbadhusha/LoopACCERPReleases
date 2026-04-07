import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/";
const client = new MongoClient(MONGODB_URI);

async function migrate() {
  try {
    await client.connect();
    const db = client.db("loopacc_db");

    console.log("\n=== Adding batch fields to items ===\n");

    // Find all items without batch fields
    const itemsToUpdate = await db
      .collection("item_master")
      .find({
        $or: [
          { enable_batches: { $exists: false } },
          { batch_details: { $exists: false } },
        ],
      })
      .toArray();

    console.log(`Found ${itemsToUpdate.length} items to update\n`);

    if (itemsToUpdate.length === 0) {
      console.log("All items already have batch fields!");
      return;
    }

    // Update all items to include batch fields
    const result = await db.collection("item_master").updateMany(
      {
        $or: [
          { enable_batches: { $exists: false } },
          { batch_details: { $exists: false } },
        ],
      },
      {
        $set: {
          enable_batches: false,
          batch_details: [],
        },
      }
    );

    console.log(`✓ Updated ${result.modifiedCount} item documents`);
    console.log(`\nBatch fields added successfully!`);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

migrate();
