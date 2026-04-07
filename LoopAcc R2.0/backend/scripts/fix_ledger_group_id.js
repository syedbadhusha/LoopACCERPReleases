import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/";
const client = new MongoClient(MONGODB_URI);

async function migrate() {
  try {
    await client.connect();
    const db = client.db("loopacc_db");

    console.log("\n=== Migrating ledger_group_id to group_id ===\n");

    // Find all ledgers with ledger_group_id field
    const ledgersToUpdate = await db
      .collection("ledgers")
      .find({ ledger_group_id: { $exists: true } })
      .toArray();

    console.log(
      `Found ${ledgersToUpdate.length} ledgers with ledger_group_id\n`
    );

    if (ledgersToUpdate.length === 0) {
      console.log("No migration needed!");
      return;
    }

    // Update all ledgers: rename ledger_group_id to group_id
    const result = await db
      .collection("ledgers")
      .updateMany({ ledger_group_id: { $exists: true } }, [
        {
          $set: {
            group_id: "$ledger_group_id",
          },
        },
        {
          $unset: ["ledger_group_id"],
        },
      ]);

    console.log(`✓ Updated ${result.modifiedCount} ledger documents`);

    // Verify the update
    console.log("\n=== Verification ===\n");
    const updated = await db
      .collection("ledgers")
      .find({ group_id: { $exists: true } })
      .toArray();

    console.log(`Now have ${updated.length} ledgers with group_id field`);

    // Show the first updated ledger
    if (updated.length > 0) {
      console.log("\nFirst updated ledger:");
      console.log(JSON.stringify(updated[0], null, 2));
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

migrate();
