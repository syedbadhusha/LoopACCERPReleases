import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import fs from "fs";

dotenv.config();

const client = new MongoClient(
  process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://localhost:27017/tally"
);

async function generateReport() {
  const report = [];

  try {
    await client.connect();
    const db = client.db("tally");
    const companyId = "8fefda79-d18a-4d56-92aa-4d604419d29f";

    report.push("=== OUTSTANDING PAYABLES DIAGNOSTIC REPORT ===\n");

    // Check 1: Creditor Groups
    report.push("1. CREDITOR GROUPS:");
    const creditorGroups = await db
      .collection("groups")
      .find({
        company_id: companyId,
        name: { $regex: "creditors|suppliers|payable", $options: "i" },
      })
      .toArray();
    report.push(`   Found ${creditorGroups.length} creditor groups:`);
    creditorGroups.forEach((g) => {
      report.push(`   - ${g.name} (ID: ${g.id})`);
    });

    const groupIds = creditorGroups.map((g) => g.id);

    // Check 2: Supplier Ledgers
    report.push("\n2. SUPPLIER LEDGERS:");
    const suppliers = await db
      .collection("ledgers")
      .find({
        company_id: companyId,
        group_id: { $in: groupIds },
      })
      .toArray();
    report.push(`   Found ${suppliers.length} supplier ledgers:`);
    suppliers.forEach((s) => {
      report.push(
        `   - ${s.name} (ID: ${s.id}, is_billwise: ${s.is_billwise})`
      );
    });

    const ledgerIds = suppliers.map((s) => s.id);

    // Check 3: Bills in bill_allocation with source: "ledger-opening"
    report.push("\n3. BILLS IN bill_allocation (source: 'ledger-opening'):");
    const bills = await db
      .collection("bill_allocation")
      .find({
        company_id: companyId,
        ledger_id: { $in: ledgerIds },
        source: "ledger-opening",
      })
      .toArray();
    report.push(`   Found ${bills.length} ledger-opening bills:`);
    bills.forEach((b) => {
      const ledger = suppliers.find((s) => s.id === b.ledger_id);
      report.push(
        `   - ${b.bill_reference}: ${b.allocated_amount} (isDeemedPositive: ${b.isDeemedPositive}, ledger: ${ledger?.name})`
      );
    });

    // Check 4: Entries in ledger_entries with billallocation
    report.push("\n4. LEDGER_ENTRIES WITH BILLALLOCATION:");
    const entries = await db
      .collection("ledger_entries")
      .find({
        company_id: companyId,
        voucher_type: "opening",
        billallocation: { $exists: true, $ne: null },
        ledger_id: { $in: ledgerIds },
      })
      .toArray();
    report.push(`   Found ${entries.length} ledger entries with allocations:`);
    entries.forEach((e) => {
      const ledger = suppliers.find((s) => s.id === e.ledger_id);
      report.push(`   - ${ledger?.name}: ${e.billallocation?.length} bills`);
      e.billallocation?.forEach((b) => {
        report.push(
          `     * ${b.bill_reference}: ${b.allocated_amount} (isDeemedPositive: ${b.isDeemedPositive})`
        );
      });
    });

    // Check 5: All bills in bill_allocation (all sources)
    report.push("\n5. ALL BILLS IN bill_allocation (ALL SOURCES):");
    const allBills = await db
      .collection("bill_allocation")
      .find({ company_id: companyId, ledger_id: { $in: ledgerIds } })
      .toArray();
    report.push(`   Found ${allBills.length} total bills:`);
    allBills.forEach((b) => {
      const ledger = suppliers.find((s) => s.id === b.ledger_id);
      report.push(
        `   - ${b.bill_reference}: source=${b.source}, amount=${b.allocated_amount}, isDeemedPositive=${b.isDeemedPositive}, ledger=${ledger?.name}`
      );
    });

    // Check 6: Purchase vouchers
    report.push("\n6. PURCHASE VOUCHERS:");
    const vouchers = await db
      .collection("vouchers")
      .find({
        company_id: companyId,
        voucher_type: "purchase",
        ledger_id: { $in: ledgerIds },
      })
      .toArray();
    report.push(`   Found ${vouchers.length} purchase vouchers:`);
    vouchers.forEach((v) => {
      const ledger = suppliers.find((s) => s.id === v.ledger_id);
      report.push(
        `   - ${v.voucher_number}: ${v.total_amount} (ledger: ${ledger?.name})`
      );
    });

    // Write report
    const reportText = report.join("\n");
    fs.writeFileSync("diagnostic-report.txt", reportText);
    console.log(reportText);
    console.log("\n✓ Report written to diagnostic-report.txt");
  } catch (error) {
    console.error("Error:", error.message);
    report.push(`\n❌ ERROR: ${error.message}`);
  } finally {
    await client.close();
  }
}

generateReport();
