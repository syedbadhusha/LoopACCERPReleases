import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

async function renameField() {
  const client = new MongoClient(
    process.env.MONGODB_URI || "mongodb://localhost:27017/tally_clone"
  );

  try {
    await client.connect();
    const db = client.db("tally_clone");

    // Rename opening_qty to opening_stock for all items
    const result = await db.collection("item_master").updateMany({}, [
      {
        $set: {
          opening_stock: { $ifNull: ["$opening_stock", "$opening_qty"] },
        },
      },
    ]);

    console.log(`Updated ${result.modifiedCount} items`);

    // Now remove the opening_qty field
    const result2 = await db
      .collection("item_master")
      .updateMany({}, { $unset: { opening_qty: "" } });

    console.log(
      `Removed opening_qty field from ${result2.modifiedCount} items`
    );
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

renameField();
