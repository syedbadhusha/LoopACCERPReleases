import { MongoClient } from "mongodb";

const COMPANY_ID = "8fefda79-d18a-4d56-92aa-4d604419d29f";
const COMPANY_NAME = "A To Z Battery sales and Services Test";
const client = new MongoClient("mongodb://localhost:27017/tally");

async function diagnose() {
  try {
    console.log("🔍 PAYABLES DIAGNOSTIC REPORT");
    console.log("=".repeat(60));

    await client.connect();
    const db = client.db("tally");

    // Step 1: Check companies
    console.log("\n1️⃣  CHECKING COMPANIES");
    console.log("-".repeat(60));
    const companies = await db.collection("companies").find({}).toArray();
    console.log(`Total companies in database: ${companies.length}`);

    const targetCompany = companies.find((c) => c.id === COMPANY_ID);
    if (targetCompany) {
      console.log(`✅ Found target company:`);
      console.log(`   Name: ${targetCompany.name}`);
      console.log(`   ID: ${targetCompany.id}`);
    } else {
      console.log(`❌ Target company NOT FOUND with ID: ${COMPANY_ID}`);
      console.log(`Available companies:`);
      companies.forEach((c) => {
        console.log(`   - ${c.name} (${c.id})`);
      });
    }

    // Step 2: Check creditor/supplier groups for the company
    console.log("\n2️⃣  CHECKING CREDITOR/SUPPLIER GROUPS");
    console.log("-".repeat(60));
    const creditorGroups = await db
      .collection("groups")
      .find({
        company_id: COMPANY_ID,
        name: { $regex: "creditors|suppliers|payable", $options: "i" },
      })
      .toArray();

    console.log(`Found ${creditorGroups.length} creditor/supplier groups:`);
    creditorGroups.forEach((group) => {
      console.log(`   - ${group.name} (ID: ${group.id})`);
    });

    if (creditorGroups.length === 0) {
      console.log("⚠️  No creditor groups found! Checking all groups:");
      const allGroups = await db
        .collection("groups")
        .find({ company_id: COMPANY_ID })
        .toArray();
      allGroups.forEach((group) => {
        console.log(`   - ${group.name}`);
      });
    }

    // Step 3: Get supplier ledgers in those groups
    console.log("\n3️⃣  CHECKING SUPPLIER LEDGERS");
    console.log("-".repeat(60));
    const groupIds = creditorGroups.map((g) => g.id);
    const supplierLedgers = await db
      .collection("ledgers")
      .find({
        company_id: COMPANY_ID,
        group_id: { $in: groupIds },
      })
      .toArray();

    console.log(
      `Total supplier ledgers in creditor groups: ${supplierLedgers.length}`
    );

    const billwiseLedgers = supplierLedgers.filter(
      (l) => l.is_billwise === true
    );
    console.log(
      `Supplier ledgers with is_billwise=true: ${billwiseLedgers.length}`
    );
    console.log(
      `Supplier ledgers with is_billwise≠true: ${
        supplierLedgers.length - billwiseLedgers.length
      }`
    );

    console.log(`\nDetailed supplier ledger list:`);
    supplierLedgers.forEach((ledger) => {
      const billwiseStatus = ledger.is_billwise === true ? "✅ YES" : "❌ NO";
      console.log(`   - ${ledger.name}`);
      console.log(`     ID: ${ledger.id}`);
      console.log(`     is_billwise: ${billwiseStatus}`);
      console.log(`     group_id: ${ledger.group_id}`);
    });

    // Step 4: Check bill_allocation collection for these ledgers
    console.log("\n4️⃣  CHECKING BILL_ALLOCATION COLLECTION");
    console.log("-".repeat(60));
    const supplierLedgerIds = supplierLedgers.map((l) => l.id);
    const supplierBills = await db
      .collection("bill_allocation")
      .find({
        company_id: COMPANY_ID,
        ledger_id: { $in: supplierLedgerIds },
      })
      .toArray();

    console.log(
      `Total bills in bill_allocation for supplier ledgers: ${supplierBills.length}`
    );

    // Group by ledger
    const billsByLedger = {};
    supplierBills.forEach((bill) => {
      if (!billsByLedger[bill.ledger_id]) {
        billsByLedger[bill.ledger_id] = [];
      }
      billsByLedger[bill.ledger_id].push(bill);
    });

    console.log(`\nBills grouped by ledger:`);
    Object.entries(billsByLedger).forEach(([ledgerId, bills]) => {
      const ledger = supplierLedgers.find((l) => l.id === ledgerId);
      console.log(`   ${ledger?.name} (${ledgerId}): ${bills.length} bills`);
    });

    // Show sample bills with details
    console.log(`\n📊 SAMPLE BILL DATA (max 5):`);
    supplierBills.slice(0, 5).forEach((bill, idx) => {
      const ledger = supplierLedgers.find((l) => l.id === bill.ledger_id);
      console.log(`\n   [${idx + 1}] Bill Reference: ${bill.bill_reference}`);
      console.log(`       Ledger: ${ledger?.name}`);
      console.log(`       Allocated Amount: ${bill.allocated_amount}`);
      console.log(`       isDeemedPositive: ${bill.isDeemedPositive}`);
      console.log(`       Source: ${bill.source}`);
      console.log(`       Remaining Amount: ${bill.remaining_amount}`);
      console.log(`       Status: ${bill.status}`);
      console.log(`       Created: ${bill.created_at}`);
    });

    // Step 5: Check for purchase vouchers for billwise ledgers
    console.log("\n5️⃣  CHECKING PURCHASE VOUCHERS FOR BILLWISE LEDGERS");
    console.log("-".repeat(60));
    const billwiseLedgerIds = billwiseLedgers.map((l) => l.id);

    if (billwiseLedgerIds.length === 0) {
      console.log("⚠️  No billwise ledgers found - skipping this check");
    } else {
      const purchaseVouchers = await db
        .collection("vouchers")
        .find({
          company_id: COMPANY_ID,
          voucher_type: "purchase",
          ledger_id: { $in: billwiseLedgerIds },
        })
        .toArray();

      console.log(
        `Purchase vouchers for billwise supplier ledgers: ${purchaseVouchers.length}`
      );
      purchaseVouchers.slice(0, 5).forEach((v) => {
        const ledger = billwiseLedgers.find((l) => l.id === v.ledger_id);
        console.log(
          `   - ${v.voucher_number} for ${ledger?.name} (Amount: ${v.total_amount})`
        );
      });
    }

    // Step 6: Check overall bill_allocation status
    console.log("\n6️⃣  OVERALL BILL_ALLOCATION STATUS");
    console.log("-".repeat(60));
    const allBills = await db
      .collection("bill_allocation")
      .find({ company_id: COMPANY_ID })
      .toArray();

    console.log(`Total bills for this company: ${allBills.length}`);

    const billStatusSummary = {};
    const billSourceSummary = {};
    const isDeemedSummary = { true: 0, false: 0, null: 0 };

    allBills.forEach((bill) => {
      // Status summary
      billStatusSummary[bill.status] =
        (billStatusSummary[bill.status] || 0) + 1;

      // Source summary
      billSourceSummary[bill.source] =
        (billSourceSummary[bill.source] || 0) + 1;

      // isDeemedPositive summary
      if (bill.isDeemedPositive === true) {
        isDeemedSummary.true++;
      } else if (bill.isDeemedPositive === false) {
        isDeemedSummary.false++;
      } else {
        isDeemedSummary.null++;
      }
    });

    console.log(`\nBills by Status:`);
    Object.entries(billStatusSummary).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`);
    });

    console.log(`\nBills by Source:`);
    Object.entries(billSourceSummary).forEach(([source, count]) => {
      console.log(`   ${source}: ${count}`);
    });

    console.log(`\nBills by isDeemedPositive:`);
    console.log(`   true: ${isDeemedSummary.true}`);
    console.log(`   false: ${isDeemedSummary.false}`);
    console.log(`   null/undefined: ${isDeemedSummary.null}`);

    // Step 7: Check ledger entries
    console.log("\n7️⃣  CHECKING LEDGER ENTRIES");
    console.log("-".repeat(60));
    const ledgerEntries = await db
      .collection("ledger_entries")
      .find({
        company_id: COMPANY_ID,
        ledger_id: { $in: supplierLedgerIds },
      })
      .toArray();

    console.log(
      `Total ledger entries for supplier ledgers: ${ledgerEntries.length}`
    );

    // Group by ledger
    const entriesByLedger = {};
    ledgerEntries.forEach((entry) => {
      if (!entriesByLedger[entry.ledger_id]) {
        entriesByLedger[entry.ledger_id] = [];
      }
      entriesByLedger[entry.ledger_id].push(entry);
    });

    console.log(`\nLedger entries by supplier:`);
    Object.entries(entriesByLedger).forEach(([ledgerId, entries]) => {
      const ledger = supplierLedgers.find((l) => l.id === ledgerId);
      console.log(`   ${ledger?.name}: ${entries.length} entries`);
    });

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("📋 SUMMARY");
    console.log("=".repeat(60));
    console.log(`✅ Total supplier ledgers: ${supplierLedgers.length}`);
    console.log(`✅ Billwise ledgers: ${billwiseLedgers.length}`);
    console.log(`✅ Bills in bill_allocation: ${supplierBills.length}`);
    console.log(`✅ Purchase vouchers: ${purchaseVouchers?.length || 0}`);
    console.log(`✅ Ledger entries: ${ledgerEntries.length}`);

    // Potential issues
    console.log(`\n⚠️  POTENTIAL ISSUES:`);
    if (supplierLedgers.length === 0) {
      console.log(`   ❌ NO supplier ledgers found in creditor groups`);
    }
    if (billwiseLedgers.length === 0) {
      console.log(`   ❌ NO ledgers marked as is_billwise=true`);
    }
    if (supplierBills.length === 0) {
      console.log(
        `   ❌ NO bills in bill_allocation collection for supplier ledgers`
      );
    }
    if ((purchaseVouchers?.length || 0) === 0 && billwiseLedgers.length > 0) {
      console.log(`   ❌ NO purchase vouchers for billwise ledgers`);
    }

    console.log("\n" + "=".repeat(60));
  } catch (error) {
    console.error("❌ Error during diagnosis:", error);
  } finally {
    await client.close();
  }
}

diagnose();
