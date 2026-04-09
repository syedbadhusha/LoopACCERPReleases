import { getDb } from "./db.js";

/**
 * Quick verification test
 * Checks if billallocations are now in the vouchers collection ledger_entries
 */

async function verifyBillallocationInVoucher() {
  const db = getDb();

  try {
    console.log("\n========== VERIFY BILLALLOCATION IN VOUCHERS ==========\n");

    // Get most recent voucher
    const voucher = await db
      .collection("vouchers")
      .findOne({}, { sort: { created_at: -1 } });

    if (!voucher) {
      console.log("[ERROR] No vouchers found");
      process.exit(0);
    }

    console.log("[CHECK] Voucher:", voucher.voucher_number);
    console.log("[CHECK] ID:", voucher.id);
    console.log(
      "[CHECK] Has ledger_entries array:",
      voucher.ledger_entries ? "YES" : "NO"
    );

    if (!voucher.ledger_entries || voucher.ledger_entries.length === 0) {
      console.log("[ERROR] ❌ No ledger_entries in voucher!");
      process.exit(0);
    }

    console.log("[CHECK] ledger_entries count:", voucher.ledger_entries.length);
    console.log("\n[CHECKING EACH ENTRY FOR BILLALLOCATIONS]");

    let foundBillallocs = false;

    voucher.ledger_entries.forEach((entry, idx) => {
      console.log(`\n  Entry [${idx}]:`);
      console.log(`    ledger_id: ${entry.ledger_id}`);
      console.log(`    amount: ${entry.amount}`);
      console.log(
        `    has billallocation array: ${entry.billallocation ? "YES" : "NO"}`
      );

      if (entry.billallocation) {
        console.log(`    billallocation count: ${entry.billallocation.length}`);

        if (entry.billallocation.length > 0) {
          foundBillallocs = true;
          console.log(`    ✅ HAS BILLALLOCATIONS:`);
          entry.billallocation.forEach((ba, baIdx) => {
            console.log(
              `      [${baIdx}] bill_ref: ${ba.bill_reference}, amount: ${ba.allocated_amount}`
            );
          });
        }
      }
    });

    console.log("\n========== RESULT ==========");
    if (foundBillallocs) {
      console.log(
        "✅ SUCCESS! Billallocations ARE in the vouchers collection!"
      );
    } else {
      console.log(
        "❌ FAILED: Billallocations NOT found in vouchers collection"
      );
    }

    process.exit(0);
  } catch (error) {
    console.error("[ERROR]", error.message);
    process.exit(1);
  }
}

verifyBillallocationInVoucher();
