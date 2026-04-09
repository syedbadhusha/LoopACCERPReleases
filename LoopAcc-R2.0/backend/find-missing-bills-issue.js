import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/";
const DB_NAME = "loopacc_db";
const client = new MongoClient(MONGODB_URI);

async function findMissingBillsIssue() {
  try {
    console.log("🔍 FINDING WHY BILLS AREN'T SHOWING - ROOT CAUSE");
    console.log("=".repeat(80));

    await client.connect();
    const db = client.db(DB_NAME);

    const COMPANY_ID = "8fefda79-d18a-4d56-92aa-4d604419d29f";

    // Get all bills again
    const allBills = await db
      .collection("bill_allocation")
      .find({ company_id: COMPANY_ID })
      .toArray();

    console.log("\n📋 ALL BILLS DETAILED STATUS:");
    console.log("-".repeat(80));
    for (const bill of allBills) {
      const ledger = await db
        .collection("ledgers")
        .findOne({ id: bill.ledger_id });

      console.log(`\n   Bill: ${bill.bill_reference}`);
      console.log(
        `   - Ledger: ${ledger?.name} (is_billwise: ${ledger?.is_billwise})`
      );
      console.log(`   - isDeemedPositive: ${bill.isDeemedPositive}`);
      console.log(`   - source: ${bill.source || "UNDEFINED"}`);
      console.log(`   - amount: ${bill.amount}`);
    }

    // Now let's simulate what getOutstandingPayables would return
    console.log("\n" + "=".repeat(80));
    console.log("\n🎯 SIMULATING getOutstandingPayables WITH FIXED FLAGS:");
    console.log("-".repeat(80));

    // Get creditor groups
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

    console.log(`\nCreditor ledgers: ${creditorLedgerIds.length}`);
    creditorLedgers.forEach((l) => {
      console.log(`   - ${l.name}`);
    });

    const payables = [];

    // Step 1: Purchase vouchers (skipping billwise)
    console.log(`\n1️⃣  Purchase vouchers:`);
    const purchaseVouchers = await db
      .collection("vouchers")
      .find({
        company_id: COMPANY_ID,
        voucher_type: "purchase",
        ledger_id: { $in: creditorLedgerIds },
      })
      .toArray();

    console.log(`   Found: ${purchaseVouchers.length}`);
    for (const voucher of purchaseVouchers) {
      const ledger = creditorLedgers.find((l) => l.id === voucher.ledger_id);
      if (ledger?.is_billwise) {
        console.log(`   ⏭️  Skipping (billwise): ${voucher.voucher_number}`);
        continue;
      }
      console.log(`   ✅ Adding: ${voucher.voucher_number}`);
      payables.push(voucher);
    }

    // Step 2: Standalone bills
    console.log(`\n2️⃣  Standalone bills:`);
    const standaloneBills = await db
      .collection("bill_allocation")
      .find({
        company_id: COMPANY_ID,
        source: "standalone",
        isDeemedPositive: "no",
        ledger_id: { $in: creditorLedgerIds },
      })
      .toArray();

    console.log(`   Found: ${standaloneBills.length}`);
    standaloneBills.forEach((b) => {
      console.log(`   ✅ Adding: ${b.bill_reference}`);
      payables.push(b);
    });

    // Step 3: ledger-opening bills (THIS IS WHERE THE BILLS SHOULD BE!)
    console.log(`\n3️⃣  Bill allocations (source='ledger-opening'):`);
    const ledgerOpeningBills = await db
      .collection("bill_allocation")
      .find({
        company_id: COMPANY_ID,
        ledger_id: { $in: creditorLedgerIds },
        source: "ledger-opening",
      })
      .toArray();

    console.log(`   Found: ${ledgerOpeningBills.length}`);
    for (const bill of ledgerOpeningBills) {
      console.log(`\n   Bill: ${bill.bill_reference}`);
      console.log(`   - isDeemedPositive: ${bill.isDeemedPositive}`);
      console.log(`   - source: ${bill.source}`);

      if (bill.isDeemedPositive === "no") {
        console.log(`   ✅ Adding (matches payable)`);
        payables.push(bill);
      } else {
        console.log(
          `   ⏭️  Skipping (not payable, isDeemedPositive=${bill.isDeemedPositive})`
        );
      }
    }

    // Step 4: ledger_entries fallback
    console.log(`\n4️⃣  Ledger entries fallback:`);
    const ledgerEntriesWithBills = await db
      .collection("ledger_entries")
      .find({
        company_id: COMPANY_ID,
        voucher_type: "opening",
        billallocation: { $exists: true, $ne: null },
        ledger_id: { $in: creditorLedgerIds },
      })
      .toArray();

    console.log(`   Found: ${ledgerEntriesWithBills.length}`);

    // Final count
    console.log(`\n${"=".repeat(80)}`);
    console.log(
      `\n📊 RESULT: Outstanding Payables would show ${payables.length} items`
    );
    payables.forEach((p) => {
      console.log(`   - ${p.bill_reference || p.voucher_number}`);
    });

    // Root cause analysis
    console.log(`\n${"=".repeat(80)}`);
    console.log("\n🔴 ROOT CAUSE ANALYSIS:");
    console.log("-".repeat(80));

    const billsNotShowing = allBills.filter((b) => b.isDeemedPositive === "no");
    console.log(`\nPayable bills in database: ${billsNotShowing.length}`);
    billsNotShowing.forEach((b) => {
      console.log(
        `   - ${b.bill_reference} (source: ${b.source || "UNDEFINED"})`
      );
    });

    const billsInReport = payables.filter((p) => p.bill_reference);
    console.log(`\nPayable bills in report: ${billsInReport.length}`);
    billsInReport.forEach((b) => {
      console.log(`   - ${b.bill_reference}`);
    });

    const missing = billsNotShowing.filter(
      (db) => !billsInReport.find((r) => r.bill_reference === db.bill_reference)
    );
    console.log(`\n❌ MISSING from report: ${missing.length}`);
    missing.forEach((b) => {
      console.log(
        `   - ${b.bill_reference} (source: ${b.source || "UNDEFINED"})`
      );
    });

    if (missing.length > 0) {
      console.log(
        `\n⚠️  WHY: These bills have source='${
          missing[0].source || "UNDEFINED"
        }' but report expects source='ledger-opening'`
      );
    }
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await client.close();
  }
}

findMissingBillsIssue();
