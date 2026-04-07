import { getDb } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const BILL_TYPE_NEW_REF = "New Ref";
const BILL_TYPE_AGAINST_REF = "Against Ref";
const BILL_TYPE_ON_ACCOUNTS = "ON ACCOUNTS";
const BILL_TYPE_OPENING = "Opening";
const BILL_TYPE_ADVANCE = "Advance";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function abs(value) {
  return Math.abs(toNumber(value, 0));
}

function inferSignedAmount(inputAmount, inputBalanceType = "debit") {
  const numeric = toNumber(inputAmount, 0);
  const normalized = Math.abs(numeric);
  return inputBalanceType === "debit" ? -normalized : normalized;
}

function normalizeOpening(openingValue, balanceType = "debit") {
  const normalized = Math.abs(toNumber(openingValue, 0));
  return balanceType === "debit" ? -normalized : normalized;
}

function computeBillAmounts({ opening, credit, debit }) {
  const normalizedOpening = toNumber(opening, 0);
  const normalizedCredit = abs(credit);
  const normalizedDebit = abs(debit);
  const closing = normalizedOpening + normalizedCredit - normalizedDebit;

  return {
    opening: normalizedOpening,
    credit: normalizedCredit,
    debit: normalizedDebit,
    closing,
  };
}

function normalizeBillType(value, fallback = BILL_TYPE_NEW_REF) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (
    [
      "against ref",
      "against-ref",
      "againstref",
      "agst ref",
      "agst-ref",
      "agstref",
      "againts ref",
      "againts-ref",
      "againtsref",
    ].includes(normalized)
  ) {
    return BILL_TYPE_AGAINST_REF;
  }

  if (["new ref", "new-ref", "newref"].includes(normalized)) {
    return BILL_TYPE_NEW_REF;
  }

  if (
    ["on accounts", "on account", "on-account", "onaccounts"].includes(
      normalized,
    )
  ) {
    return BILL_TYPE_ON_ACCOUNTS;
  }

  if (["opening", "open"].includes(normalized)) {
    return BILL_TYPE_OPENING;
  }

  if (["advance", "adv", "advc"].includes(normalized)) {
    return BILL_TYPE_ADVANCE;
  }

  return fallback;
}

/**
 * Create a standalone bill in the bills collection
 * Used when creating bills directly from ledger master without vouchers
 * Bills can be marked as debit (receivable) or credit (payable)
 */
export async function createStandaloneBill(billData) {
  const db = getDb();

  // Get the ledger to verify it exists and determine type
  const ledger = await db.collection("ledgers").findOne({
    id: billData.ledger_id,
    company_id: billData.company_id,
  });

  if (!ledger) {
    throw new Error(`Ledger not found: ${billData.ledger_id}`);
  }

  const inferredBalanceType =
    billData.balance_type || (Number(ledger.opening || 0) < 0 ? "debit" : "credit");
  const signedAmount = inferSignedAmount(billData.amount, inferredBalanceType);
  const initialOpening =
    billData.opening !== undefined
      ? normalizeOpening(billData.opening, inferredBalanceType)
      : signedAmount;

  const computed = computeBillAmounts({
    opening: initialOpening,
    credit:
      billData.credit !== undefined
        ? billData.credit
        : signedAmount > 0
          ? signedAmount
          : 0,
    debit:
      billData.debit !== undefined
        ? billData.debit
        : signedAmount < 0
          ? Math.abs(signedAmount)
          : 0,
  });

  // Create bill record
  const bill = {
    id: uuidv4(),
    company_id: billData.company_id,
    ledger_id: billData.ledger_id,
    bill_reference: billData.bill_reference || `BILL-${Date.now()}`,
    bill_type: normalizeBillType(billData.bill_type, BILL_TYPE_NEW_REF),
    opening: computed.opening,
    credit: computed.credit,
    debit: computed.debit,
    closing: computed.closing,
    bill_date: billData.bill_date || new Date().toISOString().split("T")[0],
    due_date: billData.due_date || null,
    narration: billData.narration || "",
    // Mark as standalone bill (not from a voucher)
    source: "standalone", // Identifies this as directly created bill
    created_at: new Date(),
    updated_at: new Date(),
  };

  // Insert into bills collection
  await db.collection("bills").insertOne(bill);

  return bill;
}

