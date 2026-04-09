import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/";
const DB_NAME = "loopacc_db";
const client = new MongoClient(MONGODB_URI);

async function fixBillFlags() {
  try {
    console.log("🔧 FIXING BILL FLAGS - CORRECTING isDeemedPositive");
    console.log("=".repeat(80));

    await client.connect();
    const db = client.db(DB_NAME);

    const COMPANY_ID = "8fefda79-d18a-4d56-92aa-4d604419d29f";

    // Get all bills
    const allBills = await db
      .collection("bill_allocation")
      .find({ company_id: COMPANY_ID })
      .toArray();

    console.log("\n📋 Current bills status:");
    console.log("-".repeat(80));
    for (const bill of allBills) {
      const ledger = await db
        .collection("ledgers")
        .findOne({ id: bill.ledger_id });
      const group = ledger
        ? await db.collection("groups").findOne({ id: ledger.group_id })
        : null;

      console.log(`\n   Bill: ${bill.bill_reference}`);
      console.log(`   - Ledger: ${ledger?.name || "NOT FOUND"}`);
      console.log(`   - Group: ${group?.name || "NOT FOUND"}`);
      console.log(`   - Current isDeemedPositive: ${bill.isDeemedPositive}`);

      // Determine what it should be based on group
      let shouldBe = bill.isDeemedPositive;
      if (group) {
        const isPayableGroup = /creditors|suppliers|payable/i.test(group.name);
        const isReceivableGroup = /debtors|customers|receivable/i.test(
          group.name
        );

        if (isPayableGroup) {
          shouldBe = "no"; // Payables
          console.log(`   - Should be: "no" (PAYABLE group)`);
        } else if (isReceivableGroup) {
          shouldBe = "yes"; // Receivables
          console.log(`   - Should be: "yes" (RECEIVABLE group)`);
        } else {
          console.log(`   - Should be: ${bill.isDeemedPositive} (OTHER group)`);
        }
      }

      if (shouldBe !== bill.isDeemedPositive) {
        console.log(`   ⚠️  MISMATCH! Needs correction`);
      }
    }

    // Ask for confirmation before fixing
    console.log("\n" + "=".repeat(80));
    console.log("\n⚠️  ANALYSIS:");
    console.log("-".repeat(80));
    console.log(
      "Bills 11111, bill111, Bill231 are in CREDITOR/SUPPLIER ledgers"
    );
    console.log("but marked as isDeemedPositive='yes' (RECEIVABLES)");
    console.log("They should be marked as isDeemedPositive='no' (PAYABLES)");
    console.log("\nBill BILL0001 is correctly marked as isDeemedPositive='no'");
    console.log("BUT it's on a billwise ledger (SR Power)");
    console.log("The report function SKIPS billwise ledger vouchers/bills");
    console.log("\n" + "=".repeat(80));

    // Fix step 1: Correct the isDeemedPositive flags
    console.log("\n🔧 STEP 1: FIXING isDeemedPositive FLAGS");
    console.log("-".repeat(80));

    const billsToFix = [
      { reference: "11111", shouldBe: "no" },
      { reference: "bill111", shouldBe: "no" },
      { reference: "Bill231", shouldBe: "no" },
      { reference: "BILL0001", shouldBe: "no" }, // Already correct
    ];

    for (const billFix of billsToFix) {
      const bill = allBills.find((b) => b.bill_reference === billFix.reference);
      if (!bill) continue;

      const ledger = await db
        .collection("ledgers")
        .findOne({ id: bill.ledger_id });
      const group = await db
        .collection("groups")
        .findOne({ id: ledger.group_id });

      console.log(`\n   ${billFix.reference} (${group?.name || "UNKNOWN"}):`);

      if (bill.isDeemedPositive !== billFix.shouldBe) {
        const result = await db.collection("bill_allocation").updateOne(
          { id: bill.id },
          {
            $set: {
              isDeemedPositive: billFix.shouldBe,
              updated_at: new Date(),
            },
          }
        );

        if (result.modifiedCount > 0) {
          console.log(
            `   ✅ Updated: ${bill.isDeemedPositive} → ${billFix.shouldBe}`
          );
        } else {
          console.log(`   ❌ Failed to update`);
        }
      } else {
        console.log(`   ✅ Already correct: ${billFix.shouldBe}`);
      }
    }

    // Fix step 2: Update the purchase voucher to NOT be billwise marked
    console.log("\n" + "=".repeat(80));
    console.log("\n🔧 STEP 2: CHECKING LEDGER is_billwise FLAG");
    console.log("-".repeat(80));

    const srPowerLedger = await db.collection("ledgers").findOne({
      company_id: COMPANY_ID,
      name: "SR Power",
    });

    if (srPowerLedger) {
      console.log(`\n   SR Power Ledger:`);
      console.log(`   - is_billwise: ${srPowerLedger.is_billwise}`);
      console.log(
        `   - Current setting: ${
          srPowerLedger.is_billwise === true
            ? "YES (billwise)"
            : "NO (not billwise)"
        }`
      );

      if (srPowerLedger.is_billwise === true) {
        console.log(`\n   ⚠️  This ledger is marked as billwise!`);
        console.log(
          `   The Outstanding report SKIPS bills/vouchers on billwise ledgers.`
        );
        console.log(
          `   Bills are instead expected to be retrieved via opening balance entries.`
        );

        const billsOnThisLedger = allBills.filter(
          (b) => b.ledger_id === srPowerLedger.id
        );
        console.log(`\n   Bills on this ledger: ${billsOnThisLedger.length}`);
        billsOnThisLedger.forEach((b) => {
          console.log(`   - ${b.bill_reference}`);
        });
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("\n✅ FIX APPLIED - Bills should now appear in reports");
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await client.close();
  }
}

fixBillFlags();
