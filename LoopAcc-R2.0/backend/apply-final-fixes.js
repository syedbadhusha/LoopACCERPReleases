import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/";
const DB_NAME = "loopacc_db";
const client = new MongoClient(MONGODB_URI);

async function applyFinalFixes() {
  try {
    console.log("🔧 APPLYING FINAL FIXES TO ALL 4 BILLS");
    console.log("=".repeat(80));

    await client.connect();
    const db = client.db(DB_NAME);

    const COMPANY_ID = "8fefda79-d18a-4d56-92aa-4d604419d29f";

    // Fix 1: Bill 11111 - Change isDeemedPositive from "no" to "yes"
    console.log("\n1️⃣  Fixing Bill: 11111");
    console.log("   - Current: isDeemedPositive='no' (WRONG)");
    console.log("   - Ledger: Syed Ali (Customers - RECEIVABLE)");
    console.log("   - Fix: Change to isDeemedPositive='yes'");

    const result1 = await db.collection("bill_allocation").updateOne(
      { bill_reference: "11111", company_id: COMPANY_ID },
      {
        $set: {
          isDeemedPositive: "yes",
          updated_at: new Date(),
        },
      }
    );

    console.log(`   ${result1.modifiedCount > 0 ? "✅ Updated" : "❌ Failed"}`);

    // Fix 2: Bill BILL0001 - Set source to "ledger-opening"
    console.log("\n2️⃣  Fixing Bill: BILL0001");
    console.log("   - Current: source='UNDEFINED' (WRONG)");
    console.log("   - Ledger: SR Power (Suppliers - PAYABLE)");
    console.log("   - Fix: Set source='ledger-opening'");

    const result2 = await db.collection("bill_allocation").updateOne(
      { bill_reference: "BILL0001", company_id: COMPANY_ID },
      {
        $set: {
          source: "ledger-opening",
          updated_at: new Date(),
        },
      }
    );

    console.log(`   ${result2.modifiedCount > 0 ? "✅ Updated" : "❌ Failed"}`);

    // Verify the fixes
    console.log(`\n${"=".repeat(80)}`);
    console.log("\n✅ VERIFICATION - Running Outstanding Reports");
    console.log("-".repeat(80));

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

    // Get debtor groups and ledgers for receivables
    const debtorGroups = await db
      .collection("groups")
      .find({
        company_id: COMPANY_ID,
        name: { $regex: "debtors|customers|receivable", $options: "i" },
      })
      .toArray();

    const debtorGroupIds = debtorGroups.map((g) => g.id);
    const debtorLedgers = await db
      .collection("ledgers")
      .find({
        company_id: COMPANY_ID,
        group_id: { $in: debtorGroupIds },
      })
      .toArray();

    const debtorLedgerIds = debtorLedgers.map((l) => l.id);

    // Outstanding Payables
    console.log(`\n📊 Outstanding PAYABLES:`);
    const payableBills = await db
      .collection("bill_allocation")
      .find({
        company_id: COMPANY_ID,
        isDeemedPositive: "no",
      })
      .toArray();

    const payableBillsInReport = payableBills.filter(
      (b) =>
        creditorLedgerIds.includes(b.ledger_id) &&
        (b.source === "ledger-opening" || b.source === "standalone")
    );

    console.log(
      `   Total payable bills matching filters: ${payableBillsInReport.length}`
    );
    payableBillsInReport.forEach((b) => {
      console.log(
        `   ✅ ${b.bill_reference} - Amount: ${b.amount}, Ledger: ${
          creditorLedgers.find((l) => l.id === b.ledger_id)?.name
        }`
      );
    });

    // Outstanding Receivables
    console.log(`\n📊 Outstanding RECEIVABLES:`);
    const receivableBills = await db
      .collection("bill_allocation")
      .find({
        company_id: COMPANY_ID,
        isDeemedPositive: "yes",
      })
      .toArray();

    const receivableBillsInReport = receivableBills.filter(
      (b) =>
        debtorLedgerIds.includes(b.ledger_id) &&
        (b.source === "ledger-opening" || b.source === "standalone")
    );

    console.log(
      `   Total receivable bills matching filters: ${receivableBillsInReport.length}`
    );
    receivableBillsInReport.forEach((b) => {
      console.log(
        `   ✅ ${b.bill_reference} - Amount: ${b.amount}, Ledger: ${
          debtorLedgers.find((l) => l.id === b.ledger_id)?.name
        }`
      );
    });

    console.log(`\n${"=".repeat(80)}`);
    console.log("\n📈 FINAL RESULTS:");
    console.log("-".repeat(80));
    console.log(
      `Outstanding Payables: ${payableBillsInReport.length} bills ➜ ${
        payableBillsInReport.map((b) => b.bill_reference).join(", ") || "None"
      }`
    );
    console.log(
      `Outstanding Receivables: ${receivableBillsInReport.length} bills ➜ ${
        receivableBillsInReport.map((b) => b.bill_reference).join(", ") ||
        "None"
      }`
    );

    console.log(`\n✅ ALL FIXES COMPLETE`);
    console.log(
      "   All 4 bills should now appear in their respective Outstanding Reports"
    );
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await client.close();
  }
}

applyFinalFixes();
