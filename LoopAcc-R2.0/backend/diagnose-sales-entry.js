import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const mongoUri = process.env.MONGODB_URI;
const client = new MongoClient(mongoUri, {});

async function diagnose() {
  try {
    await client.connect();
    const db = client.db("loopacc_db");

    console.log("\n=== CHECKING LATEST SALES ENTRY ===\n");

    // Get the latest voucher (should be the sales entry created)
    const latestVoucher = await db
      .collection("vouchers")
      .find({ voucher_type: "sales" })
      .sort({ created_at: -1 })
      .limit(1)
      .toArray();

    if (latestVoucher.length === 0) {
      console.log("❌ No sales vouchers found in collection!");
      return;
    }

    const voucher = latestVoucher[0];
    console.log("📋 Latest Sales Voucher:");
    console.log(JSON.stringify(voucher, null, 2));

    console.log("\n=== CHECKING BILL ALLOCATIONS FOR THIS VOUCHER ===\n");

    // Check if there's a bill allocation for this voucher
    const billAllocations = await db
      .collection("bill_allocation")
      .find({ voucher_id: voucher.id })
      .toArray();

    if (billAllocations.length === 0) {
      console.log("❌ No bill allocations found for this voucher!");
    } else {
      console.log(`✓ Found ${billAllocations.length} bill allocation(s):`);
      billAllocations.forEach((ba, idx) => {
        console.log(`\n  [${idx + 1}]`);
        console.log(JSON.stringify(ba, null, 2));
      });
    }

    console.log("\n=== CHECKING LEDGER ENTRIES ===\n");

    const ledgerEntries = await db
      .collection("ledger_entries")
      .find({ voucher_id: voucher.id })
      .toArray();

    if (ledgerEntries.length === 0) {
      console.log("❌ No ledger entries found for this voucher!");
    } else {
      console.log(`✓ Found ${ledgerEntries.length} ledger entry(ies):`);
      ledgerEntries.forEach((le, idx) => {
        console.log(`\n  [${idx + 1}] ${le.ledger_name || le.ledger_id}`);
        console.log(`    Group: ${le.group_name || le.group_id}`);
        console.log(`    Debit: ₹${le.debit || 0}, Credit: ₹${le.credit || 0}`);
      });
    }

    console.log("\n=== CHECKING LEDGER FOR CUSTOMER ===\n");

    const ledger = await db
      .collection("ledgers")
      .findOne({ id: voucher.ledger_id });

    if (!ledger) {
      console.log("❌ Ledger not found for ledger_id:", voucher.ledger_id);
    } else {
      console.log("✓ Ledger found:");
      console.log(`  Name: ${ledger.name}`);
      console.log(`  Group: ${ledger.group_name || ledger.group_id}`);
      console.log(`  Opening: ₹${ledger.opening_balance || 0}`);
    }

    console.log("\n=== ANALYZING OUTSTANDING RECEIVABLES CRITERIA ===\n");

    // Check what the getOutstandingReceivables function is looking for
    const receivablesGroup = await db
      .collection("groups")
      .findOne({ name: "Sundry Debtors" });

    if (receivablesGroup) {
      console.log(
        "✓ Found 'Sundry Debtors' group with ID:",
        receivablesGroup.id
      );
    } else {
      console.log("❌ 'Sundry Debtors' group not found");
    }

    // Check the bill_allocation entry's fields
    if (billAllocations.length > 0) {
      const ba = billAllocations[0];
      console.log("\n📊 Bill Allocation Details:");
      console.log(`  isDeemedPositive: ${ba.isDeemedPositive}`);
      console.log(`  amount: ${ba.amount}`);
      console.log(`  allocated_amount: ${ba.allocated_amount}`);
      console.log(`  paid_amount: ${ba.paid_amount}`);
      console.log(`  pending_amount: ${ba.pending_amount}`);

      const shouldShowInReport =
        ba.isDeemedPositive === true &&
        ba.amount > 0 &&
        (ba.pending_amount || 0) > 0;

      console.log(
        `\n  Will show in Outstanding Receivable report? ${
          shouldShowInReport ? "✅ YES" : "❌ NO"
        }`
      );

      if (!shouldShowInReport) {
        console.log("\n  Reasons it might not show:");
        if (ba.isDeemedPositive !== true) {
          console.log(
            `    - isDeemedPositive is ${ba.isDeemedPositive} (should be true)`
          );
        }
        if (!ba.amount || ba.amount === 0) {
          console.log(`    - amount is ${ba.amount} (should be > 0)`);
        }
        if (!ba.pending_amount || ba.pending_amount === 0) {
          console.log(
            `    - pending_amount is ${ba.pending_amount} (should be > 0)`
          );
        }
      }
    }

    console.log("\n=== SUMMARY ===\n");
    console.log("Voucher ID:", voucher.id);
    console.log("Voucher Number:", voucher.voucher_number);
    console.log("Voucher Date:", voucher.voucher_date);
    console.log("Total Amount:", voucher.total_amount);
    console.log("Ledger ID:", voucher.ledger_id);
    if (ledger) console.log("Ledger Name:", ledger.name);
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await client.close();
  }
}

diagnose();