/**
 * Update a standalone bill
 */
export async function updateStandaloneBill(billId, companyId, billData) {
  const db = getDb();

  // Find the bill
  const bill = await db.collection("bills").findOne({
    id: billId,
    company_id: companyId,
    source: { $in: ["standalone", "ledger-opening"] },
  });

  if (!bill) {
    throw new Error(`Bill not found: ${billId}`);
  }

  const existingOpening =
    bill.opening !== undefined
      ? bill.opening
      : bill.openingBalance !== undefined
        ? bill.openingBalance
        : 0;

  const inferredBalanceType =
    billData.balance_type || (Number(bill.opening || 0) < 0 ? "debit" : "credit");

  const computed = computeBillAmounts({
    opening:
      billData.opening !== undefined
        ? normalizeOpening(billData.opening, inferredBalanceType)
        : existingOpening,
    credit:
      billData.credit !== undefined ? billData.credit : bill.credit || 0,
    debit: billData.debit !== undefined ? billData.debit : bill.debit || 0,
  });

  const billType = normalizeBillType(
    billData.bill_type,
    normalizeBillType(bill.bill_type, BILL_TYPE_NEW_REF),
  );

  const updateData = {
    ...billData,
    bill_type: billType,
    opening: computed.opening,
    credit: computed.credit,
    debit: computed.debit,
    closing: computed.closing,
    updated_at: new Date(),
  };

  // Explicitly remove legacy direction fields from updated records.
  delete updateData.balance_type;
  delete updateData.openingBalance;
  delete updateData.closingBalance;
  delete updateData.amount;
  delete updateData.amount_type;

  await db.collection("bills").updateOne({ id: billId }, { $set: updateData });

  // Keep ledger master/opening billallocation arrays in sync for On Account bills.
  if (bill.source === "ledger-opening") {
    const mergedBill = {
      ...bill,
      ...updateData,
      id: billId,
      company_id: companyId,
    };
    await syncOpeningBillAllocationArrays(db, mergedBill);
  }

  return { id: billId, ...updateData };
}

/**
 * Delete a standalone bill
 */
export async function deleteStandaloneBill(billId, companyId) {
  const db = getDb();

  const result = await db.collection("bills").deleteOne({
    id: billId,
    company_id: companyId,
    source: "standalone",
  });

  if (result.deletedCount === 0) {
    throw new Error(`Standalone bill not found: ${billId}`);
  }

  return true;
}

/**
 * Get all standalone bills for a ledger
 */
export async function getStandaloneBillsForLedger(ledgerId, companyId) {
  const db = getDb();

  const bills = await db
    .collection("bills")
    .find({
      ledger_id: ledgerId,
      company_id: companyId,
      source: "standalone",
    })
    .project({
      invoice_voucher_id: 0,
      invoice_voucher_number: 0,
      payment_voucher_id: 0,
      payment_voucher_number: 0,
    })
    .toArray();

  return bills;
}

/**
 * Get all outstanding standalone bills
 * Outstanding = allocated_amount - payments received (tracked in other collections)
 * Receivable = negative closing (debit)
 * Payable = positive closing (credit)
 */
export async function getOutstandingStandaloneBills(companyId, type = "all") {
  const db = getDb();

  // Build filter based on type
  let filter = {
    company_id: companyId,
    source: "standalone",
  };

  if (type === "receivable") {
    filter.closing = { $lt: 0 };
  } else if (type === "payable") {
    filter.closing = { $gt: 0 };
  }

  const bills = await db
    .collection("bills")
    .find(filter)
    .project({
      invoice_voucher_id: 0,
      invoice_voucher_number: 0,
      payment_voucher_id: 0,
      payment_voucher_number: 0,
    })
    .toArray();

  return bills;
}

