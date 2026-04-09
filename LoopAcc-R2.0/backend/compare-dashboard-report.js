import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/";
const DB_NAME = "loopacc_db";
const client = new MongoClient(MONGODB_URI);

async function checkDashboardVsReportData() {
  try {
    console.log("🔍 COMPARING DASHBOARD CALCULATION vs REPORT DATA");
    console.log("=".repeat(80));

    await client.connect();
    const db = client.db(DB_NAME);

    const COMPANY_ID = "8fefda79-d18a-4d56-92aa-4d604419d29f";

    // DASHBOARD CALCULATION METHOD
    console.log("\n📊 DASHBOARD METHOD (Current):");
    console.log("-".repeat(80));

    const allVouchers = await db
      .collection("vouchers")
      .find({ company_id: COMPANY_ID })
      .toArray();

    const salesVouchers = allVouchers.filter((v) => v.voucher_type === "sales");
    const purchaseVouchers = allVouchers.filter(
      (v) => v.voucher_type === "purchase"
    );
    const receiptVouchers = allVouchers.filter(
      (v) => v.voucher_type === "receipt"
    );
    const paymentVouchers = allVouchers.filter(
      (v) => v.voucher_type === "payment"
    );

    const totalSales = salesVouchers.reduce(
      (sum, v) => sum + Number(v.net_amount || 0),
      0
    );
    const totalPurchase = purchaseVouchers.reduce(
      (sum, v) => sum + Number(v.net_amount || 0),
      0
    );
    const totalReceipts = receiptVouchers.reduce(
      (sum, v) => sum + Number(v.net_amount || 0),
      0
    );
    const totalPayments = paymentVouchers.reduce(
      (sum, v) => sum + Number(v.net_amount || 0),
      0
    );

    const dashboardReceivables = totalSales - totalReceipts;
    const dashboardPayables = totalPurchase - totalPayments;

    console.log(`   Total Sales: ₹${totalSales.toFixed(2)}`);
    console.log(`   Total Receipts: ₹${totalReceipts.toFixed(2)}`);
    console.log(
      `   Outstanding Receivables: ₹${dashboardReceivables.toFixed(2)}`
    );
    console.log(`\n   Total Purchase: ₹${totalPurchase.toFixed(2)}`);
    console.log(`   Total Payments: ₹${totalPayments.toFixed(2)}`);
    console.log(`   Outstanding Payables: ₹${dashboardPayables.toFixed(2)}`);

    // REPORT METHOD (From voucherService.js)
    console.log(`\n${"=".repeat(80)}`);
    console.log("\n📈 REPORT METHOD (getOutstandingReceivables/Payables):");
    console.log("-".repeat(80));

    // Get receivables
    console.log("\n   OUTSTANDING RECEIVABLES:");

    const receivableGroups = await db
      .collection("groups")
      .find({
        company_id: COMPANY_ID,
        name: { $regex: "debtors|customers|receivable", $options: "i" },
      })
      .toArray();

    const receivableGroupIds = receivableGroups.map((g) => g.id);
    const receivableLedgers = await db
      .collection("ledgers")
      .find({
        company_id: COMPANY_ID,
        group_id: { $in: receivableGroupIds },
      })
      .toArray();

    const receivableLedgerIds = receivableLedgers.map((l) => l.id);

    const receivableBills = await db
      .collection("bill_allocation")
      .find({
        company_id: COMPANY_ID,
        isDeemedPositive: "yes",
        ledger_id: { $in: receivableLedgerIds },
      })
      .toArray();

    const totalReceivablesFromReport = receivableBills
      .filter((b) => b.source === "ledger-opening" || b.source === "standalone")
      .reduce((sum, b) => sum + (b.amount || 0), 0);

    console.log(
      `   Found ${receivableBills.length} receivable bills in bill_allocation`
    );
    console.log(
      `   Total from filtered bills: ₹${totalReceivablesFromReport.toFixed(2)}`
    );

    // Get payables
    console.log("\n   OUTSTANDING PAYABLES:");

    const payableGroups = await db
      .collection("groups")
      .find({
        company_id: COMPANY_ID,
        name: { $regex: "creditors|suppliers|payable", $options: "i" },
      })
      .toArray();

    const payableGroupIds = payableGroups.map((g) => g.id);
    const payableLedgers = await db
      .collection("ledgers")
      .find({
        company_id: COMPANY_ID,
        group_id: { $in: payableGroupIds },
      })
      .toArray();

    const payableLedgerIds = payableLedgers.map((l) => l.id);

    const payableBills = await db
      .collection("bill_allocation")
      .find({
        company_id: COMPANY_ID,
        isDeemedPositive: "no",
        ledger_id: { $in: payableLedgerIds },
      })
      .toArray();

    const totalPayablesFromReport = payableBills
      .filter((b) => b.source === "ledger-opening" || b.source === "standalone")
      .reduce((sum, b) => sum + (b.amount || 0), 0);

    console.log(
      `   Found ${payableBills.length} payable bills in bill_allocation`
    );
    console.log(
      `   Total from filtered bills: ₹${totalPayablesFromReport.toFixed(2)}`
    );

    // COMPARISON
    console.log(`\n${"=".repeat(80)}`);
    console.log("\n📊 COMPARISON:");
    console.log("-".repeat(80));

    const receivableMatch =
      Math.abs(dashboardReceivables - totalReceivablesFromReport) < 0.01;
    const payableMatch =
      Math.abs(dashboardPayables - totalPayablesFromReport) < 0.01;

    console.log(
      `\n   Receivables Match: ${receivableMatch ? "✅ YES" : "❌ NO"}`
    );
    console.log(`   Dashboard: ₹${dashboardReceivables.toFixed(2)}`);
    console.log(`   Report:    ₹${totalReceivablesFromReport.toFixed(2)}`);
    console.log(
      `   Difference: ₹${(
        dashboardReceivables - totalReceivablesFromReport
      ).toFixed(2)}`
    );

    console.log(`\n   Payables Match: ${payableMatch ? "✅ YES" : "❌ NO"}`);
    console.log(`   Dashboard: ₹${dashboardPayables.toFixed(2)}`);
    console.log(`   Report:    ₹${totalPayablesFromReport.toFixed(2)}`);
    console.log(
      `   Difference: ₹${(dashboardPayables - totalPayablesFromReport).toFixed(
        2
      )}`
    );

    if (!receivableMatch || !payableMatch) {
      console.log(`\n${"=".repeat(80)}`);
      console.log("\n⚠️  MISMATCH ANALYSIS:");
      console.log("-".repeat(80));
      console.log("\nThe dashboard uses a simple calculation:");
      console.log("  Receivables = All Sales Vouchers - All Receipt Vouchers");
      console.log("  Payables = All Purchase Vouchers - All Payment Vouchers");
      console.log("\nThe reports use a more complex approach:");
      console.log("  1. Filter vouchers by customer/supplier groups");
      console.log("  2. Get bills from bill_allocation collection");
      console.log("  3. Filter by isDeemedPositive flag");
      console.log("  4. Filter by source type (ledger-opening or standalone)");
      console.log(
        "\nTo fix: Update dashboard to use the same report calculation method"
      );
    }
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await client.close();
  }
}

checkDashboardVsReportData();
