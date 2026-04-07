import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const client = new MongoClient(
  process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://localhost:27017/tally"
);

async function diagnose() {
  try {
    await client.connect();
    const db = client.db("tally");

    // Get bill_allocation collection data
    console.log("\n=== BILL_ALLOCATION COLLECTION ===");
    const billAllocations = await db
      .collection("bill_allocation")
      .find({})
      .limit(10)
      .toArray();
    console.log(
      `Total records: ${await db
        .collection("bill_allocation")
        .countDocuments()}`
    );
    console.log("Sample records:");
    billAllocations.forEach((bill, idx) => {
      console.log(`[${idx}] Bill ${bill.bill_reference}:`);
      console.log(
        `    Amount: ${bill.allocated_amount}, isDeemedPositive: ${bill.isDeemedPositive}, source: ${bill.source}`
      );
      console.log(
        `    LedgerId: ${bill.ledger_id}, CompanyId: ${bill.company_id}`
      );
      console.log(
        `    invoice_voucher_id: ${bill.invoice_voucher_id}, payment_voucher_id: ${bill.payment_voucher_id}`
      );
    });

    // Get ledgers with is_billwise flag
    console.log("\n=== LEDGERS WITH is_billwise ===");
    const billwiseLedgers = await db
      .collection("ledgers")
      .find({ is_billwise: true })
      .toArray();
    console.log(`Found ${billwiseLedgers.length} billwise ledgers:`);
    billwiseLedgers.forEach((ledger) => {
      console.log(`  - ${ledger.name} (ID: ${ledger.id})`);
    });

    // Get creditor groups
    console.log("\n=== CREDITOR GROUPS ===");
    const creditorGroups = await db
      .collection("groups")
      .find({
        name: { $regex: "creditors|suppliers|payable", $options: "i" },
      })
      .toArray();
    console.log(`Found ${creditorGroups.length} creditor groups:`);
    creditorGroups.forEach((group) => {
      console.log(`  - ${group.name} (ID: ${group.id})`);
    });

    // Get ledgers in creditor groups
    console.log("\n=== SUPPLIER LEDGERS ===");
    const groupIds = creditorGroups.map((g) => g.id);
    const supplierLedgers = await db
      .collection("ledgers")
      .find({ group_id: { $in: groupIds } })
      .toArray();
    console.log(`Found ${supplierLedgers.length} supplier ledgers:`);
    supplierLedgers.forEach((ledger) => {
      console.log(
        `  - ${ledger.name} (ID: ${ledger.id}, is_billwise: ${ledger.is_billwise})`
      );
    });

    // Check if any purchase vouchers exist for billwise ledgers
    console.log("\n=== PURCHASE VOUCHERS FOR BILLWISE LEDGERS ===");
    const billwiseLedgerIds = billwiseLedgers.map((l) => l.id);
    const purchaseVouchers = await db
      .collection("vouchers")
      .find({
        voucher_type: "purchase",
        ledger_id: { $in: billwiseLedgerIds },
      })
      .toArray();
    console.log(
      `Found ${purchaseVouchers.length} purchase vouchers for billwise ledgers:`
    );
    purchaseVouchers.forEach((v) => {
      console.log(
        `  - ${v.voucher_number} for ledger ${v.ledger_id} (Amount: ${v.total_amount})`
      );
    });

    // Check bill_allocation for the specific supplier ledgers
    console.log("\n=== BILL_ALLOCATION FOR SUPPLIER LEDGERS ===");
    const supplierLedgerIds = supplierLedgers.map((l) => l.id);
    const supplierBills = await db
      .collection("bill_allocation")
      .find({ ledger_id: { $in: supplierLedgerIds } })
      .toArray();
    console.log(`Found ${supplierBills.length} bills for supplier ledgers:`);
    supplierBills.forEach((bill) => {
      const ledger = supplierLedgers.find((l) => l.id === bill.ledger_id);
      console.log(
        `  - ${bill.bill_reference} from ${ledger?.name} (${bill.allocated_amount}, isDeemedPositive: ${bill.isDeemedPositive}, source: ${bill.source})`
      );
    });

    console.log("\n=== DONE ===\n");
  } catch (error) {
    console.error("Diagnostic error:", error);
  } finally {
    await client.close();
  }
}

diagnose();
