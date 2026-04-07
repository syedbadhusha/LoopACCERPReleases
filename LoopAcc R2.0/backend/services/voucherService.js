import { getDb } from "../db.js";
import { v4 as uuidv4 } from "uuid";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function absNumber(value) {
  return Math.abs(toNumber(value, 0));
}

function resolveLedgerEntryAmount(entryLike) {
  const debitAmount = absNumber(entryLike?.debit_amount);
  const creditAmount = absNumber(entryLike?.credit_amount);
  const explicitAmount = absNumber(entryLike?.amount);

  if (debitAmount > 0 && creditAmount === 0) {
    return debitAmount;
  }

  if (creditAmount > 0 && debitAmount === 0) {
    return creditAmount;
  }

  if (explicitAmount > 0) {
    return explicitAmount;
  }

  if (debitAmount > 0 || creditAmount > 0) {
    return Math.max(debitAmount, creditAmount);
  }

  return explicitAmount;
}

function resolveSignedBillAllocationAmount(entry, billalloc, fallbackAmount = 0) {
  const explicitCredit = absNumber(billalloc?.credit || 0);
  const explicitDebit = absNumber(billalloc?.debit || 0);

  if (explicitCredit > 0 || explicitDebit > 0) {
    return explicitCredit - explicitDebit;
  }

  const rawAmount =
    billalloc?.amount !== undefined && billalloc?.amount !== null
      ? billalloc.amount
      : fallbackAmount;

  return getSignedAmountByIsDeemedPositive(entry?.isDeemedPositive, rawAmount);
}

function normalizeVoucherBillAllocation({
  source,
  resolvedId,
  billReference,
  billType,
  billDate,
  signedAmount,
}) {
  const numericSignedAmount = toNumber(signedAmount, 0);
  return {
    ...(source || {}),
    id: resolvedId,
    bill_reference: billReference,
    bill_date: billDate || null,
    bill_type: billType,
    amount: numericSignedAmount,
  };
}

function collectAffectedLedgerIds(...sources) {
  const ids = [];

  for (const source of sources) {
    if (!source) {
      continue;
    }

    if (Array.isArray(source)) {
      for (const value of source) {
        if (value) {
          ids.push(value);
        }
      }
      continue;
    }

    ids.push(source);
  }

  return [...new Set(ids.filter(Boolean))];
}

function getSignedAmountByIsDeemedPositive(isDeemedPositive, amount) {
  const normalized = absNumber(amount);
  return String(isDeemedPositive || "").toLowerCase() === "yes"
    ? -normalized
    : normalized;
}

const BILL_TYPE_ON_ACCOUNT = "ON ACCOUNTS";

function isOnAccountBillType(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  return ["on account", "on accounts", "on-account", "onaccounts"].includes(
    normalized,
  );
}

function resolveBillReference(voucher, explicitReference) {
  const candidate = String(explicitReference || "").trim();
  if (candidate) {
    return candidate;
  }

  const voucherReference = String(voucher?.reference_number || "").trim();
  if (voucherReference) {
    return voucherReference;
  }

  return String(voucher?.voucher_number || "").trim();
}

function getStoredOpening(bill, fallback = 0) {
  if (!bill) {
    return toNumber(fallback, 0);
  }

  if (bill.opening !== undefined) {
    return toNumber(bill.opening, 0);
  }

  if (bill.openingBalance !== undefined) {
    return toNumber(bill.openingBalance, 0);
  }

  return toNumber(fallback, 0);
}

function computeVoucherBillRollup(
  existingAllocation,
  signedTxnAmount,
  currentVoucherId,
) {
  if (!existingAllocation) {
    const opening = toNumber(signedTxnAmount, 0);
    return {
      opening,
      credit: 0,
      debit: 0,
      closing: opening,
      isNewReference: true,
    };
  }

  const opening = getStoredOpening(existingAllocation, 0);
  let credit = absNumber(existingAllocation.credit || 0);
  let debit = absNumber(existingAllocation.debit || 0);

  const isSameInvoiceVoucher =
    String(existingAllocation.source || "").toLowerCase() === "invoice" &&
    currentVoucherId &&
    String(existingAllocation.voucher_id || "") === String(currentVoucherId);

  if (isSameInvoiceVoucher) {
    const updatedOpening = toNumber(signedTxnAmount, 0);
    return {
      opening: updatedOpening,
      credit,
      debit,
      closing: updatedOpening + credit - debit,
      isNewReference: false,
    };
  }

  if (signedTxnAmount > 0) {
    credit += absNumber(signedTxnAmount);
  } else if (signedTxnAmount < 0) {
    debit += absNumber(signedTxnAmount);
  }

  return {
    opening,
    credit,
    debit,
    closing: opening + credit - debit,
    isNewReference: false,
  };
}

function resolveAllocationSideForVoucher(voucherType, billDoc, explicitSide) {
  const normalizedExplicitSide = String(explicitSide || "").trim().toLowerCase();
  if (normalizedExplicitSide === "credit" || normalizedExplicitSide === "debit") {
    return normalizedExplicitSide;
  }

  const normalizedType = String(voucherType || "").trim().toLowerCase();
  if (normalizedType === "receipt") {
    return "credit";
  }
  if (normalizedType === "payment") {
    return "debit";
  }

  // Fallback to bill polarity: receivable bills are negative closing, payable are positive.
  return toNumber(billDoc?.closing, 0) < 0 ? "credit" : "debit";
}

function computeBillAfterAllocationMovement(
  billDoc,
  amount,
  side,
  reverse = false,
) {
  const delta = absNumber(amount);
  const opening = getStoredOpening(billDoc, 0);
  const existingCredit = absNumber(billDoc?.credit || 0);
  const existingDebit = absNumber(billDoc?.debit || 0);

  let nextCredit = existingCredit;
  let nextDebit = existingDebit;

  if (side === "credit") {
    nextCredit = reverse
      ? Math.max(0, existingCredit - delta)
      : existingCredit + delta;
  } else {
    nextDebit = reverse
      ? Math.max(0, existingDebit - delta)
      : existingDebit + delta;
  }

  return {
    credit: nextCredit,
    debit: nextDebit,
    closing: opening + nextCredit - nextDebit,
  };
}

async function applyVoucherAllocationsToBills({
  db,
  companyId,
  voucherType,
  voucherDate,
  voucherId,
  voucherNumber,
  allocations,
  reverse = false,
}) {
  const billCollection = db.collection("bills");
  const appliedAllocations = [];

  async function getOrCreateOnAccountBill(ledgerId, allocation = null) {
    const explicitBillId =
      allocation?.invoice_voucher_id || allocation?.bill_id || allocation?.id;

    if (explicitBillId) {
      const existingById = await billCollection.findOne({
        id: explicitBillId,
        company_id: companyId,
      });

      if (existingById) {
        return existingById;
      }
    }

    const existingLedgerOpeningBill = await billCollection.findOne({
      company_id: companyId,
      ledger_id: ledgerId,
      bill_reference: "",
      bill_type: { $in: [BILL_TYPE_ON_ACCOUNT, "ON ACCOUNT", "On Account"] },
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
    });

    if (existingLedgerOpeningBill) {
      return existingLedgerOpeningBill;
    }

    // Fallback for vouchers that have no ledger-opening/master ON ACCOUNTS bill.
    if (voucherId) {
      const existingForVoucher = await billCollection.findOne({
        company_id: companyId,
        ledger_id: ledgerId,
        voucher_id: voucherId,
        bill_reference: "",
        bill_type: { $in: [BILL_TYPE_ON_ACCOUNT, "ON ACCOUNT", "On Account"] },
        source: { $in: ["on-account-settlement", "on-account"] },
      });

      if (existingForVoucher) {
        return existingForVoucher;
      }
    }

    if (reverse) {
      return null;
    }

    const newBill = {
      id: explicitBillId || uuidv4(),
      voucher_id: voucherId || "",
      voucher_number: voucherNumber || "",
      ledger_id: ledgerId,
      bill_reference: "",
      bill_type: BILL_TYPE_ON_ACCOUNT,
      opening: 0,
      credit: 0,
      debit: 0,
      closing: 0,
      source: "on-account-settlement",
      company_id: companyId,
      bill_date: voucherDate || null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    await billCollection.insertOne(newBill);
    return newBill;
  }

  for (const allocation of allocations || []) {
    const rawAmount =
      allocation?.amount !== undefined && allocation?.amount !== null
        ? allocation.amount
        : allocation?.allocated_amount;
    const amount = absNumber(rawAmount);

    if (amount <= 0) {
      continue;
    }

    const selectedBillId =
      allocation?.invoice_voucher_id || allocation?.bill_id || allocation?.id;

    const normalizedBillType = String(allocation?.bill_type || "")
      .trim()
      .toLowerCase();
    const normalizedBillRef = String(allocation?.bill_reference || "")
      .trim()
      .toLowerCase();
    const isOnAccountAllocation =
      isOnAccountBillType(normalizedBillType) || isOnAccountBillType(normalizedBillRef);

    if (!selectedBillId && !isOnAccountAllocation) {
      console.warn(
        "[VOUCHER ALLOC] Skipping allocation without selected bill id",
      );
      continue;
    }

    let billDoc = null;

    if (selectedBillId) {
      billDoc = await billCollection.findOne({
        id: selectedBillId,
        company_id: companyId,
      });
    }

    if (!billDoc && isOnAccountAllocation) {
      billDoc = await getOrCreateOnAccountBill(allocation?.ledger_id, allocation);
    }

    if (!billDoc) {
      console.warn(
        `[VOUCHER ALLOC] Selected bill not found for allocation (billId=${selectedBillId || "none"}, ledger=${allocation?.ledger_id || "none"}, company=${companyId})`,
      );
      continue;
    }

    const side = resolveAllocationSideForVoucher(
      voucherType,
      billDoc,
      allocation?.side,
    );
    const nextValues = computeBillAfterAllocationMovement(
      billDoc,
      amount,
      side,
      reverse,
    );

    await billCollection.updateOne(
      { id: billDoc.id, company_id: companyId },
      {
        $set: {
          credit: nextValues.credit,
          debit: nextValues.debit,
          closing: nextValues.closing,
          updated_at: new Date(),
        },
      },
    );

    if (!reverse) {
      appliedAllocations.push({
        id: allocation?.id || uuidv4(),
        ledger_id: allocation?.ledger_id || billDoc.ledger_id,
        invoice_voucher_id: billDoc.id,
        bill_reference: billDoc.bill_reference || allocation?.bill_reference || "",
        amount,
        allocated_amount: amount,
        side,
        allocation_date:
          allocation?.allocation_date ||
          allocation?.bill_date ||
          voucherDate ||
          null,
      });
    }
  }

  return appliedAllocations;
}

function extractSettlementBillAllocationsFromLedgerEntries(
  ledgerEntries = [],
) {
  const flattened = [];

  for (const entry of ledgerEntries || []) {
    const entryLedgerId = entry?.ledger_id;
    const entryAllocations = Array.isArray(entry?.billallocation)
      ? entry.billallocation
      : [];

    for (const allocation of entryAllocations) {
      const rawAmount =
        allocation?.amount !== undefined && allocation?.amount !== null
          ? allocation.amount
          : allocation?.allocated_amount;
      const amount = absNumber(rawAmount);

      if (amount <= 0) {
        continue;
      }

      flattened.push({
        ...allocation,
        ledger_id: allocation?.ledger_id || entryLedgerId,
        amount,
      });
    }

    if (
      entryAllocations.length === 0 &&
      entryLedgerId &&
      absNumber(entry?.amount) > 0
    ) {
      flattened.push({
        id: uuidv4(),
        ledger_id: entryLedgerId,
        bill_reference: "",
        bill_type: BILL_TYPE_ON_ACCOUNT,
        amount: absNumber(entry.amount),
      });
    }
  }

  return flattened;
}

function extractOnAccountsBillAllocationsFromLedgerEntries(ledgerEntries = []) {
  const flattened = [];

  for (const entry of ledgerEntries || []) {
    const entryLedgerId = entry?.ledger_id;
    const entryAllocations = Array.isArray(entry?.billallocation)
      ? entry.billallocation
      : [];

    for (const allocation of entryAllocations) {
      const isOnAccounts =
        isOnAccountBillType(allocation?.bill_type) ||
        String(allocation?.bill_reference || "").trim() === "";

      if (!isOnAccounts) {
        continue;
      }

      const rawAmount =
        allocation?.amount !== undefined && allocation?.amount !== null
          ? allocation.amount
          : allocation?.allocated_amount !== undefined &&
              allocation?.allocated_amount !== null
            ? allocation.allocated_amount
            : entry?.amount;
      const amount = absNumber(rawAmount);
      const signedAmount = toNumber(rawAmount, 0);

      if (amount <= 0) {
        continue;
      }

      flattened.push({
        ...allocation,
        ledger_id: allocation?.ledger_id || entryLedgerId,
        bill_reference: "",
        bill_type: BILL_TYPE_ON_ACCOUNT,
        amount,
        signed_amount: signedAmount,
      });
    }

    // Backward compatibility: older vouchers may not have billallocation
    // persisted for non-billwise ledgers (any ledger type, not just party).
    if (
      entryAllocations.length === 0 &&
      entryLedgerId &&
      absNumber(entry?.amount) > 0
    ) {
      const fallbackAmount = absNumber(entry?.amount);
      const signedFallbackAmount = getSignedAmountByIsDeemedPositive(
        entry?.isDeemedPositive,
        entry?.amount,
      );
      flattened.push({
        id: uuidv4(),
        ledger_id: entryLedgerId,
        bill_reference: "",
        bill_type: BILL_TYPE_ON_ACCOUNT,
        amount: fallbackAmount,
        signed_amount: signedFallbackAmount,
      });
    }
  }

  return flattened;
}

async function reverseInvoiceOnAccountsOpeningInBills({
  db,
  companyId,
  allocations,
}) {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return;
  }

  const billCollection = db.collection("bills");

  for (const allocation of allocations) {
    const ledgerId = allocation?.ledger_id;
    if (!ledgerId) {
      continue;
    }

    const signedAmount = toNumber(
      allocation?.signed_amount,
      getSignedAmountByIsDeemedPositive("no", allocation?.amount),
    );

    if (signedAmount === 0) {
      continue;
    }

    const onAccountsBill = await billCollection.findOne({
      company_id: companyId,
      ledger_id: ledgerId,
      bill_reference: "",
      bill_type: { $in: [BILL_TYPE_ON_ACCOUNT, "ON ACCOUNT", "On Account"] },
    });

    if (!onAccountsBill) {
      continue;
    }

    let opening = toNumber(onAccountsBill.opening, 0);
    let credit = absNumber(onAccountsBill.credit || 0);
    let debit = absNumber(onAccountsBill.debit || 0);

    // Reverse from movement buckets first (current behavior stores invoice impact in credit/debit).
    // Fallback to opening only when movement bucket is insufficient (legacy records).
    if (signedAmount > 0) {
      const reducibleCredit = Math.min(credit, absNumber(signedAmount));
      credit -= reducibleCredit;
      const remaining = absNumber(signedAmount) - reducibleCredit;
      if (remaining > 0) {
        opening -= remaining;
      }
    } else if (signedAmount < 0) {
      const reducibleDebit = Math.min(debit, absNumber(signedAmount));
      debit -= reducibleDebit;
      const remaining = absNumber(signedAmount) - reducibleDebit;
      if (remaining > 0) {
        opening += remaining;
      }
    }

    const closing = opening + credit - debit;

    await billCollection.updateOne(
      { id: onAccountsBill.id, company_id: companyId },
      {
        $set: {
          opening,
          credit,
          debit,
          closing,
          updated_at: new Date(),
        },
      },
    );
  }
}

