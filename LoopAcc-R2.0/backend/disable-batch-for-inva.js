import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/";
const client = new MongoClient(MONGODB_URI);

async function disableBatch() {
  try {
    await client.connect();
    const db = client.db("loopacc_db");

    console.log("\n=== Disabling Batch for Inva Master 150 AH ===\n");

    // Find the item
    const item = await db
      .collection("item_master")
      .findOne({ name: "Inva Master 150 AH" });

    if (!item) {
      console.log("Item not found!");
      return;
    }

    console.log(`Found item: ${item.name}`);
    console.log(`Current enable_batches: ${item.enable_batches}`);

    // Update enable_batches to false
    const result = await db.collection("item_master").updateOne(
      { name: "Inva Master 150 AH" },
      {
        $set: {
          enable_batches: false,
          updated_at: new Date(),
        },
      }
    );

    if (result.modifiedCount > 0) {
      console.log("✓ Successfully disabled batches for this item");
      console.log("\nVerifying...");

      const updatedItem = await db
        .collection("item_master")
        .findOne({ name: "Inva Master 150 AH" });

      console.log(`New enable_batches: ${updatedItem.enable_batches}`);
    } else {
      console.log("No changes made");
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

disableBatch();
