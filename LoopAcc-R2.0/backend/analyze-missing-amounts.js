import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/";
const DB_NAME = "loopacc_db";
const client = new MongoClient(MONGODB_URI);

async function fixPendingBills() {
  try {
    console.log("🔧 FIXING 4 PENDING BILLS - ADDING MISSING AMOUNT FIELD");
    console.log("=".repeat(70));

    await client.connect();
    const db = client.db(DB_NAME);

    const COMPANY_ID = "8fefda79-d18a-4d56-92aa-4d604419d29f";

    // Find all bills with undefined amount
    const billsWithoutAmount = await db
      .collection("bill_allocation")
      .find({
        company_id: COMPANY_ID,
        $or: [
          { amount: { $exists: false } },
          { amount: undefined },
          { amount: null },
        ],
      })
      .toArray();

    console.log(
      `\n✅ Found ${billsWithoutAmount.length} bills missing amount field:`
    );

    for (const bill of billsWithoutAmount) {
      console.log(`\n   Bill: ${bill.bill_reference || bill.id}`);
      console.log(`   - Current amount: ${bill.amount || "UNDEFINED"}`);
      console.log(`   - isDeemedPositive: ${bill.isDeemedPositive}`);
      console.log(`   - source: ${bill.source}`);
    }

    if (billsWithoutAmount.length === 0) {
      console.log("   ✅ All bills have amount field");
      await client.close();
      return;
    }

    // Check if there are any ledger entries or other data that might help us determine the amount
    console.log(`\n${"=".repeat(70)}`);
    console.log("\n🔍 SEARCHING FOR AMOUNT VALUES IN RELATED DATA:");
    console.log("-".repeat(70));

    for (const bill of billsWithoutAmount) {
      console.log(`\n   Bill: ${bill.bill_reference || bill.id}`);

      // Check ledger entries
      const ledgerEntries = await db
        .collection("ledger_entries")
        .find({
          company_id: COMPANY_ID,
          billallocation: { $exists: true, $ne: null },
        })
        .toArray();

      let foundAmount = null;
      for (const entry of ledgerEntries) {
        if (entry.billallocation && Array.isArray(entry.billallocation)) {
          const foundBill = entry.billallocation.find(
            (b) => b.bill_reference === bill.bill_reference
          );
          if (foundBill) {
            console.log(
              `   - Found in ledger_entries: amount=${foundBill.amount}`
            );
            foundAmount = foundBill.amount;
            break;
          }
        }
      }

      if (!foundAmount) {
        console.log(`   - ℹ️  No amount found in related data`);
        console.log(`   - Need manual input or check bill details`);
      }
    }

    // Show the raw documents for review
    console.log(`\n${"=".repeat(70)}`);
    console.log("\n📋 RAW BILL DATA (for reference):");
    console.log("-".repeat(70));

    for (const bill of billsWithoutAmount) {
      console.log(`\n   Bill: ${bill.bill_reference || bill.id}`);
      console.log(JSON.stringify(bill, null, 2));
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log("\n⚠️  TO FIX THESE BILLS:");
    console.log("-".repeat(70));
    console.log(
      "The bills are missing the 'amount' field, which is required for Outstanding reports."
    );
    console.log(
      "This could be because they were created without specifying an amount."
    );
    console.log("\nOptions to fix:");
    console.log("1. Update via API with proper amount values");
    console.log("2. Direct database update with correct amounts");
    console.log("3. Delete and recreate bills with proper data");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

fixPendingBills();