/**
 * Create multiple standalone bills from ledger master bill allocations
 * This is called when ledger is marked as billwise and bills are saved
 */
export async function createBillsFromLedgerAllocations(
  ledgerId,
  companyId,
  billAllocations,
) {
  const db = getDb();

  console.log(`[CREATE BILLS FROM LEDGER] Starting for ledger ${ledgerId}`, {
    allocationCount: billAllocations?.length || 0,
    companyId,
  });

  if (!billAllocations || billAllocations.length === 0) {
    console.log(
      `[CREATE BILLS FROM LEDGER] No allocations provided, returning empty`,
    );
    return [];
  }

  const ledger = await db.collection("ledgers").findOne({
    id: ledgerId,
    company_id: companyId,
  });

  const existingBills = await db
    .collection("bills")
    .find({
      ledger_id: ledgerId,
      company_id: companyId,
      $and: [
        {
          $or: [
            { source: "ledger-opening" },
            { source: "standalone" },
            { source: { $exists: false } },
            { source: null },
            { source: "" },
            { voucher_id: { $in: ["OPENING", "OPENING-ON-ACCOUNT", null, ""] } },
            {
              voucher_number: {
                $in: ["OPENING-BALANCE", "OPENING-ON-ACCOUNT", null, ""],
              },
            },
          ],
        },
        {
          $or: [
            { invoice_voucher_id: { $exists: false } },
            { invoice_voucher_id: { $in: [null, ""] } },
          ],
        },
        {
          $or: [
            { payment_voucher_id: { $exists: false } },
            { payment_voucher_id: { $in: [null, ""] } },
          ],
        },
      ],
    })
    .toArray();

  const findExistingBillForAllocation = (allocation, billType, reference) => {
    if (allocation?.id) {
      const byId = existingBills.find((bill) => bill.id === allocation.id);
      if (byId) {
        return byId;
      }
    }

    const normalizedRef = String(reference || "").trim().toUpperCase();
    const isOnAccounts =
      normalizedRef === "" ||
      normalizeBillType(billType, null) === BILL_TYPE_ON_ACCOUNTS;

    if (isOnAccounts) {
      return (
        existingBills.find(
          (bill) =>
            String(bill.bill_reference || "").trim() === "" &&
            normalizeBillType(bill.bill_type, null) === BILL_TYPE_ON_ACCOUNTS,
        ) || null
      );
    }

    return (
      existingBills.find(
        (bill) => String(bill.bill_reference || "").trim().toUpperCase() === normalizedRef,
      ) || null
    );
  };

  const createdBills = [];

  for (let idx = 0; idx < billAllocations.length; idx++) {
    const allocation = billAllocations[idx];

    console.log(
      `[CREATE BILLS FROM LEDGER] Processing allocation ${idx + 1}/${
        billAllocations.length
      }:`,
      {
        bill_reference: allocation.bill_reference,
        amount: allocation.amount,
      },
    );

    const rawAmount = Number(allocation.amount ?? allocation.allocated_amount ?? 0);
    const inferredBalanceType =
      allocation.balance_type ||
      (rawAmount < 0 ? "debit" : rawAmount > 0 ? "credit" : null) ||
      (Number(ledger?.opening || 0) < 0 ? "debit" : "credit") ||
      "debit";
    const signedAmount = inferSignedAmount(
      allocation.amount || allocation.allocated_amount || 0,
      inferredBalanceType,
    );

    const opening =
      allocation.opening !== undefined
        ? normalizeOpening(allocation.opening, inferredBalanceType)
        : allocation.openingBalance !== undefined
          ? normalizeOpening(allocation.openingBalance, inferredBalanceType)
          : signedAmount;

    const computed = {
      opening,
      credit: 0,
      debit: 0,
      closing: opening,
    };

    const billType = normalizeBillType(allocation.bill_type, BILL_TYPE_OPENING);
    const normalizedBillReference = String(allocation.bill_reference || "").trim();
    const existingBill = findExistingBillForAllocation(
      allocation,
      billType,
      normalizedBillReference,
    );

    const preservedCredit = Number(existingBill?.credit || 0);
    const preservedDebit = Number(existingBill?.debit || 0);
    const safeCredit = Number.isFinite(preservedCredit) ? preservedCredit : 0;
    const safeDebit = Number.isFinite(preservedDebit) ? preservedDebit : 0;
    const closing = computed.opening + safeCredit - safeDebit;

    const bill = {
      id: existingBill?.id || allocation.id || uuidv4(),
      company_id: companyId,
      ledger_id: ledgerId,
      bill_reference: normalizedBillReference,
      bill_type: billType,
      opening: computed.opening,
      credit: safeCredit,
      debit: safeDebit,
      closing,
      bill_date: allocation.bill_date || new Date().toISOString().split("T")[0],
      due_date: allocation.due_date || null,
      narration: allocation.narration || "",
      source: "ledger-opening", // Different source from standalone
      created_at: existingBill?.created_at || new Date(),
      updated_at: new Date(),
    };

    try {
      console.log(`[CREATE BILLS FROM LEDGER] Upserting bill with ID: ${bill.id}`);
      await db.collection("bills").updateOne(
        { id: bill.id, company_id: companyId },
        {
          $set: bill,
          $unset: {
            invoice_voucher_id: "",
            invoice_voucher_number: "",
            payment_voucher_id: "",
            payment_voucher_number: "",
          },
        },
        { upsert: true },
      );
      console.log(`[CREATE BILLS FROM LEDGER] ✅ Bill upserted successfully:`, {
        id: bill.id,
        bill_reference: bill.bill_reference,
      });
      createdBills.push(bill);
    } catch (insertError) {
      console.error(
        `[CREATE BILLS FROM LEDGER] ❌ Failed to insert bill ${allocation.bill_reference}:`,
        insertError.message,
      );
      throw new Error(
        `Failed to insert bill ${allocation.bill_reference}: ${insertError.message}`,
      );
    }
  }

  console.log(
    `[CREATE BILLS FROM LEDGER] ✅ Successfully created ${createdBills.length} bills`,
  );
  return createdBills;
}

