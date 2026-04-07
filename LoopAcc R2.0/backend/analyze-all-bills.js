import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/";
const DB_NAME = "loopacc_db";
const client = new MongoClient(MONGODB_URI);

async function analyzeAllFourBills() {
  try {
    console.log("🔍 DETAILED ANALYSIS OF ALL 4 BILLS");
    console.log("=".repeat(80));

    await client.connect();
    const db = client.db(DB_NAME);

    const COMPANY_ID = "8fefda79-d18a-4d56-92aa-4d604419d29f";

    const allBills = await db
      .collection("bill_allocation")
      .find({ company_id: COMPANY_ID })
      .toArray();

    // Get all groups and ledgers for reference
    const allGroups = await db
      .collection("groups")
      .find({ company_id: COMPANY_ID })
      .toArray();

    const allLedgers = await db
      .collection("ledgers")
      .find({ company_id: COMPANY_ID })
      .toArray();

    console.log("\n📊 BILL CLASSIFICATION:");
    console.log("-".repeat(80));

    for (const bill of allBills) {
      const ledger = allLedgers.find((l) => l.id === bill.ledger_id);
      const group = allGroups.find((g) => g.id === ledger?.group_id);

      const isPayableGroup =
        group && /creditors|suppliers|payable/i.test(group.name);
      const isReceivableGroup =
        group && /debtors|customers|receivable/i.test(group.name);

      console.log(`\n✏️  Bill: ${bill.bill_reference}`);
      console.log(`   ID: ${bill.id}`);
      console.log(`   Amount: ${bill.amount}`);
      console.log(
        `   Ledger: ${ledger?.name || "NOT FOUND"} (is_billwise: ${
          ledger?.is_billwise
        })`
      );
      console.log(`   Group: ${group?.name || "NOT FOUND"}`);
      console.log(
        `   Group Type: ${
          isPayableGroup
            ? "🔴 PAYABLE"
            : isReceivableGroup
            ? "🟢 RECEIVABLE"
            : "⚪ OTHER"
        }`
      );
      console.log(`   isDeemedPositive: ${bill.isDeemedPositive} (Current)`);
      console.log(`   Source: ${bill.source || "UNDEFINED"}`);

      // Determine what it should be
      let expectedDeemedPositive = "unknown";
      let expectedReport = "NOT IN ANY REPORT";

      if (isPayableGroup) {
        expectedDeemedPositive = "no";
        expectedReport = "Outstanding PAYABLES";
      } else if (isReceivableGroup) {
        expectedDeemedPositive = "yes";
        expectedReport = "Outstanding RECEIVABLES";
      }

      console.log(
        `   ➡️  Should be (isDeemedPositive): ${expectedDeemedPositive}`
      );
      console.log(`   ➡️  Should appear in: ${expectedReport}`);

      // Check match
      const matches =
        (isPayableGroup && bill.isDeemedPositive === "no") ||
        (isReceivableGroup && bill.isDeemedPositive === "yes");

      console.log(
        `   ${matches ? "✅" : "❌"} MATCHES: ${matches ? "YES" : "NO"}`
      );

      // Check source
      if (bill.source !== "ledger-opening" && bill.source !== "standalone") {
        console.log(
          `   ⚠️  SOURCE ISSUE: Expected 'ledger-opening' or 'standalone', got '${
            bill.source || "UNDEFINED"
          }'`
        );
      }
    }

    console.log(`\n${"=".repeat(80)}`);
    console.log("\n🔧 FIX SUMMARY:");
    console.log("-".repeat(80));

    console.log("\n1️⃣  Bill: 11111");
    console.log("   Issue: In RECEIVABLE group (Customers - Syed Ali)");
    console.log("   Status: isDeemedPositive=no (WRONG - should be 'yes')");
    console.log("   Fix: Change isDeemedPositive from 'no' to 'yes'");

    console.log("\n2️⃣  Bill: bill111");
    console.log("   Issue: In PAYABLE group (Suppliers - SR Power)");
    console.log("   Status: isDeemedPositive=no (CORRECT)");
    console.log("   Status: source='ledger-opening' (CORRECT)");
    console.log("   ✅ Should show in Outstanding PAYABLES");

    console.log("\n3️⃣  Bill: Bill231");
    console.log("   Issue: In PAYABLE group (Suppliers - SR Power)");
    console.log("   Status: isDeemedPositive=no (CORRECT)");
    console.log("   Status: source='ledger-opening' (CORRECT)");
    console.log("   ✅ Should show in Outstanding PAYABLES");

    console.log("\n4️⃣  Bill: BILL0001");
    console.log("   Issue: In PAYABLE group (Suppliers - SR Power)");
    console.log("   Status: isDeemedPositive=no (CORRECT)");
    console.log(
      "   Status: source='UNDEFINED' (WRONG - should be 'ledger-opening' or 'standalone')"
    );
    console.log(
      "   Additional Issue: Linked to purchase voucher (invoice_voucher_id set)"
    );
    console.log("   Fix: Set source='ledger-opening' or 'standalone'");

    console.log(`\n${"=".repeat(80)}`);
    console.log("\n✅ FIXES NEEDED:");
    console.log("-".repeat(80));
    console.log(
      "1. Bill 11111: Change isDeemedPositive to 'yes' (it's RECEIVABLE)"
    );
    console.log(
      "2. Bill BILL0001: Set source to 'ledger-opening' or 'standalone'"
    );
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await client.close();
  }
}

analyzeAllFourBills();