function getLedgerOpeningSigned(ledger) {
  if (!ledger) {
    return 0;
  }

  if (ledger.opening !== undefined) {
    return toNumber(ledger.opening, 0);
  }

  if (ledger.opening_balance !== undefined) {
    const base = Math.abs(toNumber(ledger.opening_balance, 0));
    const balanceType = String(ledger.balance_type || "credit").toLowerCase();
    return balanceType === "debit" ? -base : base;
  }

  return 0;
}

async function recalculateLedgerBalancesFromVouchers(companyId, ledgerIds = []) {
  const db = getDb();
  const targetLedgerIds = Array.isArray(ledgerIds)
    ? [...new Set(ledgerIds.filter(Boolean))]
    : [];

  const ledgerFilter = { company_id: companyId };
  if (targetLedgerIds.length > 0) {
    ledgerFilter.id = { $in: targetLedgerIds };
  }

  const ledgers = await db.collection("ledgers").find(ledgerFilter).toArray();
  if (ledgers.length === 0) {
    return;
  }

  const voucherMatch = { company_id: companyId };
  if (targetLedgerIds.length > 0) {
    voucherMatch["ledger_entries.ledger_id"] = { $in: targetLedgerIds };
  }

  const movementRows = await db
    .collection("vouchers")
    .aggregate([
      { $match: voucherMatch },
      { $unwind: "$ledger_entries" },
      {
        $match:
          targetLedgerIds.length > 0
            ? { "ledger_entries.ledger_id": { $in: targetLedgerIds } }
            : { "ledger_entries.ledger_id": { $exists: true, $nin: [null, ""] } },
      },
      {
        $project: {
          ledger_id: "$ledger_entries.ledger_id",
          amount: {
            $abs: {
              $convert: {
                input: "$ledger_entries.amount",
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          },
          isDeemedPositive: {
            $toLower: { $ifNull: ["$ledger_entries.isDeemedPositive", "no"] },
          },
        },
      },
      {
        $group: {
          _id: "$ledger_id",
          creditTotal: {
            $sum: {
              $cond: [{ $eq: ["$isDeemedPositive", "no"] }, "$amount", 0],
            },
          },
          debitTotal: {
            $sum: {
              $cond: [{ $eq: ["$isDeemedPositive", "yes"] }, "$amount", 0],
            },
          },
        },
      },
    ])
    .toArray();

  const movementByLedgerId = new Map(
    movementRows.map((row) => [
      row._id,
      {
        creditTotal: toNumber(row.creditTotal, 0),
        debitTotal: toNumber(row.debitTotal, 0),
      },
    ]),
  );

  for (const ledger of ledgers) {
    const movement = movementByLedgerId.get(ledger.id) || {
      creditTotal: 0,
      debitTotal: 0,
    };

    const opening = getLedgerOpeningSigned(ledger);
    const credit = Math.abs(toNumber(movement.creditTotal, 0));
    const debit = -Math.abs(toNumber(movement.debitTotal, 0));
    const closing = opening + credit + debit;

    await db.collection("ledgers").updateOne(
      { id: ledger.id, company_id: companyId },
      {
        $set: {
          credit,
          debit,
          closing,
          updated_at: new Date(),
        },
      },
    );
  }
}

/**
 * Get or create primary batch for an item
 * Primary batch is used when no specific batch is selected (batch_id is null)
 * Also used when enable_batches is false for the item
 */
async function getPrimaryBatchForItem(itemId, companyId) {
  const db = getDb();

  // Find existing primary batch (batch_number is null or "primary" - case insensitive)
  let primaryBatch = await db.collection("batch_allocation").findOne({
    item_id: itemId,
    company_id: companyId,
    $or: [
      { batch_number: null },
      { batch_number: { $regex: "^primary$", $options: "i" } },
    ],
  });

  // If no primary batch exists, create one
  if (!primaryBatch) {
    const id = uuidv4();
    primaryBatch = {
      id,
      item_id: itemId,
      company_id: companyId,
      batch_number: "primary",
      opening_qty: 0,
      opening_rate: 0,
      opening_value: 0,
      inward_qty: 0,
      inward_rate: 0,
      inward_value: 0,
      outward_qty: 0,
      outward_rate: 0,
      outward_value: 0,
      closing_qty: 0,
      closing_rate: 0,
      closing_value: 0,
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.collection("batch_allocation").insertOne(primaryBatch);
  }

  return primaryBatch;
}

/**
 * Update batch allocations based on voucher inventory entries
 * This updates inward/outward quantities for batches when vouchers are created/updated
 * Also updates the batch_allocations array in voucher inventory entries
 */
async function updateBatchAllocationsForVoucher(inventory, voucherType) {
  const db = getDb();
  const inwardVoucherTypes = ["purchase", "receipt", "credit-note"];
  const outwardVoucherTypes = ["sales", "issue", "debit-note"];

  for (const detail of inventory || []) {
    if (!detail.item_id) {
      continue;
    }

    const allocationMoves =
      Array.isArray(detail.batch_allocations) && detail.batch_allocations.length > 0
        ? detail.batch_allocations
            .filter((a) => a?.batch_id)
            .map((a) => ({
              batch_id: a.batch_id,
              qty: Number(a.qty || 0),
              rate: Number(a.rate ?? detail.rate ?? 0),
            }))
        : detail.batch_id
          ? [
              {
                batch_id: detail.batch_id,
                qty:
                  detail.batch_qty !== null && detail.batch_qty !== undefined
                    ? Number(detail.batch_qty || 0)
                    : Number(detail.quantity || 0),
                rate: Number(detail.rate || 0),
              },
            ]
          : [];

    for (const move of allocationMoves) {
      if (!move.batch_id || move.qty <= 0) {
        continue;
      }

      const batch = await db.collection("batch_allocation").findOne({
        id: move.batch_id,
        item_id: detail.item_id,
      });

      if (!batch) {
        continue;
      }

      let new_inward_qty = Number(batch.inward_qty || 0);
      let new_inward_value = Number(batch.inward_value || 0);
      let new_outward_qty = Number(batch.outward_qty || 0);
      let new_outward_value = Number(batch.outward_value || 0);
      const value = move.qty * move.rate;

      if (inwardVoucherTypes.includes(voucherType)) {
        // credit-note = sales return => goods come back IN (inward)
        new_inward_qty += move.qty;
        new_inward_value += value;
      } else if (outwardVoucherTypes.includes(voucherType)) {
        // debit-note = purchase return => goods go OUT to supplier (outward)
        new_outward_qty += move.qty;
        new_outward_value += value;
      }

      const openingQty = Number(batch.opening_qty || 0);
      const openingValue = Number(batch.opening_value || 0);
      const closing_qty = openingQty + new_inward_qty - new_outward_qty;
      const closing_value = openingValue + new_inward_value - new_outward_value;
      const closing_rate = closing_qty > 0 ? closing_value / closing_qty : 0;
      const inward_rate =
        new_inward_qty > 0 ? new_inward_value / new_inward_qty : 0;
      const outward_rate =
        new_outward_qty > 0 ? new_outward_value / new_outward_qty : 0;

      await db.collection("batch_allocation").updateOne(
        { id: move.batch_id, item_id: detail.item_id },
        {
          $set: {
            inward_qty: new_inward_qty,
            inward_value: new_inward_value,
            inward_rate,
            outward_qty: new_outward_qty,
            outward_value: new_outward_value,
            outward_rate,
            closing_qty,
            closing_rate,
            closing_value,
            updated_at: new Date(),
          },
        },
      );
    }
  }
}

/**
 * Ensure ledger master balance fields use signed format.
 */
async function createOpeningBalanceEntry(ledgerId, companyId) {
  const db = getDb();

  const ledger = await db.collection("ledgers").findOne({
    id: ledgerId,
    company_id: companyId,
  });

  if (!ledger) {
    return null;
  }

  const inferredType =
    ledger.balance_type || (Number(ledger.opening || 0) < 0 ? "debit" : "credit");

  const opening =
    ledger.opening !== undefined
      ? Number(ledger.opening) || 0
      : inferredType === "debit"
        ? -Math.abs(Number(ledger.opening_balance || 0))
        : Math.abs(Number(ledger.opening_balance || 0));

  const credit = Math.abs(Number(ledger.credit || 0));
  const debit = -Math.abs(Number(ledger.debit || 0));
  const closing = opening + credit + debit;

  await db.collection("ledgers").updateOne(
    { id: ledgerId, company_id: companyId },
    {
      $set: {
        opening,
        credit,
        debit,
        closing,
        updated_at: new Date(),
      },
      $unset: {
        opening_balance: "",
        balance_type: "",
      },
    },
  );

  return { ledger_id: ledgerId, opening, credit, debit, closing };
}

/**
 * Create "on account" opening balance entry for billwise-enabled ledgers
 * Similar to batch allocations for items, but for billwise ledger opening balance
 */
export async function createOnAccountOpeningBalance(ledgerId, companyId) {
  const db = getDb();

  const ledger = await db.collection("ledgers").findOne({
    id: ledgerId,
    company_id: companyId,
  });

  if (!ledger || !ledger.is_billwise) {
    return null;
  }

  const opening = Number(ledger.opening || 0);
  const existingAllocations = Array.isArray(ledger.bill_allocations)
    ? ledger.bill_allocations
    : [];

  if (existingAllocations.length === 0 && opening !== 0) {
    await db.collection("ledgers").updateOne(
      { id: ledgerId, company_id: companyId },
      {
        $set: {
          bill_allocations: [
            {
              id: uuidv4(),
              bill_reference: "",
              bill_type: "Opening",
              amount: opening,
              bill_date: null,
            },
          ],
          updated_at: new Date(),
        },
      },
    );
  }

  return { ledger_id: ledgerId, opening };
}
async function determineDeemedPositive(
  ledgerId,
  debitAmount,
  creditAmount,
  db,
  voucherType,
) {
  // Per Tally standard:
  // isDeemedPositive = "yes" for DEBIT balance type ledgers (Assets/Receivables)
  // isDeemedPositive = "no" for CREDIT balance type ledgers (Liabilities/Payables)

  const numericDebit = absNumber(debitAmount);
  const numericCredit = absNumber(creditAmount);
  const hasDebit = numericDebit > 0;
  const hasCredit = numericCredit > 0;

  // Always trust explicit entry side first.
  // Debit entry  -> isDeemedPositive "yes"
  // Credit entry -> isDeemedPositive "no"
  if (hasDebit && !hasCredit) {
    return "yes";
  }

  if (hasCredit && !hasDebit) {
    return "no";
  }

  // For Credit Note (sales return):
  // - Customer (Credit balance type) → isDeemedPositive = "no"
  // - Other ledgers → isDeemedPositive = "yes"
  if (voucherType === "credit-note") {
    const ledger = await db.collection("ledgers").findOne({ id: ledgerId });

    if (ledger) {
      // Check if it's a customer/receivable ledger (balance_type = "credit")
      const debtorGroups = await db
        .collection("groups")
        .find({
          company_id: ledger.company_id,
          name: { $regex: "debtors|customers|receivable", $options: "i" },
        })
        .toArray();

      const isCustomerLedger = debtorGroups.some(
        (g) => g.id === ledger.group_id,
      );

      // Customer ledger in credit note: balance_type = "credit" → isDeemedPositive = "no"
      if (isCustomerLedger) {
        return "no";
      }
    }

    // For other ledgers in credit note: isDeemedPositive = "yes"
    return "yes";
  }

  // For Debit Note (purchase return):
  // - Supplier (Debit balance type) → isDeemedPositive = "yes"
  // - Other ledgers → isDeemedPositive = "no"
  if (voucherType === "debit-note") {
    const ledger = await db.collection("ledgers").findOne({ id: ledgerId });

    if (ledger) {
      // Check if it's a supplier/payable ledger (balance_type = "debit")
      const creditorGroups = await db
        .collection("groups")
        .find({
          company_id: ledger.company_id,
          name: { $regex: "creditors|suppliers|payable", $options: "i" },
        })
        .toArray();

      const isSupplierLedger = creditorGroups.some(
        (g) => g.id === ledger.group_id,
      );

      // Supplier ledger in debit note: balance_type = "debit" → isDeemedPositive = "yes"
      if (isSupplierLedger) {
        return "yes";
      }
    }

    // For other ledgers in debit note: isDeemedPositive = "no"
    return "no";
  }

  // Default to credit side when no explicit debit/credit is available.
  return "no";
}

/**
 * Determine isparty and isinventory flags for a ledger entry
 * isparty: "yes" for supplier/customer ledgers, "no" for others
 * isinventory: "yes" for sales/purchase ledgers, "no" for others
 */
async function determineLedgerFlags(ledgerId, db) {
  const ledger = await db.collection("ledgers").findOne({ id: ledgerId });

  if (!ledger) {
    return { isparty: "no", isinventory: "no" };
  }

  const company_id = ledger.company_id;

  // Determine if this is a party ledger (Supplier/Customer)
  let isparty = "no";
  const partyGroups = await db
    .collection("groups")
    .find({
      company_id,
      name: {
        $regex: "debtors|customers|creditors|suppliers|receivable|payable",
        $options: "i",
      },
    })
    .toArray();

  if (partyGroups.some((g) => g.id === ledger.group_id)) {
    isparty = "yes";
  }

  // Determine if this is an inventory ledger (Sales/Purchase)
  let isinventory = "no";
  const inventoryGroups = await db
    .collection("groups")
    .find({
      company_id,
      name: { $regex: "sales|purchase|purchases", $options: "i" },
    })
    .toArray();

  if (inventoryGroups.some((g) => g.id === ledger.group_id)) {
    isinventory = "yes";
  }

  return { isparty, isinventory };
}

/**
 * Validate that total debits equal total credits in voucher
 * As per Tally standard double-entry accounting
 */
function validateDebitCreditBalance(ledgerEntries) {
  let totalDebit = 0;
  let totalCredit = 0;

  for (const entry of ledgerEntries || []) {
    const debitAmount = absNumber(entry?.debit_amount);
    const creditAmount = absNumber(entry?.credit_amount);

    if (debitAmount > 0) {
      totalDebit += debitAmount;
    }

    if (creditAmount > 0) {
      totalCredit += creditAmount;
    }
  }

  // Check if debit and credit balance
  // Allow small floating point differences (0.01)
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = difference < 0.01;

  return {
    isBalanced,
    totalDebit,
    totalCredit,
    difference,
    message: isBalanced
      ? "Debit and Credit are balanced"
      : `Debit (${totalDebit.toFixed(2)}) and Credit (${totalCredit.toFixed(
          2,
        )}) do not match. Difference: ${difference.toFixed(2)}`,
  };
}

async function attachInventoryAccountingAllocations(
  inventoryEntries,
  ledgerEntries,
  db,
) {
  const inventoryLedgerEntries = (ledgerEntries || []).filter(
    (entry) => String(entry?.isinventory || "no").toLowerCase() === "yes",
  );

  if (!Array.isArray(inventoryEntries) || inventoryEntries.length === 0) {
    return inventoryEntries || [];
  }

  if (inventoryLedgerEntries.length === 0) {
    return inventoryEntries.map((inventoryEntry) => ({
      ...inventoryEntry,
      accounting_allocation: [],
    }));
  }

  const totalInventoryLedgerAmount = inventoryLedgerEntries.reduce(
    (sum, entry) => sum + absNumber(entry.amount),
    0,
  );

  return inventoryEntries.map((inventoryEntry) => {
    const lineAmount = absNumber(
      inventoryEntry.net_amount ?? inventoryEntry.amount ?? 0,
    );

    const accountingAllocation = inventoryLedgerEntries.map((entry) => {
      const entryAmount = absNumber(entry.amount);
      const allocatedAmount =
        totalInventoryLedgerAmount > 0
          ? (lineAmount * entryAmount) / totalInventoryLedgerAmount
          : lineAmount;

      return {
        ledger_id: entry.ledger_id || "",
        amount: allocatedAmount,
        Isdeemedpsitive: entry.isDeemedPositive || "no",
      };
    });

    return {
      ...inventoryEntry,
      accounting_allocation: accountingAllocation,
    };
  });
}

/**
 * Transform frontend payload to Tally-standard single voucher collection format
 * Converts multiple collections into one unified voucher document
 * Also enriches inventory entries with batch allocation information
 */
async function transformVoucherPayload(payload) {
  const db = getDb();
  console.log("[TRANSFORM] Converting payload to Tally-standard format");
  console.log(
    "[TRANSFORM] Payload details count:",
    Array.isArray(payload.details) ? payload.details.length : 0,
  );
  console.log(
    "[TRANSFORM] Payload ledger_entries count:",
    Array.isArray(payload.ledger_entries) ? payload.ledger_entries.length : 0,
  );

  if (
    Array.isArray(payload.ledger_entries) &&
    payload.ledger_entries.length > 0
  ) {
    console.log("[TRANSFORM] Ledger entries from payload:");
    for (let i = 0; i < Math.min(5, payload.ledger_entries.length); i++) {
      const e = payload.ledger_entries[i];
      console.log(
        `  [${i}] ledger_id: ${e.ledger_id}, debit: ${e.debit_amount}, credit: ${e.credit_amount}`,
      );
    }
  }

  // Separate inventory (items with batch) and ledger entries
  const inventoryEntries = [];
  const ledgerEntries = [];

  if (Array.isArray(payload.details) && payload.details.length > 0) {
    for (const detail of payload.details) {
      if (detail.item_id) {
        // Get item details to check if batches are enabled
        const item = await db
          .collection("item_master")
          .findOne({ id: detail.item_id });
        const batchesEnabled = item?.enable_batches === true;

        const hasSelectedAllocations =
          Array.isArray(detail.batch_allocations) &&
          detail.batch_allocations.some((alloc) => alloc?.batch_id);

        // Determine batch_id
        let batchId = detail.batch_id || null;

        if (!batchId && hasSelectedAllocations) {
          const firstAllocated = detail.batch_allocations.find(
            (alloc) => alloc?.batch_id,
          );
          batchId = firstAllocated?.batch_id || null;
        }

        // If no batch is selected and no explicit allocations, use primary batch.
        if (!batchId && !hasSelectedAllocations) {
          console.log(
            `[TRANSFORM] Item ${detail.item_id} - no batch selected, using primary batch`,
          );
          const primaryBatch = await getPrimaryBatchForItem(
            detail.item_id,
            payload.company_id,
          );
          batchId = primaryBatch.id;
        }

        // Fetch batch_number from batch_allocation collection
        let batchNumber = detail.batch_number || null;
        if (batchId && !batchNumber) {
          const batch = await db
            .collection("batch_allocation")
            .findOne({ id: batchId });
          batchNumber = batch?.batch_number || null;
        }

        // Inventory entry - has item with batch details and allocations array
        // If batch_allocations from frontend is provided (from dialog), use it
        // Otherwise, create from batch_id (backward compatibility)
        const allocations =
          hasSelectedAllocations
            ? detail.batch_allocations.filter((alloc) => alloc?.batch_id)
            : batchId
              ? [
                  {
                    batch_id: batchId,
                    batch_number: batchNumber,
                    qty: detail.batch_qty || detail.quantity || 0,
                    rate: detail.rate || 0,
                    amount:
                      (detail.batch_qty || detail.quantity || 0) *
                      (detail.rate || 0),
                  },
                ]
              : [];

        inventoryEntries.push({
          item_id: detail.item_id,
          quantity: detail.quantity || 0,
          rate: detail.rate || 0,
          amount: detail.amount || 0,
          discount_percent: detail.discount_percent || 0,
          discount_amount: detail.discount_amount || 0,
          tax_percent: detail.tax_percent || 0,
          tax_amount: detail.tax_amount || 0,
          net_amount: detail.net_amount || 0,
          batch_id: batchId,
          batch_qty: detail.batch_qty || null,
          batch_allocations: allocations,
        });
      } else if (detail.ledger_id) {
        // Ledger entry - only ledger_id and amount
        // Calculate amount from debit_amount and credit_amount if amount not provided
        const amount = resolveLedgerEntryAmount(detail);

        // Determine isDeemedPositive based on ledger group nature
        const isDeemedPositive = await determineDeemedPositive(
          detail.ledger_id,
          detail.debit_amount || 0,
          detail.credit_amount || 0,
          db,
          payload.voucher_type,
        );

        // Determine isparty and isinventory flags
        const { isparty, isinventory } = await determineLedgerFlags(
          detail.ledger_id,
          db,
        );

        ledgerEntries.push({
          ledger_id: detail.ledger_id,
          amount: amount,
          net_amount: detail.net_amount || amount,
          isDeemedPositive: isDeemedPositive,
          isparty: isparty,
          isinventory: isinventory,
          billallocation: detail.billallocation || [],
        });
      }
    }
  }

  // Add any explicit ledger entries from payload.ledger_entries
  // These include supplier/customer and purchase/sales ledgers
  if (
    Array.isArray(payload.ledger_entries) &&
    payload.ledger_entries.length > 0
  ) {
    for (const entry of payload.ledger_entries) {
      // Check if this ledger already exists in ledgerEntries
      const existingIndex = ledgerEntries.findIndex(
        (e) => e.ledger_id === entry.ledger_id,
      );

      const explicitIsDeemedPositive = String(entry?.isDeemedPositive || "")
        .trim()
        .toLowerCase();
      const resolvedIsDeemedPositive =
        explicitIsDeemedPositive === "yes" || explicitIsDeemedPositive === "no"
          ? explicitIsDeemedPositive
          : await determineDeemedPositive(
              entry.ledger_id,
              entry.debit_amount || 0,
              entry.credit_amount || 0,
              db,
              payload.voucher_type,
            );

      if (existingIndex === -1) {
        // Ledger doesn't exist, add it
        // Determine isparty and isinventory flags
        const { isparty, isinventory } = await determineLedgerFlags(
          entry.ledger_id,
          db,
        );

        ledgerEntries.push({
          ledger_id: entry.ledger_id,
          amount: resolveLedgerEntryAmount(entry),
          net_amount: absNumber(
            entry.net_amount ?? entry.amount ?? entry.debit_amount ?? entry.credit_amount ?? 0,
          ),
          isDeemedPositive: resolvedIsDeemedPositive,
          isparty: isparty,
          isinventory: isinventory,
          billallocation: entry.billallocation || [],
        });
      } else {
        // Ledger already exists from payload.details
        // Explicit payload.ledger_entries values must win when the same ledger exists.
        const existingEntry = ledgerEntries[existingIndex];
        const newAmount = resolveLedgerEntryAmount(entry);

        if (newAmount > 0) {
          existingEntry.amount = newAmount;
          existingEntry.net_amount = absNumber(
            entry.net_amount ?? entry.amount ?? entry.debit_amount ?? entry.credit_amount,
          );
        }

        existingEntry.isDeemedPositive = resolvedIsDeemedPositive;
        if (Array.isArray(entry.billallocation)) {
          existingEntry.billallocation = entry.billallocation;
        }
      }
    }
  }

  const enrichedInventoryEntries = await attachInventoryAccountingAllocations(
    inventoryEntries,
    ledgerEntries,
    db,
  );

  console.log("[TRANSFORM] Extracted:", {
    inventory_count: enrichedInventoryEntries.length,
    ledger_count: ledgerEntries.length,
  });

  if (ledgerEntries.length > 0) {
    console.log("[TRANSFORM] Final ledger entries:");
    for (let i = 0; i < ledgerEntries.length; i++) {
      const e = ledgerEntries[i];
      console.log(
        `  [${i}] ledger_id: ${e.ledger_id}, amount: ${e.amount}, isparty: ${e.isparty}, isinventory: ${e.isinventory}`,
      );
    }
  }

  return {
    inventory: enrichedInventoryEntries,
    ledger_entries: ledgerEntries,
  };
}

// Create or update voucher with Tally-standard single document structure
export async function createVoucherWithDetails(payload) {
  const db = getDb();
  const id = payload.id || uuidv4();

  console.log("[CREATE VOUCHER] Payload received:", {
    voucher_type: payload.voucher_type,
    company_id: payload.company_id,
    voucher_number: payload.voucher_number,
  });

  // Validate debit/credit balance before creating voucher
  const balanceValidation = validateDebitCreditBalance(payload.ledger_entries);
  console.log("[CREATE VOUCHER] Debit/Credit Validation:", balanceValidation);

  if (!balanceValidation.isBalanced) {
    throw new Error(
      `Voucher cannot be saved. ${balanceValidation.message}. Please ensure debits equal credits before saving.`,
    );
  }

  // Transform payload to Tally-standard format (now async to enrich batch data)
  const { inventory, ledger_entries } = await transformVoucherPayload(payload);

  console.log("[CREATE VOUCHER] Transformed ledger_entries:", {
    count: ledger_entries?.length || 0,
    entries: ledger_entries?.map((e) => ({
      ledger_id: e.ledger_id,
      amount: e.amount,
      billallocation_count: e.billallocation?.length || 0,
    })),
  });

  // Create single voucher document
  const voucher = {
    id,
    voucher_number: payload.voucher_number,
    voucher_date: payload.voucher_date,
    voucher_type: payload.voucher_type, // purchase, sales, payment, receipt
    company_id: payload.company_id,
    ledger_id: payload.ledger_id, // Main ledger (supplier/customer)
    reference_number: payload.reference_number || "",
    reference_date: payload.reference_date || null,
    narration: payload.narration || "",

    // Inventory entries - items with batch details
    inventory: inventory,

    // Ledger entries - only ledger_id and amount
    ledger_entries: ledger_entries,

    // Summary totals
    total_amount: payload.total_amount || 0,
    tax_amount: payload.tax_amount || 0,
    net_amount: payload.net_amount || 0,

    // Metadata
    created_at: new Date(),
    updated_at: new Date(),
  };

  console.log("[CREATE VOUCHER] Inserting voucher:", {
    voucher_id: voucher.id,
    inventory_count: voucher.inventory.length,
    ledger_count: voucher.ledger_entries.length,
  });

  // Insert as single document in vouchers collection
  const res = await db.collection("vouchers").insertOne(voucher);
  if (!res.acknowledged) throw new Error("Failed to insert voucher");

  // Update batch allocations for inventory items
  console.log("[CREATE VOUCHER] Updating batch allocations...");
  await updateBatchAllocationsForVoucher(inventory, payload.voucher_type);

  // Handle payment/receipt bill allocations from ledger_entries.billallocation.
  const isSettlementVoucher = ["payment", "receipt"].includes(
    String(voucher.voucher_type || "").toLowerCase(),
  );
  const settlementBillAllocations = isSettlementVoucher
    ? extractSettlementBillAllocationsFromLedgerEntries(
        ledger_entries,
      )
    : [];

  if (settlementBillAllocations.length > 0) {
    console.log("[CREATE VOUCHER] Processing bill allocations...");
    await applyVoucherAllocationsToBills({
      db,
      companyId: voucher.company_id,
      voucherType: voucher.voucher_type,
      voucherDate: voucher.voucher_date,
      voucherId: voucher.id,
      voucherNumber: voucher.voucher_number,
      allocations: settlementBillAllocations,
      reverse: false,
    });

    console.log(
      "[CREATE VOUCHER] Processed",
      settlementBillAllocations.length,
      "bill allocations",
    );
  }

  // Insert ledger entries into separate ledger_entries collection
  console.log(
    "[CREATE VOUCHER] Writing ledger entries to ledger_entries collection...",
  );
  if (ledger_entries && ledger_entries.length > 0) {
    const entriesToInsert = [];
    const billsToInsert = [];
    const billCollection = db.collection("bills");
    const isSettlementVoucherForEntry = ["payment", "receipt"].includes(
      String(voucher.voucher_type || "").toLowerCase(),
    );

    for (const entry of ledger_entries) {
      // Check if ledger has billwise enabled
      const ledger = await db.collection("ledgers").findOne({
        id: entry.ledger_id,
        company_id: voucher.company_id,
      });

      // Debug logging - detailed
      if (!ledger) {
        console.warn(
          `[CREATE VOUCHER] Ledger not found for ID: ${entry.ledger_id}, company: ${voucher.company_id}`,
        );
      } else {
        console.log(
          `[CREATE VOUCHER] Found ledger: ${ledger.name || ledger.id}`,
        );
        console.log(
          `[CREATE VOUCHER]   is_billwise field value: "${
            ledger.is_billwise
          }" (type: ${typeof ledger.is_billwise})`,
        );
        console.log(`[CREATE VOUCHER]   entry.amount: ${entry.amount}`);
      }

      // Check is_billwise - handle both boolean and string
      const isBillwise =
        ledger?.is_billwise === true ||
        ledger?.is_billwise === "true" ||
        (typeof ledger?.is_billwise === "string" &&
          ledger.is_billwise.toLowerCase() === "true");

      console.log(
        `[CREATE VOUCHER] Ledger ${entry.ledger_id}: is_billwise=${
          ledger?.is_billwise
        }, amount=${
          entry.amount
        }, isBillwise=${isBillwise}, willCreateAllocation=${
          isBillwise && entry.amount > 0
        }`,
      );

      // Prepare billallocations
      // Note: One ledger entry can have multiple bill references
      // and the same bill reference can exist in different ledgers
      // Opening balance is set only once when bill reference is created,
      // then only credit/debit are updated from vouchers
      let billallocations = [];
      const hasExplicitBillAllocations =
        isBillwise &&
        Array.isArray(entry.billallocation) &&
        entry.billallocation.length > 0;
      const shouldAutoOnAccountForSettlement =
        isSettlementVoucherForEntry &&
        isBillwise &&
        absNumber(entry.amount) > 0 &&
        !hasExplicitBillAllocations;

      if (hasExplicitBillAllocations) {
        // Use explicitly provided bill allocations and post movement to bills collection.
        for (const billalloc of entry.billallocation) {
          const billReference = resolveBillReference(voucher, billalloc.bill_reference);
          const existingAllocation = await db.collection("bills").findOne({
            ledger_id: entry.ledger_id,
            bill_reference: billReference,
            company_id: voucher.company_id,
          });

          const explicitCredit = absNumber(billalloc.credit || 0);
          const explicitDebit = absNumber(billalloc.debit || 0);
          const fallbackAmount =
            billalloc.amount !== undefined && billalloc.amount !== null
              ? billalloc.amount
              : entry.amount || 0;
          const signedTxnAmount =
            explicitCredit > 0 || explicitDebit > 0
              ? explicitCredit - explicitDebit
              : getSignedAmountByIsDeemedPositive(
                  entry.isDeemedPositive,
                  fallbackAmount,
                );

          const { opening, credit, debit, closing, isNewReference } =
            computeVoucherBillRollup(
              existingAllocation,
              signedTxnAmount,
              voucher.id,
            );

          const requestedBillType = String(billalloc.bill_type || "")
            .trim()
            .toUpperCase();
          const billType =
            requestedBillType === "ON ACCOUNTS" || requestedBillType === "ON ACCOUNT"
              ? BILL_TYPE_ON_ACCOUNT
              : isNewReference
                ? "New Ref"
                : billalloc.bill_type || existingAllocation.bill_type || "Against Ref";
          const resolvedBillAllocationId =
            existingAllocation?.id || billalloc.id || uuidv4();
          const signedBillAmount = resolveSignedBillAllocationAmount(
            entry,
            billalloc,
            entry.amount || 0,
          );

          billallocations.push(
            normalizeVoucherBillAllocation({
              source: billalloc,
              resolvedId: resolvedBillAllocationId,
              billReference,
              billType,
              billDate: billalloc.bill_date || voucher.voucher_date,
              signedAmount: signedBillAmount,
            }),
          );

          if (!isSettlementVoucherForEntry) {
            billsToInsert.push({
              id: resolvedBillAllocationId,
              voucher_id: voucher.id,
              voucher_number: voucher.voucher_number,
              ledger_id: entry.ledger_id,
              bill_reference: billReference,
              bill_type: billType,
              opening,
              credit,
              debit,
              closing,
              source: "invoice",
              company_id: voucher.company_id,
              bill_date: voucher.voucher_date,
              created_at: existingAllocation?.created_at || new Date(),
              updated_at: new Date(),
            });
          }
        }

        console.log(
          `[CREATE VOUCHER] Processed explicit billallocations: ${entry.billallocation.length} entries for ledger ${entry.ledger_id}`,
        );
      } else if (shouldAutoOnAccountForSettlement) {
        const settledAmount = getSignedAmountByIsDeemedPositive(
          entry.isDeemedPositive,
          entry.amount || 0,
        );

        billallocations = [
          normalizeVoucherBillAllocation({
            source: null,
            resolvedId: uuidv4(),
            billReference: "",
            billType: BILL_TYPE_ON_ACCOUNT,
            billDate: voucher.voucher_date,
            signedAmount: settledAmount,
          }),
        ];

        console.log(
          `[CREATE VOUCHER] Auto-created On Account billallocation for settlement ledger ${entry.ledger_id}`,
        );
      } else if (!isBillwise && absNumber(entry.amount) > 0) {
        const existingOnAccountAllocation = await db.collection("bills").findOne({
          ledger_id: entry.ledger_id,
          bill_reference: "",
          company_id: voucher.company_id,
        });

        const signedTxnAmount = getSignedAmountByIsDeemedPositive(
          entry.isDeemedPositive,
          entry.amount || 0,
        );

        const { opening, credit, debit, closing } = computeVoucherBillRollup(
          existingOnAccountAllocation,
          signedTxnAmount,
          voucher.id,
        );

        const onAccountId = existingOnAccountAllocation?.id || uuidv4();
        const billallocData = normalizeVoucherBillAllocation({
          source: null,
          resolvedId: onAccountId,
          billReference: "",
          billType: BILL_TYPE_ON_ACCOUNT,
          billDate: voucher.voucher_date,
          signedAmount: signedTxnAmount,
        });

        billallocations = [billallocData];

        billsToInsert.push({
          id: onAccountId,
          voucher_id: voucher.id,
          voucher_number: voucher.voucher_number,
          ledger_id: entry.ledger_id,
          bill_reference: "",
          bill_type: BILL_TYPE_ON_ACCOUNT,
          opening,
          credit,
          debit,
          closing,
          source: "invoice",
          company_id: voucher.company_id,
          bill_date: voucher.voucher_date,
          created_at: existingOnAccountAllocation?.created_at || new Date(),
          updated_at: new Date(),
        });

        console.log(
          `[CREATE VOUCHER] Auto-posted ON ACCOUNTS for non-billwise ledger ${entry.ledger_id}`,
        );
      } else if (!isSettlementVoucherForEntry && isBillwise && entry.amount > 0) {
        // Auto-add billallocation for billwise ledgers with ledger balance tracking
        // Creates a single default billallocation if none provided
        const billAllocationId = uuidv4();
        const billReference = resolveBillReference(voucher);

        // Check if this bill reference already exists
        const existingAllocation = await db.collection("bills").findOne({
          ledger_id: entry.ledger_id,
          bill_reference: billReference,
          company_id: voucher.company_id,
        });

        const signedTxnAmount = getSignedAmountByIsDeemedPositive(
          entry.isDeemedPositive,
          entry.amount || 0,
        );

        const { opening, credit, debit, closing, isNewReference } =
          computeVoucherBillRollup(
            existingAllocation,
            signedTxnAmount,
            voucher.id,
          );

        if (existingAllocation) {
          console.log(
            `[CREATE VOUCHER] Updating existing auto billallocation for ledger ${
              ledger.name || entry.ledger_id
            }: bill_ref=${billReference}, opening=${opening}, credit=${credit}, debit=${debit}`,
          );
        } else {
          console.log(
            `[CREATE VOUCHER] Creating new auto billallocation for ledger ${
              ledger.name || entry.ledger_id
            }: bill_ref=${billReference}, opening=${opening}, credit=${credit}, debit=${debit}`,
          );
        }

        const autoBillType = isNewReference ? "New Ref" : existingAllocation.bill_type || "Against Ref";
        const signedBillAmount = getSignedAmountByIsDeemedPositive(
          entry.isDeemedPositive,
          entry.amount || 0,
        );

        const billallocData = normalizeVoucherBillAllocation({
          source: null,
          resolvedId: existingAllocation?.id || billAllocationId,
          billReference,
          billType: autoBillType,
          billDate: voucher.voucher_date,
          signedAmount: signedBillAmount,
        });

        billallocations = [billallocData];

        // Also add to bills collection (will be upserted if exists)
        billsToInsert.push({
          id: existingAllocation?.id || billAllocationId,
          voucher_id: voucher.id,
          voucher_number: voucher.voucher_number,
          ledger_id: entry.ledger_id,
          bill_reference: billReference,
          bill_type: autoBillType,
          opening,
          credit,
          debit,
          closing,
          source: "invoice",
          company_id: voucher.company_id,
          bill_date: voucher.voucher_date,
          created_at: existingAllocation?.created_at || new Date(),
          updated_at: new Date(),
        });
      }

      entriesToInsert.push({
        id: uuidv4(),
        voucher_id: voucher.id,
        voucher_number: voucher.voucher_number,
        voucher_date: voucher.voucher_date,
        voucher_type: voucher.voucher_type,
        company_id: voucher.company_id,
        ledger_id: entry.ledger_id,
        amount: absNumber(entry.amount),
        narration: voucher.narration || "",
        isDeemedPositive: entry.isDeemedPositive || "no",
        isparty: entry.isparty || "no",
        isinventory: entry.isinventory || "no",
        billallocation: billallocations,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    // Insert or update bills in bills collection
    if (billsToInsert.length > 0) {
      try {
        const billAllocCollection = db.collection("bills");

        // Use upsert for each bill allocation to handle both insert and update
        for (const billAlloc of billsToInsert) {
          await billAllocCollection.updateOne(
            {
              ledger_id: billAlloc.ledger_id,
              bill_reference: billAlloc.bill_reference,
              company_id: billAlloc.company_id,
            },
            {
              $set: billAlloc,
              $unset: {
                invoice_voucher_id: "",
                invoice_voucher_number: "",
                payment_voucher_id: "",
                payment_voucher_number: "",
              },
            },
            { upsert: true },
          );
        }

        console.log(
          "[CREATE VOUCHER] Upserted",
          billsToInsert.length,
          "bill allocations to bills collection",
        );
      } catch (billError) {
        console.error(
          "[CREATE VOUCHER] Error upserting bill allocations:",
          billError.message,
        );
        // Don't throw - continue processing even if bill allocation fails
      }
    }

    if (entriesToInsert.length > 0) {
      // Persist enriched ledger entries directly inside voucher document.
      console.log(
        "[CREATE VOUCHER] Updating voucher with enriched ledger_entries...",
      );
      await db
        .collection("vouchers")
        .updateOne(
          { id: voucher.id },
          { $set: { ledger_entries: entriesToInsert } },
        );
      console.log(
        "[CREATE VOUCHER] ✅ Voucher ledger_entries updated with billallocations",
      );
    }
  }

  // Create opening balance entries for main ledger if not already created
  console.log("[CREATE VOUCHER] Processing opening balance...");
  try {
    if (voucher.ledger_id) {
      await createOpeningBalanceEntry(voucher.ledger_id, voucher.company_id);
    }
  } catch (openingBalanceError) {
    console.log(
      "[CREATE VOUCHER] Opening balance already exists or not needed:",
      openingBalanceError.message,
    );
  }

  // Process inventory: update item stock levels
  console.log("[CREATE VOUCHER] Updating item stock levels...");
  try {
    // Update stock levels for all items in voucher
    if (Array.isArray(voucher.inventory)) {
      for (const item of voucher.inventory) {
        if (item.item_id) {
          await updateItemStockLevels(item.item_id);
        }
      }
    }
    console.log("[CREATE VOUCHER] Item stock levels updated successfully");
  } catch (stockError) {
    console.error(
      "[CREATE VOUCHER] Error updating stock levels:",
      stockError.message,
    );
    // Don't throw - stock update errors shouldn't fail voucher creation
  }

  // Fetch complete voucher from database with all ledger entries and billallocations
  console.log(
    "[CREATE VOUCHER] Fetching complete voucher with ledger entries...",
  );
  const completeVoucher = await db.collection("vouchers").findOne({ id });

  try {
    await recalculateLedgerBalancesFromVouchers(voucher.company_id);
  } catch (ledgerBalanceError) {
    console.error(
      "[CREATE VOUCHER] Failed to refresh ledger balances:",
      ledgerBalanceError.message,
    );
  }

  if (completeVoucher) {
    console.log(
      "[CREATE VOUCHER] ✅ Returning complete voucher with ledger entries",
    );
    return completeVoucher;
  } else {
    console.log(
      "[CREATE VOUCHER] ⚠️ Complete voucher not found, returning original voucher",
    );
    return voucher;
  }
}

export async function updateVoucherWithDetails(id, payload) {
  const db = getDb();

  console.log("[UPDATE VOUCHER] Updating voucher:", id);

  // Get old voucher to reverse batch allocations
  const oldVoucher = await db.collection("vouchers").findOne({ id });
  if (!oldVoucher) throw new Error("Voucher not found");

  // Reverse old batch allocations
  console.log("[UPDATE VOUCHER] Reversing old batch allocations...");
  await reverseBatchAllocations(
    oldVoucher.inventory || [],
    oldVoucher.voucher_type,
    oldVoucher.company_id,
  );

  // Transform new payload (now async to enrich batch data)
  const { inventory, ledger_entries } = await transformVoucherPayload(payload);

  // Update voucher document
  const updatedVoucher = {
    ...oldVoucher,
    voucher_number: payload.voucher_number,
    voucher_date: payload.voucher_date,
    voucher_type: payload.voucher_type,
    company_id: payload.company_id,
    ledger_id: payload.ledger_id,
    reference_number: payload.reference_number || "",
    reference_date: payload.reference_date || null,
    narration: payload.narration || "",
    inventory: inventory,
    ledger_entries: ledger_entries,
    total_amount: payload.total_amount || 0,
    tax_amount: payload.tax_amount || 0,
    net_amount: payload.net_amount || 0,
    updated_at: new Date(),
  };

  // Reverse previous settlement bill allocations before applying edited values.
  const isSettlementVoucher = ["payment", "receipt"].includes(
    String(oldVoucher.voucher_type || "").toLowerCase(),
  );
  const previousSettlementBillAllocations = isSettlementVoucher
    ? extractSettlementBillAllocationsFromLedgerEntries(
        oldVoucher.ledger_entries || [],
      )
    : [];

  if (previousSettlementBillAllocations.length > 0) {
    await applyVoucherAllocationsToBills({
      db,
      companyId: oldVoucher.company_id,
      voucherType: oldVoucher.voucher_type,
      voucherDate: oldVoucher.voucher_date,
      voucherId: oldVoucher.id,
      voucherNumber: oldVoucher.voucher_number,
      allocations: previousSettlementBillAllocations,
      reverse: true,
    });
  }

  const previousOnAccountsAllocations =
    extractOnAccountsBillAllocationsFromLedgerEntries(
      oldVoucher.ledger_entries || [],
    );

  if (previousOnAccountsAllocations.length > 0) {
    await reverseInvoiceOnAccountsOpeningInBills({
      db,
      companyId: oldVoucher.company_id,
      allocations: previousOnAccountsAllocations,
    });
  }

  const result = await db
    .collection("vouchers")
    .findOneAndUpdate(
      { id },
      {
        $set: updatedVoucher,
        $unset: {
          billallocations: "",
          allocations: "",
        },
      },
      { returnDocument: "after" },
    );

  if (!result.value) throw new Error("Failed to update voucher");

  console.log("[UPDATE VOUCHER] Syncing ledger entries in voucher document...");

  // Insert new ledger entries
  if (ledger_entries && ledger_entries.length > 0) {
    const entriesToInsert = [];
    const billsToInsert = [];
    const billCollection = db.collection("bills");
    const isSettlementVoucherForEntry = ["payment", "receipt"].includes(
      String(updatedVoucher.voucher_type || "").toLowerCase(),
    );

    for (const entry of ledger_entries) {
      // Check if ledger has billwise enabled
      const ledger = await db.collection("ledgers").findOne({
        id: entry.ledger_id,
        company_id: updatedVoucher.company_id,
      });

      // Debug logging
      if (!ledger) {
        console.warn(
          `[UPDATE VOUCHER] Ledger not found for ID: ${entry.ledger_id}, company: ${updatedVoucher.company_id}`,
        );
      }

      // Check is_billwise - handle both boolean and string
      const isBillwise =
        ledger?.is_billwise === true ||
        ledger?.is_billwise === "true" ||
        (typeof ledger?.is_billwise === "string" &&
          ledger.is_billwise.toLowerCase() === "true");

      console.log(
        `[UPDATE VOUCHER] Ledger ${entry.ledger_id}: is_billwise=${ledger?.is_billwise}, amount=${entry.amount}, isBillwise=${isBillwise}`,
      );

      // Prepare billallocations
      // Note: One ledger entry can have multiple bill references
      // and the same bill reference can exist in different ledgers
      // Opening balance is set only once when bill reference is created,
      // then only credit/debit are updated from vouchers
      let billallocations = [];
      const hasExplicitBillAllocations =
        isBillwise &&
        Array.isArray(entry.billallocation) &&
        entry.billallocation.length > 0;
      const shouldAutoOnAccountForSettlement =
        isSettlementVoucherForEntry &&
        isBillwise &&
        absNumber(entry.amount) > 0 &&
        !hasExplicitBillAllocations;

      if (hasExplicitBillAllocations) {
        // Use explicitly provided bill allocations and post movement to bills collection.
        for (const billalloc of entry.billallocation) {
          const billReference = resolveBillReference(
            updatedVoucher,
            billalloc.bill_reference,
          );
          const existingAllocation = await db.collection("bills").findOne({
            ledger_id: entry.ledger_id,
            bill_reference: billReference,
            company_id: updatedVoucher.company_id,
          });

          const explicitCredit = absNumber(billalloc.credit || 0);
          const explicitDebit = absNumber(billalloc.debit || 0);
          const fallbackAmount =
            billalloc.amount !== undefined && billalloc.amount !== null
              ? billalloc.amount
              : entry.amount || 0;
          const signedTxnAmount =
            explicitCredit > 0 || explicitDebit > 0
              ? explicitCredit - explicitDebit
              : getSignedAmountByIsDeemedPositive(
                  entry.isDeemedPositive,
                  fallbackAmount,
                );

          const { opening, credit, debit, closing, isNewReference } =
            computeVoucherBillRollup(
              existingAllocation,
              signedTxnAmount,
              id,
            );

          const requestedBillType = String(billalloc.bill_type || "")
            .trim()
            .toUpperCase();
          const billType =
            requestedBillType === "ON ACCOUNTS" || requestedBillType === "ON ACCOUNT"
              ? BILL_TYPE_ON_ACCOUNT
              : isNewReference
                ? "New Ref"
                : billalloc.bill_type || existingAllocation.bill_type || "Against Ref";
          const resolvedBillAllocationId =
            existingAllocation?.id || billalloc.id || uuidv4();
          const signedBillAmount = resolveSignedBillAllocationAmount(
            entry,
            billalloc,
            entry.amount || 0,
          );

          billallocations.push(
            normalizeVoucherBillAllocation({
              source: billalloc,
              resolvedId: resolvedBillAllocationId,
              billReference,
              billType,
              billDate: billalloc.bill_date || updatedVoucher.voucher_date,
              signedAmount: signedBillAmount,
            }),
          );

          if (!isSettlementVoucherForEntry) {
            billsToInsert.push({
              id: resolvedBillAllocationId,
              voucher_id: id,
              voucher_number: updatedVoucher.voucher_number,
              ledger_id: entry.ledger_id,
              bill_reference: billReference,
              bill_type: billType,
              opening,
              credit,
              debit,
              closing,
              source: "invoice",
              company_id: updatedVoucher.company_id,
              bill_date: updatedVoucher.voucher_date,
              created_at: existingAllocation?.created_at || new Date(),
              updated_at: new Date(),
            });
          }
        }

        console.log(
          `[UPDATE VOUCHER] Processed explicit billallocations: ${entry.billallocation.length} entries for ledger ${entry.ledger_id}`,
        );
      } else if (shouldAutoOnAccountForSettlement) {
        const settledAmount = getSignedAmountByIsDeemedPositive(
          entry.isDeemedPositive,
          entry.amount || 0,
        );

        billallocations = [
          normalizeVoucherBillAllocation({
            source: null,
            resolvedId: uuidv4(),
            billReference: "",
            billType: BILL_TYPE_ON_ACCOUNT,
            billDate: updatedVoucher.voucher_date,
            signedAmount: settledAmount,
          }),
        ];

        console.log(
          `[UPDATE VOUCHER] Auto-created On Account billallocation for settlement ledger ${entry.ledger_id}`,
        );
      } else if (!isBillwise && absNumber(entry.amount) > 0) {
        const existingOnAccountAllocation = await db.collection("bills").findOne({
          ledger_id: entry.ledger_id,
          bill_reference: "",
          company_id: updatedVoucher.company_id,
        });

        const signedTxnAmount = getSignedAmountByIsDeemedPositive(
          entry.isDeemedPositive,
          entry.amount || 0,
        );

        const { opening, credit, debit, closing } = computeVoucherBillRollup(
          existingOnAccountAllocation,
          signedTxnAmount,
          id,
        );

        const onAccountId = existingOnAccountAllocation?.id || uuidv4();
        const billallocData = normalizeVoucherBillAllocation({
          source: null,
          resolvedId: onAccountId,
          billReference: "",
          billType: BILL_TYPE_ON_ACCOUNT,
          billDate: updatedVoucher.voucher_date,
          signedAmount: signedTxnAmount,
        });

        billallocations = [billallocData];

        billsToInsert.push({
          id: onAccountId,
          voucher_id: id,
          voucher_number: updatedVoucher.voucher_number,
          ledger_id: entry.ledger_id,
          bill_reference: "",
          bill_type: BILL_TYPE_ON_ACCOUNT,
          opening,
          credit,
          debit,
          closing,
          source: "invoice",
          company_id: updatedVoucher.company_id,
          bill_date: updatedVoucher.voucher_date,
          created_at: existingOnAccountAllocation?.created_at || new Date(),
          updated_at: new Date(),
        });

        console.log(
          `[UPDATE VOUCHER] Auto-posted ON ACCOUNTS for non-billwise ledger ${entry.ledger_id}`,
        );
      } else if (!isSettlementVoucherForEntry && isBillwise && entry.amount > 0) {
        // Auto-add billallocation for billwise ledgers with ledger balance tracking
        // Creates a single default billallocation if none provided
        const billAllocationId = uuidv4();
        const billReference = resolveBillReference(updatedVoucher);

        // Check if this bill reference already exists
        const existingAllocation = await db.collection("bills").findOne({
          ledger_id: entry.ledger_id,
          bill_reference: billReference,
          company_id: updatedVoucher.company_id,
        });

        const signedTxnAmount = getSignedAmountByIsDeemedPositive(
          entry.isDeemedPositive,
          entry.amount || 0,
        );

        const { opening, credit, debit, closing, isNewReference } =
          computeVoucherBillRollup(
            existingAllocation,
            signedTxnAmount,
            id,
          );

        if (existingAllocation) {
          console.log(
            `[UPDATE VOUCHER] Updating existing auto billallocation for ledger ${
              ledger.name || entry.ledger_id
            }: bill_ref=${billReference}, opening=${opening}, credit=${credit}, debit=${debit}`,
          );
        } else {
          console.log(
            `[UPDATE VOUCHER] Creating new auto billallocation for ledger ${
              ledger.name || entry.ledger_id
            }: bill_ref=${billReference}, opening=${opening}, credit=${credit}, debit=${debit}`,
          );
        }

        const autoBillType = isNewReference ? "New Ref" : existingAllocation.bill_type || "Against Ref";
        const signedBillAmount = getSignedAmountByIsDeemedPositive(
          entry.isDeemedPositive,
          entry.amount || 0,
        );

        const billallocData = normalizeVoucherBillAllocation({
          source: null,
          resolvedId: existingAllocation?.id || billAllocationId,
          billReference,
          billType: autoBillType,
          billDate: updatedVoucher.voucher_date,
          signedAmount: signedBillAmount,
        });

        billallocations = [billallocData];

        // Also add to bills collection (will be upserted if exists)
        billsToInsert.push({
          id: existingAllocation?.id || billAllocationId,
          voucher_id: id,
          voucher_number: updatedVoucher.voucher_number,
          ledger_id: entry.ledger_id,
          bill_reference: billReference,
          bill_type: autoBillType,
          opening,
          credit,
          debit,
          closing,
          source: "invoice",
          company_id: updatedVoucher.company_id,
          bill_date: updatedVoucher.voucher_date,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }

      entriesToInsert.push({
        id: uuidv4(),
        voucher_id: id,
        voucher_number: updatedVoucher.voucher_number,
        voucher_date: updatedVoucher.voucher_date,
        voucher_type: updatedVoucher.voucher_type,
        company_id: updatedVoucher.company_id,
        ledger_id: entry.ledger_id,
        amount: absNumber(entry.amount),
        narration: updatedVoucher.narration || "",
        isDeemedPositive: entry.isDeemedPositive || "no",
        isparty: entry.isparty || "no",
        isinventory: entry.isinventory || "no",
        billallocation: billallocations,
        created_at: oldVoucher.created_at || new Date(),
        updated_at: new Date(),
      });
    }

    // Insert or update bills in bills collection
    if (billsToInsert.length > 0) {
      try {
        // Use upsert for each bill allocation to handle both insert and update
        for (const billAlloc of billsToInsert) {
          await billCollection.updateOne(
            {
              ledger_id: billAlloc.ledger_id,
              bill_reference: billAlloc.bill_reference,
              company_id: billAlloc.company_id,
            },
            {
              $set: billAlloc,
              $unset: {
                invoice_voucher_id: "",
                invoice_voucher_number: "",
                payment_voucher_id: "",
                payment_voucher_number: "",
                openingBalance: "",
                closingBalance: "",
              },
            },
            { upsert: true },
          );
        }

        console.log(
          "[UPDATE VOUCHER] Upserted",
          billsToInsert.length,
          "bill allocations to bills collection",
        );
      } catch (billError) {
        console.error(
          "[UPDATE VOUCHER] Error upserting bill allocations:",
          billError.message,
        );
        // Don't throw - continue processing even if bill allocation fails
      }
    }

    if (entriesToInsert.length > 0) {
      // Persist enriched ledger entries directly inside voucher document.
      console.log(
        "[UPDATE VOUCHER] Updating voucher with enriched ledger_entries...",
      );
      await db
        .collection("vouchers")
        .updateOne({ id }, { $set: { ledger_entries: entriesToInsert } });
      console.log(
        "[UPDATE VOUCHER] ✅ Voucher ledger_entries updated with billallocations",
      );
    }
  }

  // Apply edited settlement bill allocations from ledger_entries.billallocation.
  const nextSettlementBillAllocations = ["payment", "receipt"].includes(
    String(updatedVoucher.voucher_type || "").toLowerCase(),
  )
    ? extractSettlementBillAllocationsFromLedgerEntries(
        ledger_entries,
      )
    : [];

  if (nextSettlementBillAllocations.length > 0) {
    console.log("[UPDATE VOUCHER] Processing bill allocations...");
    await applyVoucherAllocationsToBills({
      db,
      companyId: updatedVoucher.company_id,
      voucherType: updatedVoucher.voucher_type,
      voucherDate: updatedVoucher.voucher_date,
      voucherId: id,
      voucherNumber: updatedVoucher.voucher_number,
      allocations: nextSettlementBillAllocations,
      reverse: false,
    });

    console.log(
      "[UPDATE VOUCHER] Processed",
      nextSettlementBillAllocations.length,
      "bill allocations",
    );
  }

  // Apply new batch allocations
  console.log("[UPDATE VOUCHER] Applying new batch allocations...");
  await updateBatchAllocationsForVoucher(
    updatedVoucher.inventory,
    updatedVoucher.voucher_type,
  );

  // Update item stock levels
  console.log("[UPDATE VOUCHER] Updating item stock levels...");
  if (Array.isArray(updatedVoucher.inventory)) {
    for (const item of updatedVoucher.inventory) {
      if (item.item_id) {
        await updateItemStockLevels(item.item_id);
      }
    }
  }

  // Fetch complete voucher from database with all ledger entries and billallocations
  console.log(
    "[UPDATE VOUCHER] Fetching complete voucher with ledger entries...",
  );
  const completeVoucher = await db.collection("vouchers").findOne({ id });

  try {
    await recalculateLedgerBalancesFromVouchers(updatedVoucher.company_id);
  } catch (ledgerBalanceError) {
    console.error(
      "[UPDATE VOUCHER] Failed to refresh ledger balances:",
      ledgerBalanceError.message,
    );
  }

  if (completeVoucher) {
    console.log(
      "[UPDATE VOUCHER] ✅ Returning complete voucher with ledger entries",
    );
    return completeVoucher;
  } else {
    console.log(
      "[UPDATE VOUCHER] ⚠️ Complete voucher not found, returning result.value",
    );
    return result.value;
  }
}

export async function getVouchersByCompany(
  companyId,
  voucherType = null,
  ledgerId = null,
  dateFrom = null,
  dateTo = null,
) {
  const db = getDb();
  const filter = { company_id: companyId };

  if (voucherType) {
    filter.voucher_type = voucherType;
  }

  if (ledgerId) {
    filter.ledger_id = ledgerId;
  }

  if (dateFrom && dateTo) {
    filter.voucher_date = {
      $gte: String(dateFrom),
      $lte: String(dateTo),
    };
  }

  console.log("[GET VOUCHERS BY COMPANY] Query filter:", filter);

  const result = await db
    .collection("vouchers")
    .find(filter)
    .sort({ voucher_date: -1 })
    .toArray();

  console.log("[GET VOUCHERS BY COMPANY] Found", result.length, "vouchers");
  if (result.length > 0) {
    console.log("[GET VOUCHERS BY COMPANY] First voucher sample:", {
      id: result[0].id,
      voucher_type: result[0].voucher_type,
      ledger_id: result[0].ledger_id,
      voucher_number: result[0].voucher_number,
      total_amount: result[0].total_amount,
      net_amount: result[0].net_amount,
      amount: result[0].amount,
    });
  }

  return result;
}

/**
 * Convert stored voucher format (with inventory/ledger_entries) back to editable format (with details)
 * This is needed when fetching a voucher for editing
 */
function convertVoucherToEditableFormat(voucher) {
  if (!voucher) return null;

  console.log("[CONVERT TO EDITABLE] Voucher ID:", voucher.id);
  console.log(
    "[CONVERT TO EDITABLE] Stored ledger_entries count:",
    Array.isArray(voucher.ledger_entries) ? voucher.ledger_entries.length : 0,
  );

  const details = [];

  // Convert inventory entries back to details format
  if (Array.isArray(voucher.inventory) && voucher.inventory.length > 0) {
    for (const inv of voucher.inventory) {
      details.push({
        item_id: inv.item_id,
        quantity: inv.quantity,
        rate: inv.rate,
        amount: inv.amount,
        discount_percent: inv.discount_percent || 0,
        discount_amount: inv.discount_amount || 0,
        tax_percent: inv.tax_percent || 0,
        tax_amount: inv.tax_amount || 0,
        net_amount: inv.net_amount || 0,
        batch_id: inv.batch_id || null,
        batch_number: inv.batch_allocations?.[0]?.batch_number || null,
        batch_qty: inv.batch_qty || null,
        batch_allocations: inv.batch_allocations || [],
        accounting_allocation: inv.accounting_allocation || [],
      });
    }
  }

  // Convert ledger entries back to details format
  if (
    Array.isArray(voucher.ledger_entries) &&
    voucher.ledger_entries.length > 0
  ) {
    console.log("[CONVERT TO EDITABLE] Processing ledger entries:");
    for (const entry of voucher.ledger_entries) {
      // Determine debit/credit based on isDeemedPositive
      // isDeemedPositive = "yes" → debit side (amount goes to debit_amount)
      // isDeemedPositive = "no" → credit side (amount goes to credit_amount)
      const isDeemedPositiveYes = entry.isDeemedPositive === "yes";

      const detail = {
        ledger_id: entry.ledger_id,
        amount: entry.amount,
        net_amount: entry.net_amount || entry.amount,
        isDeemedPositive: entry.isDeemedPositive || "no",
        isparty: entry.isparty || "no",
        isinventory: entry.isinventory || "no",
        billallocation: entry.billallocation || [],
        // Map amount to debit/credit based on isDeemedPositive
        debit_amount: isDeemedPositiveYes ? entry.amount || 0 : 0,
        credit_amount: isDeemedPositiveYes ? 0 : entry.amount || 0,
      };

      console.log(
        `  [${details.length}] ledger_id: ${detail.ledger_id}, isparty: ${detail.isparty}, isinventory: ${detail.isinventory}`,
      );
      details.push(detail);
    }
  }

  console.log("[CONVERT TO EDITABLE] Final details count:", details.length);

  // Return voucher in editable format with details array
  return {
    ...voucher,
    details: details,
    // Remove the stored format arrays - use details instead
    inventory: undefined,
    ledger_entries: undefined,
  };
}

export async function getVoucherById(id) {
  const db = getDb();
  // Single collection - everything is in one document
  const voucher = await db.collection("vouchers").findOne({ id });

  console.log("[GET VOUCHER BY ID] Fetched voucher:", id);
  if (voucher) {
    console.log(
      "[GET VOUCHER BY ID] Ledger entries in stored voucher:",
      Array.isArray(voucher.ledger_entries) ? voucher.ledger_entries.length : 0,
    );
  } else {
    console.log("[GET VOUCHER BY ID] Voucher not found:", id);
    return null;
  }

  // Convert to editable format with details array
  return convertVoucherToEditableFormat(voucher);
}

export async function deleteVoucher(id) {
  const db = getDb();

  console.log("[DELETE VOUCHER] Deleting voucher:", id);

  // Get voucher to reverse batch allocations
  const voucher = await db.collection("vouchers").findOne({ id });
  if (voucher) {
    const voucherBillAllocations = extractSettlementBillAllocationsFromLedgerEntries(
      voucher.ledger_entries || [],
    );

    // Reverse bill allocation movement first so bills closing/debit/credit remain accurate.
    if (voucherBillAllocations.length > 0) {
      console.log(
        "[DELETE VOUCHER] Reversing bill allocations in bills collection...",
      );
      await applyVoucherAllocationsToBills({
        db,
        companyId: voucher.company_id,
        voucherType: voucher.voucher_type,
        voucherDate: voucher.voucher_date,
        voucherId: voucher.id,
        voucherNumber: voucher.voucher_number,
        allocations: voucherBillAllocations,
        reverse: true,
      });
    }

    console.log("[DELETE VOUCHER] Reversing batch allocations...");
    await reverseBatchAllocations(
      voucher.inventory || [],
      voucher.voucher_type,
      voucher.company_id,
    );
  }

  const voucherCompanyId = voucher?.company_id;

  console.log("[DELETE VOUCHER] No separate ledger_entries collection cleanup needed");

  // Delete bill allocations for this voucher (from bills collection)
  console.log(
    "[DELETE VOUCHER] Deleting bill allocations from bills collection...",
  );
  const billDeleteRes = await db.collection("bills").deleteMany({
    $or: [
      { voucher_id: id },
      { invoice_voucher_id: id },
      { payment_voucher_id: id },
    ],
  });
  console.log(
    "[DELETE VOUCHER] Deleted",
    billDeleteRes.deletedCount,
    "bill allocations from bills",
  );

  // Delete from single vouchers collection
  const result = await db.collection("vouchers").deleteOne({ id });
  console.log("[DELETE VOUCHER] Deleted voucher from vouchers collection");

  if (voucherCompanyId) {
    try {
      await recalculateLedgerBalancesFromVouchers(voucherCompanyId);
    } catch (ledgerBalanceError) {
      console.error(
        "[DELETE VOUCHER] Failed to refresh ledger balances:",
        ledgerBalanceError.message,
      );
    }
  }

  return result.deletedCount > 0;
}

// Get voucher history report with optional filters
export async function getVoucherHistory(
  companyId,
  dateFrom,
  dateTo,
  voucherType,
) {
  const db = getDb();
  const match = {
    company_id: companyId,
    voucher_date: {
      $gte: dateFrom,
      $lte: dateTo,
    },
  };

  if (voucherType && voucherType !== "all") {
    match.voucher_type = voucherType;
  }

  const vouchers = await db
    .collection("vouchers")
    .aggregate([
      { $match: match },
      {
        $lookup: {
          from: "ledgers",
          localField: "ledger_id",
          foreignField: "id",
          as: "ledger",
        },
      },
      { $unwind: { path: "$ledger", preserveNullAndEmptyArrays: true } },
      { $sort: { voucher_date: -1 } },
      {
        $project: {
          id: 1,
          voucher_number: 1,
          voucher_date: 1,
          voucher_type: 1,
          "ledger.name": 1,
          total_amount: 1,
          net_amount: 1,
          narration: 1,
          created_at: 1,
        },
      },
    ])
    .toArray();

  return vouchers.map((v) => ({
    id: v.id,
    voucher_number: v.voucher_number,
    voucher_date: v.voucher_date,
    voucher_type: v.voucher_type,
    ledger_name: v.ledger?.name || "",
    total_amount: v.total_amount || 0,
    net_amount: v.net_amount || 0,
    narration: v.narration,
  }));
}

// Get sales register report (sales vouchers with items)
export async function getSalesRegister(companyId, dateFrom, dateTo) {
  const db = getDb();
  const vouchers = await db
    .collection("vouchers")
    .find({
      company_id: companyId,
      voucher_type: { $in: ["sales", "credit-note"] },
      voucher_date: { $gte: dateFrom, $lte: dateTo },
    })
    .sort({ voucher_date: -1 })
    .toArray();

  // Fetch ledger names for each voucher
  const ledgerIds = [...new Set(vouchers.map((v) => v.ledger_id))];
  const ledgers = await db
    .collection("ledgers")
    .find({ id: { $in: ledgerIds } })
    .toArray();

  const ledgerMap = {};
  ledgers.forEach((l) => {
    ledgerMap[l.id] = l.name;
  });

  // Add ledger_name to each voucher
  return vouchers.map((v) => ({
    ...v,
    ledger_name: ledgerMap[v.ledger_id] || "Unknown",
  }));
}

// Get purchase register report (purchase vouchers with items)
export async function getPurchaseRegister(companyId, dateFrom, dateTo) {
  const db = getDb();
  const vouchers = await db
    .collection("vouchers")
    .find({
      company_id: companyId,
      voucher_type: { $in: ["purchase", "debit-note"] },
      voucher_date: { $gte: dateFrom, $lte: dateTo },
    })
    .sort({ voucher_date: -1 })
    .toArray();

  // Fetch ledger names for each voucher
  const ledgerIds = [...new Set(vouchers.map((v) => v.ledger_id))];
  const ledgers = await db
    .collection("ledgers")
    .find({ id: { $in: ledgerIds } })
    .toArray();

  const ledgerMap = {};
  ledgers.forEach((l) => {
    ledgerMap[l.id] = l.name;
  });

  // Add ledger_name to each voucher
  return vouchers.map((v) => ({
    ...v,
    ledger_name: ledgerMap[v.ledger_id] || "Unknown",
  }));
}

// Get stock summary (inventory levels by item)
export async function getStockSummary(companyId) {
  const db = getDb();
  const items = await db
    .collection("items")
    .find({ company_id: companyId })
    .toArray();

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    code: item.code,
    uom: item.uom,
    opening_stock: item.opening_stock || 0,
    reorder_level: item.reorder_level || 0,
    rate: item.rate || 0,
  }));
}
// Get outstanding receivables (unpaid sales) - now using bills
export async function getOutstandingReceivables(companyId) {
  const db = getDb();
  const receivables = [];

  console.log(
    `[OUTSTANDING RECEIVABLES] Fetching all receivable bills from bills collection...`,
  );

  // Outstanding reports should include only ledgers that have bill-wise enabled.
  const billwiseLedgers = await db
    .collection("ledgers")
    .find({
      company_id: companyId,
      $or: [{ is_billwise: true }, { is_billwise: "true" }, { is_billwise: "yes" }],
    })
    .toArray();
  const eligibleLedgerIds = billwiseLedgers.map((ledger) => ledger.id);

  if (eligibleLedgerIds.length === 0) {
    console.log(
      `[OUTSTANDING RECEIVABLES] No bill-wise enabled ledgers found for company ${companyId}`,
    );
    return receivables;
  }

  // Fetch all receivable bills directly from bills collection.
  // Debit bills are stored as negative closing.
  const bills = await db
    .collection("bills")
    .find({
      company_id: companyId,
      ledger_id: { $in: eligibleLedgerIds },
      closing: { $lt: 0 },
    })
    .toArray();

  console.log(
    `[OUTSTANDING RECEIVABLES] Found ${bills.length} receivable bills from bills`,
  );

  // Get unique ledger IDs from bills to fetch ledger details
  const ledgerIds = [...new Set(bills.map((b) => b.ledger_id))];
  let ledgers = [];

  if (ledgerIds.length > 0) {
    ledgers = await db
      .collection("ledgers")
      .find({
        company_id: companyId,
        id: { $in: ledgerIds },
      })
      .toArray();

    console.log(
      `[OUTSTANDING RECEIVABLES] Found ${ledgers.length} ledgers for receivable bills`,
    );
  }

  // Process all bills
  for (const bill of bills) {
    const ledger = ledgers.find((l) => l.id === bill.ledger_id);
    const opening = Math.abs(Number(bill.opening || 0));
    const netMovement = Math.abs(
      Number(bill.credit || 0) - Number(bill.debit || 0),
    );
    const outstanding = Math.abs(Number(bill.closing || 0));

    receivables.push({
      voucher_id: bill.id,
      voucher_number: bill.bill_reference || "",
      voucher_date: bill.bill_date || bill.created_at,
      ledger_id: bill.ledger_id,
      ledger_name: ledger?.name || "",
      invoice_amount: opening,
      allocated_amount: netMovement,
      pending_amount: outstanding,
      outstanding_amount: outstanding,
      status: "pending",
      type: "bill",
    });
  }

  console.log(
    `[OUTSTANDING RECEIVABLES] Total receivables found: ${receivables.length}`,
  );
  return receivables;
}

// Get outstanding payables (unpaid purchases) - now using bills
export async function getOutstandingPayables(companyId) {
  const db = getDb();
  const payables = [];

  console.log(
    `[OUTSTANDING PAYABLES] Fetching all payable bills from bills collection...`,
  );

  // Outstanding reports should include only ledgers that have bill-wise enabled.
  const billwiseLedgers = await db
    .collection("ledgers")
    .find({
      company_id: companyId,
      $or: [{ is_billwise: true }, { is_billwise: "true" }, { is_billwise: "yes" }],
    })
    .toArray();
  const eligibleLedgerIds = billwiseLedgers.map((ledger) => ledger.id);

  if (eligibleLedgerIds.length === 0) {
    console.log(
      `[OUTSTANDING PAYABLES] No bill-wise enabled ledgers found for company ${companyId}`,
    );
    return payables;
  }

  // Fetch all payable bills directly from bills collection.
  // Credit bills are stored as positive closing.
  const bills = await db
    .collection("bills")
    .find({
      company_id: companyId,
      ledger_id: { $in: eligibleLedgerIds },
      closing: { $gt: 0 },
    })
    .toArray();

  console.log(
    `[OUTSTANDING PAYABLES] Found ${bills.length} payable bills from bills`,
  );

  // Get unique ledger IDs from bills to fetch ledger details
  const ledgerIds = [...new Set(bills.map((b) => b.ledger_id))];
  let ledgers = [];

  if (ledgerIds.length > 0) {
    ledgers = await db
      .collection("ledgers")
      .find({
        company_id: companyId,
        id: { $in: ledgerIds },
      })
      .toArray();

    console.log(
      `[OUTSTANDING PAYABLES] Found ${ledgers.length} ledgers for payable bills`,
    );
  }

  // Process all bills
  for (const bill of bills) {
    const ledger = ledgers.find((l) => l.id === bill.ledger_id);
    const opening = Math.abs(Number(bill.opening || 0));
    const netMovement = Math.abs(
      Number(bill.credit || 0) - Number(bill.debit || 0),
    );
    const outstanding = Math.abs(Number(bill.closing || 0));

    payables.push({
      voucher_id: bill.id,
      voucher_number: bill.bill_reference || "",
      voucher_date: bill.bill_date || bill.created_at,
      ledger_id: bill.ledger_id,
      ledger_name: ledger?.name || "",
      invoice_amount: opening,
      allocated_amount: netMovement,
      pending_amount: outstanding,
      outstanding_amount: outstanding,
      status: "pending",
      type: "bill",
    });
  }

  console.log(
    `[OUTSTANDING PAYABLES] Total payables found: ${payables.length}`,
  );
  return payables;
}

/**
 * Update item master stock levels based on batch allocation changes
 * Aggregates inward, outward, closing quantities from all batches of an item
 */
export async function updateItemStockLevels(itemId) {
  const db = getDb();

  // Get all batches for this item
  const batches = await db
    .collection("batch_allocation")
    .find({ item_id: itemId })
    .toArray();

  const item = await db.collection("item_master").findOne({ id: itemId });

  const openingQty = Number(item?.opening_stock ?? item?.opening_qty ?? 0) || 0;
  const openingRate = Number(item?.opening_rate || 0) || 0;
  const openingValue =
    item?.opening_value !== undefined
      ? Number(item.opening_value || 0)
      : openingQty * openingRate;

  // Aggregate totals from all batches
  let totalInward = 0;
  let totalInwardValue = 0;
  let totalOutward = 0;
  let totalOutwardValue = 0;

  batches.forEach((batch) => {
    totalInward += batch.inward_qty || 0;
    totalInwardValue += batch.inward_value || 0;
    totalOutward += batch.outward_qty || 0;
    totalOutwardValue += batch.outward_value || 0;
  });

  const totalInwardRate = totalInward > 0 ? totalInwardValue / totalInward : 0;
  const totalOutwardRate =
    totalOutward > 0 ? totalOutwardValue / totalOutward : 0;

  const totalClosing = openingQty + totalInward - totalOutward;
  const totalClosingValue = openingValue + totalInwardValue - totalOutwardValue;
  const totalClosingRate = totalClosing > 0 ? totalClosingValue / totalClosing : 0;

  // Update item_master with aggregated stock levels
  await db.collection("item_master").updateOne(
    { id: itemId },
    {
      $set: {
        inward_qty: totalInward,
        inward_rate: totalInwardRate,
        inward_value: totalInwardValue,
        outward_qty: totalOutward,
                openingBalance: "",
                closingBalance: "",
        outward_rate: totalOutwardRate,
        outward_value: totalOutwardValue,
        closing_qty: totalClosing,
        closing_rate: totalClosingRate,
        closing_value: totalClosingValue,
        updated_at: new Date(),
      },
    },
  );
}

export async function updateBatchesForPurchase(
  details,
  voucherType,
  companyId,
) {
  const db = getDb();

  // Only process for purchase/receipt vouchers (inward)
  if (!["purchase", "receipt"].includes(voucherType)) {
    console.log(
      `[UPDATE BATCHES PURCHASE] Skipping - voucher type is ${voucherType}`,
    );
    return;
  }

  console.log(
    "[UPDATE BATCHES PURCHASE] Processing",
    details?.length || 0,
    "details for company:",
    companyId,
  );

  for (const detail of details || []) {
    if (!detail.item_id) {
      console.log("[UPDATE BATCHES PURCHASE] Skipping detail - no item_id");
      continue;
    }
    console.log("[UPDATE BATCHES PURCHASE] Processing detail:", {
      item_id: detail.item_id,
      batch_id: detail.batch_id,
      quantity: detail.quantity,
    });

    let batchId = detail.batch_id;
    let itemId = detail.item_id;

    // If no batch is selected, use primary batch
    if (!batchId) {
      console.log(
        "[UPDATE BATCHES PURCHASE] No batch_id, getting primary batch for item:",
        itemId,
      );
      const primaryBatch = await getPrimaryBatchForItem(itemId, companyId);
      batchId = primaryBatch.id;
      console.log(
        "[UPDATE BATCHES PURCHASE] Primary batch created/retrieved:",
        { batch_id: batchId, batch_number: primaryBatch.batch_number },
      );
    }

    const batch = await db
      .collection("batch_allocation")
      .findOne({ id: batchId });

    if (!batch) continue;

    // Update inward tracking
    const new_inward_qty = batch.inward_qty + detail.quantity;
    const new_inward_value = batch.inward_value + detail.quantity * detail.rate;
    const new_inward_rate =
      new_inward_qty > 0 ? new_inward_value / new_inward_qty : 0;

    // Recalculate closing position
    const closing_qty = new_inward_qty - batch.outward_qty;
    const closing_value = new_inward_value - batch.outward_value;
    const closing_rate = closing_qty > 0 ? closing_value / closing_qty : 0;

    await db.collection("batch_allocation").updateOne(
      { id: batchId },
      {
        $set: {
          inward_qty: new_inward_qty,
          inward_rate: new_inward_rate,
          inward_value: new_inward_value,
          closing_qty,
          closing_rate,
          closing_value,
          updated_at: new Date(),
        },
      },
    );

    // Update item master stock levels
    await updateItemStockLevels(batch.item_id);
  }
}

/**
 * Update batch allocations when sales voucher is saved
 * Tracks outward (outgoing) quantities and values
 */
export async function updateBatchesForSales(details, voucherType, companyId) {
  const db = getDb();

  // Only process for sales/issue vouchers (outward)
  if (!["sales", "issue"].includes(voucherType)) {
    console.log(
      `[UPDATE BATCHES SALES] Skipping - voucher type is ${voucherType}`,
    );
    return;
  }

  console.log(
    "[UPDATE BATCHES SALES] Processing",
    details?.length || 0,
    "details for company:",
    companyId,
  );

  for (const detail of details || []) {
    if (!detail.item_id) {
      console.log("[UPDATE BATCHES SALES] Skipping detail - no item_id");
      continue;
    }
    console.log("[UPDATE BATCHES SALES] Processing detail:", {
      item_id: detail.item_id,
      batch_id: detail.batch_id,
      quantity: detail.quantity,
    });

    let batchId = detail.batch_id;
    let itemId = detail.item_id;

    // If no batch is selected, use primary batch
    if (!batchId) {
      console.log(
        "[UPDATE BATCHES SALES] No batch_id, getting primary batch for item:",
        itemId,
      );
      const primaryBatch = await getPrimaryBatchForItem(itemId, companyId);
      batchId = primaryBatch.id;
      console.log("[UPDATE BATCHES SALES] Primary batch created/retrieved:", {
        batch_id: batchId,
        batch_number: primaryBatch.batch_number,
      });
    }

    const batch = await db
      .collection("batch_allocation")
      .findOne({ id: batchId });

    if (!batch) continue;

    // Update outward tracking
    const new_outward_qty = batch.outward_qty + detail.quantity;
    const new_outward_value =
      batch.outward_value + detail.quantity * detail.rate;
    const new_outward_rate =
      new_outward_qty > 0 ? new_outward_value / new_outward_qty : 0;

    // Recalculate closing position
    const closing_qty = batch.inward_qty - new_outward_qty;
    const closing_value = batch.inward_value - new_outward_value;
    const closing_rate = closing_qty > 0 ? closing_value / closing_qty : 0;

    await db.collection("batch_allocation").updateOne(
      { id: batchId },
      {
        $set: {
          outward_qty: new_outward_qty,
          outward_rate: new_outward_rate,
          outward_value: new_outward_value,
          closing_qty,
          closing_rate,
          closing_value,
          updated_at: new Date(),
        },
      },
    );

    // Update item master stock levels
    await updateItemStockLevels(batch.item_id);
  }
}

/**
 * Reverse batch allocations when voucher is deleted
 */
export async function reverseBatchAllocations(details, voucherType, companyId) {
  const db = getDb();
  const inwardVoucherTypes = ["purchase", "receipt", "credit-note"];
  const outwardVoucherTypes = ["sales", "issue", "debit-note"];
  const touchedItemIds = new Set();

  for (const detail of details || []) {
    if (!detail?.item_id) {
      continue;
    }

    const itemId = detail.item_id;
    touchedItemIds.add(itemId);
    const allocationMoves =
      Array.isArray(detail.batch_allocations) && detail.batch_allocations.length > 0
        ? detail.batch_allocations
            .filter((a) => a?.batch_id)
            .map((a) => ({
              batch_id: a.batch_id,
              qty: Number(a.qty || 0),
              rate: Number(a.rate ?? detail.rate ?? 0),
            }))
        : detail.batch_id
          ? [
              {
                batch_id: detail.batch_id,
                qty:
                  detail.batch_qty !== null && detail.batch_qty !== undefined
                    ? Number(detail.batch_qty || 0)
                    : Number(detail.quantity || 0),
                rate: Number(detail.rate || 0),
              },
            ]
          : [];

    for (const move of allocationMoves) {
      if (!move.batch_id || move.qty <= 0) {
        continue;
      }

      const batch = await db
        .collection("batch_allocation")
        .findOne({ id: move.batch_id, item_id: itemId });

      if (!batch) {
        continue;
      }

      let new_inward_qty = Number(batch.inward_qty || 0);
      let new_inward_value = Number(batch.inward_value || 0);
      let new_outward_qty = Number(batch.outward_qty || 0);
      let new_outward_value = Number(batch.outward_value || 0);

      if (inwardVoucherTypes.includes(voucherType)) {
        new_inward_qty = Math.max(0, new_inward_qty - move.qty);
        new_inward_value = Math.max(0, new_inward_value - move.qty * move.rate);
      } else if (outwardVoucherTypes.includes(voucherType)) {
        new_outward_qty = Math.max(0, new_outward_qty - move.qty);
        new_outward_value = Math.max(0, new_outward_value - move.qty * move.rate);
      }

      const openingQty = Number(batch.opening_qty || 0);
      const openingValue = Number(batch.opening_value || 0);
      const closing_qty = openingQty + new_inward_qty - new_outward_qty;
      const closing_value = openingValue + new_inward_value - new_outward_value;
      const closing_rate = closing_qty > 0 ? closing_value / closing_qty : 0;
      const inward_rate =
        new_inward_qty > 0 ? new_inward_value / new_inward_qty : 0;
      const outward_rate =
        new_outward_qty > 0 ? new_outward_value / new_outward_qty : 0;

      await db.collection("batch_allocation").updateOne(
        { id: move.batch_id, item_id: itemId },
        {
          $set: {
            inward_qty: new_inward_qty,
            inward_value: new_inward_value,
            inward_rate,
            outward_qty: new_outward_qty,
            outward_value: new_outward_value,
            outward_rate,
            closing_qty,
            closing_rate,
            closing_value,
            updated_at: new Date(),
          },
        },
      );

      await updateItemStockLevels(batch.item_id);
    }
  }

  // Ensure item_master totals are recalculated for every touched inventory item,
  // including entries that had no valid batch moves during reversal.
  for (const itemId of touchedItemIds) {
    await updateItemStockLevels(itemId);
  }
}