async function syncOpeningBillAllocationArrays(db, bill) {
  const signedAmount =
    bill.opening !== undefined && bill.opening !== null
      ? Number(bill.opening) || 0
      : (Number(bill.credit) || 0) - (Number(bill.debit) || 0);

  const normalizedAllocation = {
    id: bill.id,
    bill_reference: String(bill.bill_reference || "").trim(),
    amount: signedAmount,
    bill_type: normalizeBillType(bill.bill_type, BILL_TYPE_OPENING),
    bill_date: bill.bill_date || null,
  };

  const updateArray = (existing) => {
    const current = Array.isArray(existing) ? existing : [];
    const index = current.findIndex(
      (a) =>
        (a?.id && a.id === normalizedAllocation.id) ||
        (a?.bill_reference || "") === normalizedAllocation.bill_reference,
    );

    if (index >= 0) {
      const updated = [...current];
      updated[index] = {
        ...updated[index],
        ...normalizedAllocation,
      };
      return updated;
    }

    return [...current, normalizedAllocation];
  };

  const ledger = await db.collection("ledgers").findOne({
    id: bill.ledger_id,
    company_id: bill.company_id,
  });

  if (ledger) {
    await db.collection("ledgers").updateOne(
      { id: ledger.id },
      {
        $set: {
          bill_allocations: updateArray(ledger.bill_allocations),
          updated_at: new Date(),
        },
      },
    );
  }
}
