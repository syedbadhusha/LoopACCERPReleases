import { getDb } from "./db.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Diagnostic script to check billwise ledger setup and voucher creation
 * This script will:
 * 1. Find all billwise ledgers
 * 2. Check a recent voucher
 * 3. Check if ledger_entries exist
 * 4. Check if billallocations are in the ledger_entries
 * 5. Check if billallocations are in bill_allocation collection
 */

async function diagnoseAllocation() {
  const db = getDb();

  try {
    console.log("\n========== BILLALLOCATION DIAGNOSTIC ==========\n");

    // Step 1: Find all billwise ledgers
    console.log("[STEP 1] Finding all billwise ledgers...");
    const billwiseLedgers = await db
      .collection("ledgers")
      .find({ is_billwise: true })
      .limit(5)
      .toArray();

    if (billwiseLedgers.length === 0) {
      console.log("[ERROR] ❌ NO BILLWISE LEDGERS FOUND!");
      console.log("[INFO] Setting up test billwise ledger...");

      const testLedgerId = uuidv4();
      const result = await db.collection("ledgers").insertOne({
        id: testLedgerId,
        company_id: "12345",
        name: "Test Billwise Ledger - Diagnostic",
        is_billwise: true,
        balance_type: "debit",
        group_id: "cust_id",
        created_at: new Date(),
      });

      console.log("[SUCCESS] ✅ Created test billwise ledger:", testLedgerId);
    } else {
      console.log(
        "[SUCCESS] ✅ Found",
        billwiseLedgers.length,
        "billwise ledgers:"
      );
      billwiseLedgers.forEach((ledger, idx) => {
        console.log(`  [${idx}] ${ledger.name || ledger.id}`);
        console.log(
          `      is_billwise: ${
            ledger.is_billwise
          } (type: ${typeof ledger.is_billwise})`
        );
        console.log(`      company_id: ${ledger.company_id}`);
      });
    }

    // Step 2: Find recent vouchers
    console.log("\n[STEP 2] Finding recent vouchers...");
    const recentVouchers = await db
      .collection("vouchers")
      .find({})
      .sort({ created_at: -1 })
      .limit(3)
      .toArray();

    if (recentVouchers.length === 0) {
      console.log("[ERROR] ❌ NO VOUCHERS FOUND IN DATABASE!");
      console.log("[INFO] You need to create a voucher first");
      process.exit(0);
    } else {
      console.log(
        "[SUCCESS] ✅ Found",
        recentVouchers.length,
        "recent vouchers"
      );
      recentVouchers.forEach((voucher, idx) => {
        console.log(`\n  [${idx}] Voucher: ${voucher.voucher_number}`);
        console.log(`      ID: ${voucher.id}`);
        console.log(`      Type: ${voucher.voucher_type}`);
        console.log(`      Company: ${voucher.company_id}`);
        console.log(
          `      ledger_entries in vouchers doc: ${
            voucher.ledger_entries ? voucher.ledger_entries.length : 0
          }`
        );
      });
    }

    // Step 3: Check ledger_entries collection
    console.log("\n[STEP 3] Checking ledger_entries collection...");
    const ledgerEntriesCount = await db
      .collection("ledger_entries")
      .countDocuments({});
    console.log(
      `[INFO] Total ledger_entries in collection: ${ledgerEntriesCount}`
    );

    const recentEntries = await db
      .collection("ledger_entries")
      .find({})
      .sort({ created_at: -1 })
      .limit(3)
      .toArray();

    if (recentEntries.length === 0) {
      console.log("[ERROR] ❌ NO LEDGER ENTRIES FOUND!");
    } else {
      console.log(
        "[SUCCESS] ✅ Found",
        recentEntries.length,
        "recent ledger entries"
      );
      recentEntries.forEach((entry, idx) => {
        console.log(`\n  [${idx}] Entry ID: ${entry.id}`);
        console.log(`      Voucher: ${entry.voucher_id}`);
        console.log(`      Ledger: ${entry.ledger_id}`);
        console.log(`      Amount: ${entry.amount}`);
        console.log(
          `      billallocation array exists: ${
            entry.billallocation ? "YES" : "NO"
          }`
        );
        console.log(
          `      billallocation count: ${
            entry.billallocation ? entry.billallocation.length : 0
          }`
        );

        if (entry.billallocation && entry.billallocation.length > 0) {
          console.log(`      billallocation details:`);
          entry.billallocation.forEach((ba, baIdx) => {
            console.log(
              `        [${baIdx}] bill_ref=${ba.bill_reference}, amount=${ba.allocated_amount}`
            );
          });
        }
      });
    }

    // Step 4: Check bill_allocation collection
    console.log("\n[STEP 4] Checking bill_allocation collection...");
    const billAllocCount = await db
      .collection("bill_allocation")
      .countDocuments({});
    console.log(
      `[INFO] Total records in bill_allocation collection: ${billAllocCount}`
    );

    const recentBillAllocs = await db
      .collection("bill_allocation")
      .find({})
      .sort({ created_at: -1 })
      .limit(3)
      .toArray();

    if (recentBillAllocs.length === 0) {
      console.log(
        "[WARNING] ⚠️  No bill allocations found in bill_allocation collection"
      );
    } else {
      console.log(
        "[SUCCESS] ✅ Found",
        recentBillAllocs.length,
        "recent bill allocations"
      );
      recentBillAllocs.forEach((ba, idx) => {
        console.log(`\n  [${idx}] Bill Alloc ID: ${ba.id}`);
        console.log(`      bill_reference: ${ba.bill_reference}`);
        console.log(`      allocated_amount: ${ba.allocated_amount}`);
        console.log(
          `      invoice_voucher_id: ${ba.invoice_voucher_id || "N/A"}`
        );
        console.log(
          `      payment_voucher_id: ${ba.payment_voucher_id || "N/A"}`
        );
      });
    }

    // Step 5: Match vouchers with entries and allocations
    console.log("\n[STEP 5] Matching data across collections...");
    const testVoucher = recentVouchers[0];

    const matchingEntries = await db
      .collection("ledger_entries")
      .find({ voucher_id: testVoucher.id })
      .toArray();

    console.log(`\nVoucher: ${testVoucher.voucher_number} (${testVoucher.id})`);
    console.log(`  Ledger entries found: ${matchingEntries.length}`);

    if (matchingEntries.length > 0) {
      matchingEntries.forEach((entry, idx) => {
        console.log(`\n  Entry [${idx}]:`);
        console.log(`    Ledger ID: ${entry.ledger_id}`);

        // Find the ledger to check if billwise
        db.collection("ledgers")
          .findOne({ id: entry.ledger_id })
          .then((ledger) => {
            console.log(`    Ledger: ${ledger?.name || entry.ledger_id}`);
            console.log(`    Is Billwise: ${ledger?.is_billwise || "N/A"}`);
            console.log(`    Amount: ${entry.amount}`);
            console.log(
              `    Billallocations in entry: ${
                entry.billallocation ? entry.billallocation.length : 0
              }`
            );

            if (entry.billallocation && entry.billallocation.length > 0) {
              console.log(`    ✅ HAS BILLALLOCATIONS:`);
              entry.billallocation.forEach((ba) => {
                console.log(
                  `      - ${ba.bill_reference}: ${ba.allocated_amount}`
                );
              });
            } else {
              console.log(`    ❌ NO BILLALLOCATIONS FOUND`);
            }
          });
      });
    }

    console.log("\n========== SUMMARY ==========");
    console.log("✅ Billwise ledgers exist:", billwiseLedgers.length > 0);
    console.log("✅ Vouchers exist:", recentVouchers.length > 0);
    console.log("✅ Ledger entries exist:", ledgerEntriesCount > 0);
    console.log(
      "✅ Ledger entries have billallocations:",
      recentEntries.some((e) => e.billallocation?.length > 0)
    );
    console.log("✅ Bill allocations exist:", billAllocCount > 0);

    console.log(
      "\n[INFO] Next: Check backend logs for [CREATE VOUCHER] markers when creating voucher"
    );

    process.exit(0);
  } catch (error) {
    console.error("[ERROR] Diagnostic failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

diagnoseAllocation();
