import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/";
const DB_NAME = "loopacc_db";
const client = new MongoClient(MONGODB_URI);

async function fixBillAmounts() {
  try {
    console.log(
      "🔧 FIXING 4 PENDING BILLS - SETTING AMOUNT FROM ALLOCATED_AMOUNT"
    );
    console.log("=".repeat(70));

    await client.connect();
    const db = client.db(DB_NAME);

    const COMPANY_ID = "8fefda79-d18a-4d56-92aa-4d604419d29f";

    // Find all bills with missing amount
    const billsToFix = await db
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

    console.log(`\n📋 Bills to fix: ${billsToFix.length}`);

    let updated = 0;
    for (const bill of billsToFix) {
      const amount = bill.allocated_amount || 0;

      console.log(`\n   Updating: ${bill.bill_reference} (ID: ${bill.id})`);
      console.log(`   Setting amount: ${amount}`);

      const result = await db.collection("bill_allocation").updateOne(
        { id: bill.id },
        {
          $set: {
            amount: amount,
            updated_at: new Date(),
          },
        }
      );

      if (result.modifiedCount > 0) {
        console.log(`   ✅ Updated`);
        updated++;
      } else {
        console.log(`   ❌ Failed to update`);
      }
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`\n✅ Fixed ${updated} bills`);

    // Verify the fix
    console.log(`\n${"=".repeat(70)}`);
    console.log(
      "\n🔍 VERIFICATION - Checking if bills now appear in Outstanding reports:"
    );
    console.log("-".repeat(70));

    // Get creditor groups and ledgers
    const creditorGroups = await db
      .collection("groups")
      .find({
        company_id: COMPANY_ID,
        name: { $regex: "creditors|suppliers|payable", $options: "i" },
      })
      .toArray();

    const groupIds = creditorGroups.map((g) => g.id);
    const creditorLedgers = await db
      .collection("ledgers")
      .find({
        company_id: COMPANY_ID,
        group_id: { $in: groupIds },
      })
      .toArray();

    const creditorLedgerIds = creditorLedgers.map((l) => l.id);

    // Check Outstanding Payables
    console.log(`\n📊 Outstanding PAYABLES (isDeemedPositive="no"):`);
    const payableBills = await db
      .collection("bill_allocation")
      .find({
        company_id: COMPANY_ID,
        isDeemedPositive: "no",
      })
      .toArray();

    console.log(`   Total payable bills: ${payableBills.length}`);
    for (const bill of payableBills) {
      const hasLedger = creditorLedgerIds.includes(bill.ledger_id);
      const status = hasLedger ? "✅" : "❌";
      console.log(
        `   ${status} ${bill.bill_reference} - Amount: ${
          bill.amount || "0"
        }, Allocated: ${bill.allocated_amount || "0"}`
      );
    }

    // Check Outstanding Receivables
    console.log(`\n📊 Outstanding RECEIVABLES (isDeemedPositive="yes"):`);
    const receivableBills = await db
      .collection("bill_allocation")
      .find({
        company_id: COMPANY_ID,
        isDeemedPositive: "yes",
      })
      .toArray();

    console.log(`   Total receivable bills: ${receivableBills.length}`);
    for (const bill of receivableBills) {
      console.log(
        `   - ${bill.bill_reference} - Amount: ${
          bill.amount || "0"
        }, Allocated: ${bill.allocated_amount || "0"}`
      );
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(
      "\n✅ FIX COMPLETE - Bills should now appear in Outstanding reports"
    );
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

fixBillAmounts();
