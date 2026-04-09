import { getDb } from "../db.js";
import { v4 as uuidv4 } from "uuid";
import { createBillsFromLedgerAllocations } from "./billService.js";
import { BILLWISE_DISABLED_GROUP_INDEXES } from "./groupService.js";

const ON_ACCOUNTS_REFERENCE_ALIASES = [
  "ON ACCOUNTS",
  "ON ACCOUNT",
  "ON-ACCOUNT",
];
const BILL_TYPE_ON_ACCOUNTS = "ON ACCOUNTS";
const BILL_TYPE_NEW_REF = "New Ref";
const BILL_TYPE_AGAINST_REF = "Against Ref";
const BILL_TYPE_OPENING = "Opening";
const BILL_TYPE_ADVANCE = "Advance";

function createInUseError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

function isBillwiseEnabled(ledger) {
  return (
    ledger?.is_billwise === true ||
    ledger?.is_billwise === "true" ||
    (typeof ledger?.is_billwise === "string" &&
      ledger.is_billwise.toLowerCase() === "true")
  );
}

function normalizeBillType(value, fallback = null) {
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

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapLedgerForClient(ledger) {
  const openingSigned = toFiniteNumber(ledger?.opening, 0);
  const hasLegacyOpeningBalance = ledger?.opening_balance !== undefined;
  const legacyOpeningBalance = hasLegacyOpeningBalance
    ? toFiniteNumber(ledger.opening_balance, 0)
    : null;
  const resolvedBalanceType =
    ledger?.balance_type || (openingSigned < 0 ? "debit" : "credit");

  return {
    ...ledger,
    opening_balance:
      legacyOpeningBalance !== null
        ? Math.abs(legacyOpeningBalance)
        : Math.abs(openingSigned),
    balance_type: resolvedBalanceType,
  };
}

function normalizeLedgerBalanceFields(raw, existing = null) {
  const data = { ...raw };

  const incomingOpening =
    data.opening !== undefined
      ? toFiniteNumber(data.opening, 0)
      : data.opening_balance !== undefined
        ? toFiniteNumber(data.opening_balance, 0)
        : existing
          ? toFiniteNumber(existing.opening, 0)
          : 0;

  const inferredBalanceType =
    data.balance_type || existing?.balance_type || (incomingOpening < 0 ? "debit" : "credit");

  const openingSigned =
    data.opening !== undefined
      ? toFiniteNumber(data.opening, 0)
      : data.opening_balance !== undefined
        ? inferredBalanceType === "debit"
          ? -Math.abs(toFiniteNumber(data.opening_balance, 0))
          : Math.abs(toFiniteNumber(data.opening_balance, 0))
        : existing
          ? toFiniteNumber(existing.opening, 0)
          : 0;

  const credit =
    data.credit !== undefined
      ? Math.abs(toFiniteNumber(data.credit, 0))
      : existing
        ? Math.abs(toFiniteNumber(existing.credit, 0))
        : 0;

  const debit =
    data.debit !== undefined
      ? -Math.abs(toFiniteNumber(data.debit, 0))
      : existing
        ? -Math.abs(toFiniteNumber(existing.debit, 0))
        : 0;

  const closing = openingSigned + credit + debit;

  data.opening = openingSigned;
  data.credit = credit;
  data.debit = debit;
  data.closing = closing;

  delete data.opening_balance;
  delete data.balance_type;

  return data;
}

async function isBillwiseDisabledGroup(db, companyId, groupId) {
  if (!groupId || !companyId) {
    return false;
  }

  const group = await db.collection("groups").findOne({
    id: groupId,
    company_id: companyId,
  });

  const idx = Number(group?.group_index);
  return BILLWISE_DISABLED_GROUP_INDEXES.has(idx);
}

export async function getLedgersByCompany(companyId) {
  const db = getDb();
  // Populate ledger_groups with parent group hierarchy
  const items = await db
    .collection("ledgers")
    .aggregate([
      { $match: { company_id: companyId } },
      {
        $lookup: {
          from: "groups",
          localField: "group_id",
          foreignField: "id",
          as: "ledger_groups",
        },
      },
      {
        $unwind: {
          path: "$ledger_groups",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "groups",
          localField: "ledger_groups.parent_id",
          foreignField: "id",
          as: "parent_groups",
        },
      },
      {
        $addFields: {
          "ledger_groups.parent_group": {
            $arrayElemAt: ["$parent_groups", 0],
          },
        },
      },
      {
        $project: {
          parent_groups: 0,
        },
      },
      { $sort: { name: 1 } },
    ])
    .toArray();
  return items.map(mapLedgerForClient);
}

export async function createLedger(doc) {
  const db = getDb();
  const id = doc.id || uuidv4();

  // Case-insensitive name uniqueness check
  if (doc.name && doc.company_id) {
    const nameDup = await db.collection("ledgers").findOne({
      company_id: doc.company_id,
      name: { $regex: new RegExp(`^${doc.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
    if (nameDup) {
      const err = new Error(`Ledger "${doc.name}" already exists`);
      err.statusCode = 409;
      throw err;
    }
  }

  // Transform ledger_group_id to group_id if present (for backwards compatibility)
  const docToInsert = { ...doc };
  if (docToInsert.ledger_group_id && !docToInsert.group_id) {
    docToInsert.group_id = docToInsert.ledger_group_id;
    delete docToInsert.ledger_group_id;
  }

  const normalizedDoc = normalizeLedgerBalanceFields(docToInsert);
  const targetGroupId = normalizedDoc.group_id || docToInsert.group_id;
  const isBillwiseDisabled = await isBillwiseDisabledGroup(
    db,
    docToInsert.company_id,
    targetGroupId,
  );
  const resolvedBillwise = docToInsert.is_billwise === true && !isBillwiseDisabled;

  const toInsert = {
    id,
    ...normalizedDoc,
    is_billwise: resolvedBillwise,
    created_at: new Date(),
    updated_at: new Date(),
  };
  const res = await db.collection("ledgers").insertOne(toInsert);
  if (!res.acknowledged) throw new Error("Insert failed");

  // Always keep opening bill allocations in sync for create flow.
  // This guarantees bills collection stays aligned with ledger master opening values.
  try {
    console.log(
      `[CREATE LEDGER] Syncing opening bill allocations for ledger: ${id}`,
    );
    await saveBillAllocations(
      id,
      toInsert.company_id,
      resolvedBillwise ? docToInsert.bill_allocations || [] : [],
    );
  } catch (error) {
    console.log(
      "[CREATE LEDGER] Opening bill allocation sync failed:",
      error.message,
    );
    // Continue - don't fail the ledger creation
  }

  return toInsert;
}

export async function updateLedger(id, update) {
  const db = getDb();

  // Get the existing ledger to check if name is being updated
  const existingLedger = await db.collection("ledgers").findOne({ id });
  if (!existingLedger) throw new Error("Ledger not found");

  // Case-insensitive name uniqueness check (skip if name unchanged)
  if (update.name && update.name.trim().toLowerCase() !== (existingLedger.name || '').toLowerCase()) {
    const nameDup = await db.collection("ledgers").findOne({
      company_id: existingLedger.company_id,
      name: { $regex: new RegExp(`^${update.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      id: { $ne: id },
    });
    if (nameDup) {
      const err = new Error(`Ledger "${update.name}" already exists`);
      err.statusCode = 409;
      throw err;
    }
  }

  // Transform ledger_group_id to group_id if present (for backwards compatibility)
  const updateData = { ...update };
  if (updateData.ledger_group_id && !updateData.group_id) {
    updateData.group_id = updateData.ledger_group_id;
    delete updateData.ledger_group_id;
  }

  const normalizedUpdate = normalizeLedgerBalanceFields(updateData, existingLedger);
  const targetGroupId =
    normalizedUpdate.group_id || existingLedger.group_id || existingLedger.ledger_group_id;
  const isBillwiseDisabled = await isBillwiseDisabledGroup(
    db,
    existingLedger.company_id,
    targetGroupId,
  );

  if (updateData.is_billwise !== undefined) {
    normalizedUpdate.is_billwise = updateData.is_billwise === true && !isBillwiseDisabled;
  }

  if (isBillwiseDisabled) {
    normalizedUpdate.is_billwise = false;
    normalizedUpdate.bill_allocations = [];
  }

  const res = await db
    .collection("ledgers")
    .findOneAndUpdate(
      { id },
      { $set: { ...normalizedUpdate, updated_at: new Date() } },
      { returnDocument: "after" },
    );
  if (!res.value) throw new Error("Update failed");

  // If ledger name is being updated, cascade update to all references
  if (normalizedUpdate.name && normalizedUpdate.name !== existingLedger.name) {
    const oldName = existingLedger.name;
    const newName = normalizedUpdate.name;

    // Update vouchers (ledger_id references)
    await db
      .collection("vouchers")
      .updateMany({ ledger_id: id }, { $set: { ledger_name: newName } });

    // Update voucher ledger entries (additional_ledger_entries)
    await db
      .collection("voucher_ledger_entries")
      .updateMany({ ledger_id: id }, { $set: { ledger_name: newName } });
  }

  // Keep opening bill allocations and related collections in sync for alter flow.
  try {
    await saveBillAllocations(
      id,
      res.value.company_id || existingLedger.company_id,
      Array.isArray(normalizedUpdate.bill_allocations)
        ? normalizedUpdate.bill_allocations
        : [],
    );
  } catch (error) {
    console.log(
      "[UPDATE LEDGER] Opening bill allocation sync failed:",
      error.message,
    );
    // Continue - don't fail ledger update when allocation sync fails
  }

  return res.value;
}

export async function deleteLedger(id) {
  const db = getDb();

  // Legacy transaction linkage check (if voucher_ledger_entries is still used)
  const voucherLedgerEntryCount = await db
    .collection("voucher_ledger_entries")
    .countDocuments({
      ledger_id: id,
      $nor: [
        { voucher_type: "opening" },
        { voucher_id: "OPENING" },
        { voucher_id: "OPENING-ON-ACCOUNT" },
        { voucher_number: "OPENING-BALANCE" },
        { voucher_number: "OPENING-ON-ACCOUNT" },
      ],
    });
  if (voucherLedgerEntryCount > 0) {
    throw createInUseError(
      `Cannot delete ledger. It is used in ${voucherLedgerEntryCount} voucher entry/entries.`,
    );
  }

  // Check if ledger is used in embedded voucher ledger arrays
  const voucherEmbeddedLedgerCount = await db.collection("vouchers").countDocuments({
    $or: [
      { "ledger_entries.ledger_id": id },
      { "additional_ledger_entries.ledger_id": id },
    ],
    voucher_type: { $ne: "opening" },
  });
  if (voucherEmbeddedLedgerCount > 0) {
    throw createInUseError(
      `Cannot delete ledger. It is used in ${voucherEmbeddedLedgerCount} voucher ledger allocation(s).`,
    );
  }

  // Check if ledger is used as primary ledger in transactional vouchers
  const voucherCount = await db.collection("vouchers").countDocuments({
    ledger_id: id,
    voucher_type: { $ne: "opening" },
  });
  if (voucherCount > 0) {
    throw createInUseError(
      `Cannot delete ledger. It is used in ${voucherCount} transaction voucher/vouchers.`,
    );
  }

  // Check if ledger is used in transactional bills (ignore opening/standalone)
  const transactionBillCount = await db.collection("bills").countDocuments({
    ledger_id: id,
    $or: [
      {
        invoice_voucher_id: { $exists: true, $nin: [null, ""] },
      },
      {
        payment_voucher_id: { $exists: true, $nin: [null, ""] },
      },
      {
        source: {
          $exists: true,
          $nin: ["ledger-opening", "standalone"],
        },
      },
    ],
  });
  if (transactionBillCount > 0) {
    throw createInUseError(
      `Cannot delete ledger. It is used in ${transactionBillCount} transaction bill/bills.`,
    );
  }

  // Clean up non-transaction opening/master data before deleting ledger
  await db.collection("voucher_ledger_entries").deleteMany({
    ledger_id: id,
    $or: [
      { voucher_type: "opening" },
      { voucher_id: { $in: ["OPENING", "OPENING-ON-ACCOUNT"] } },
      {
        voucher_number: {
          $in: ["OPENING-BALANCE", "OPENING-ON-ACCOUNT"],
        },
      },
    ],
  });

  await db.collection("bills").deleteMany({
    ledger_id: id,
    invoice_voucher_id: { $in: [null, ""] },
    payment_voucher_id: { $in: [null, ""] },
  });

  const res = await db.collection("ledgers").deleteOne({ id });
  return res.deletedCount === 1;
}

// Get ledger balance for a specific date range
export async function getLedgerBalance(ledgerId, dateFrom, dateTo) {
  const db = getDb();
  const ledger = await db.collection("ledgers").findOne({ id: ledgerId });

  if (!ledger) {
    return { debitAmount: 0, creditAmount: 0 };
  }

  // Build balance from opening + movements so opening balances are reflected in reports.
  // Convention in this codebase:
  // - opening/credit are positive for credit side
  // - debit is stored as negative for debit side
  const openingValue = toFiniteNumber(ledger.opening, 0);
  const debitValue = toFiniteNumber(ledger.debit, 0);
  const creditValue = toFiniteNumber(ledger.credit, 0);
  const closingSigned = openingValue + debitValue + creditValue;

  if (closingSigned > 0) {
    return {
      debitAmount: 0,
      creditAmount: Math.abs(closingSigned),
    };
  }

  if (closingSigned < 0) {
    return {
      debitAmount: Math.abs(closingSigned),
      creditAmount: 0,
    };
  }

  return {
    debitAmount: 0,
    creditAmount: 0,
  };
}

// Get trial balance for a company
export async function getTrialBalance(companyId, dateFrom, dateTo) {
  const db = getDb();
  const ledgers = await db
    .collection("ledgers")
    .find({ company_id: companyId })
    .toArray();

  const balances = [];
  for (const ledger of ledgers) {
    const { debitAmount, creditAmount } = await getLedgerBalance(
      ledger.id,
      dateFrom,
      dateTo,
    );
    balances.push({
      id: ledger.id,
      name: ledger.name,
      debit: debitAmount,
      credit: creditAmount,
    });
  }

  return balances;
}

// Get balance sheet data
export async function getBalanceSheetData(companyId, dateFrom, dateTo) {
  const db = getDb();
  const trialBalance = await getTrialBalance(companyId, dateFrom, dateTo);

  // Get all ledgers with group info
  const ledgersWithGroups = await db
    .collection("ledgers")
    .aggregate([
      { $match: { company_id: companyId } },
      {
        $lookup: {
          from: "groups",
          localField: "group_id",
          foreignField: "id",
          as: "group",
        },
      },
      { $unwind: { path: "$group", preserveNullAndEmptyArrays: true } },
    ])
    .toArray();

  const balanceMap = {};
  trialBalance.forEach((b) => {
    balanceMap[b.id] = b;
  });

  const result = ledgersWithGroups.map((ledger) => ({
    ...ledger,
    debit: balanceMap[ledger.id]?.debit || 0,
    credit: balanceMap[ledger.id]?.credit || 0,
  }));

  return result;
}

// Get ledger report rows (opening + period transactions) for a specific ledger
export async function getLedgerReportData(companyId, ledgerId, dateFrom, dateTo) {
  const db = getDb();

  const ledger = await db.collection("ledgers").findOne({
    id: ledgerId,
    company_id: companyId,
  });

  if (!ledger) {
    return {
      ledger: null,
      transactions: [],
      opening: 0,
    };
  }

  const getEntryAmounts = (entry) => {
    const explicitDebit = Math.abs(toFiniteNumber(entry?.debit_amount, 0));
    const explicitCredit = Math.abs(toFiniteNumber(entry?.credit_amount, 0));
    const amount = Math.abs(toFiniteNumber(entry?.amount, 0));
    const isDeemedPositive = String(entry?.isDeemedPositive || "").toLowerCase() === "yes";

    const debit = explicitDebit > 0
      ? explicitDebit
      : explicitCredit === 0 && isDeemedPositive
        ? amount
        : 0;

    const credit = explicitCredit > 0
      ? explicitCredit
      : explicitDebit === 0 && !isDeemedPositive
        ? amount
        : 0;

    return { debit, credit };
  };

  const masterOpeningSigned = toFiniteNumber(ledger.opening, 0);

  const previousVouchers = await db
    .collection("vouchers")
    .find({
      company_id: companyId,
      voucher_date: { $lt: String(dateFrom) },
      "ledger_entries.ledger_id": ledgerId,
    })
    .toArray();

  let preFromSignedMovement = 0;
  for (const voucher of previousVouchers) {
    const entries = Array.isArray(voucher?.ledger_entries) ? voucher.ledger_entries : [];
    for (const entry of entries) {
      if (entry?.ledger_id !== ledgerId) {
        continue;
      }
      const { debit, credit } = getEntryAmounts(entry);
      preFromSignedMovement += credit - debit;
    }
  }

  const openingSigned = masterOpeningSigned + preFromSignedMovement;
  let runningBalance = openingSigned;

  const vouchers = await db
    .collection("vouchers")
    .find({
      company_id: companyId,
      voucher_date: {
        $gte: String(dateFrom),
        $lte: String(dateTo),
      },
      "ledger_entries.ledger_id": ledgerId,
    })
    .sort({ voucher_date: 1, created_at: 1 })
    .toArray();

  const relatedLedgerIds = new Set();
  for (const voucher of vouchers) {
    for (const entry of voucher.ledger_entries || []) {
      if (entry?.ledger_id) {
        relatedLedgerIds.add(entry.ledger_id);
      }
    }
  }

  const relatedLedgers = await db
    .collection("ledgers")
    .find({ id: { $in: Array.from(relatedLedgerIds) } })
    .toArray();

  const ledgerNameById = new Map(relatedLedgers.map((l) => [l.id, l.name]));

  const getBestCounterpartyName = (entries, pickCreditSide) => {
    let bestName = "";
    let bestAmount = -1;

    for (const entry of entries) {
      const ledgerName = ledgerNameById.get(entry?.ledger_id) || "";
      if (!ledgerName) {
        continue;
      }

      const { debit, credit } = getEntryAmounts(entry);
      const candidateAmount = pickCreditSide ? credit : debit;

      if (candidateAmount > bestAmount) {
        bestAmount = candidateAmount;
        bestName = ledgerName;
      }
    }

    return bestAmount > 0 ? bestName : "";
  };

  const transactions = [];

  for (const voucher of vouchers) {
    const entries = Array.isArray(voucher.ledger_entries) ? voucher.ledger_entries : [];
    const selectedLedgerEntries = entries.filter((entry) => entry?.ledger_id === ledgerId);
    if (selectedLedgerEntries.length === 0) {
      continue;
    }

    for (const entry of selectedLedgerEntries) {
      const { debit, credit } = getEntryAmounts(entry);

      const oppositeEntries = entries.filter(
        (otherEntry) => otherEntry?.ledger_id && otherEntry.ledger_id !== ledgerId,
      );

      const particulars = getBestCounterpartyName(oppositeEntries, debit > 0)
        || voucher.narration
        || voucher.voucher_type
        || "Voucher Entry";

      runningBalance = runningBalance + credit - debit;

      transactions.push({
        voucherId: voucher.id || "",
        date: voucher.voucher_date,
        particulars,
        voucherType: voucher.voucher_type || "",
        voucherNumber: voucher.voucher_number || "",
        debit,
        credit,
        balance: runningBalance,
      });
    }
  }

  return {
    ledger: mapLedgerForClient(ledger),
    transactions,
    opening: openingSigned,
  };
}

// Get group voucher report rows (opening + period transactions) for a specific group hierarchy
export async function getGroupVoucherReportData(companyId, groupId, dateFrom, dateTo) {
  const db = getDb();

  const getEntryAmounts = (entry) => {
    const explicitDebit = Math.abs(toFiniteNumber(entry?.debit_amount, 0));
    const explicitCredit = Math.abs(toFiniteNumber(entry?.credit_amount, 0));
    const amount = Math.abs(toFiniteNumber(entry?.amount, 0));
    const isDeemedPositive = String(entry?.isDeemedPositive || "").toLowerCase() === "yes";

    const debit = explicitDebit > 0
      ? explicitDebit
      : explicitCredit === 0 && isDeemedPositive
        ? amount
        : 0;

    const credit = explicitCredit > 0
      ? explicitCredit
      : explicitDebit === 0 && !isDeemedPositive
        ? amount
        : 0;

    return { debit, credit };
  };

  const groups = await db
    .collection("groups")
    .find({ company_id: companyId })
    .toArray();

  const selectedGroup = groups.find((group) => group.id === groupId) || null;
  if (!selectedGroup) {
    return {
      group: null,
      transactions: [],
      opening: 0,
    };
  }

  const childrenByParent = new Map();
  for (const group of groups) {
    const key = group?.parent_id || "ROOT";
    if (!childrenByParent.has(key)) {
      childrenByParent.set(key, []);
    }
    childrenByParent.get(key).push(group);
  }

  const includedGroupIds = new Set([groupId]);
  const queue = [groupId];
  while (queue.length > 0) {
    const currentGroupId = queue.shift();
    const children = childrenByParent.get(currentGroupId) || [];
    for (const child of children) {
      if (!includedGroupIds.has(child.id)) {
        includedGroupIds.add(child.id);
        queue.push(child.id);
      }
    }
  }

  const ledgers = await db
    .collection("ledgers")
    .find({
      company_id: companyId,
      group_id: { $in: Array.from(includedGroupIds) },
    })
    .toArray();

  const ledgerIds = new Set(ledgers.map((ledger) => ledger.id));
  const masterOpeningSigned = ledgers.reduce(
    (sum, ledger) => sum + toFiniteNumber(ledger?.opening, 0),
    0,
  );

  if (ledgerIds.size === 0) {
    return {
      group: selectedGroup,
      transactions: [],
      opening: masterOpeningSigned,
    };
  }

  const previousVouchers = await db
    .collection("vouchers")
    .find({
      company_id: companyId,
      voucher_date: { $lt: String(dateFrom) },
      "ledger_entries.ledger_id": { $in: Array.from(ledgerIds) },
    })
    .toArray();

  let preFromSignedMovement = 0;
  for (const voucher of previousVouchers) {
    const entries = Array.isArray(voucher?.ledger_entries) ? voucher.ledger_entries : [];
    for (const entry of entries) {
      if (!ledgerIds.has(entry?.ledger_id)) {
        continue;
      }
      const { debit, credit } = getEntryAmounts(entry);
      preFromSignedMovement += credit - debit;
    }
  }

  const openingSigned = masterOpeningSigned + preFromSignedMovement;

  const vouchers = await db
    .collection("vouchers")
    .find({
      company_id: companyId,
      voucher_date: {
        $gte: String(dateFrom),
        $lte: String(dateTo),
      },
      "ledger_entries.ledger_id": { $in: Array.from(ledgerIds) },
    })
    .sort({ voucher_date: 1, created_at: 1 })
    .toArray();

  const relatedLedgerIds = new Set();
  for (const voucher of vouchers) {
    for (const entry of voucher.ledger_entries || []) {
      if (entry?.ledger_id) {
        relatedLedgerIds.add(entry.ledger_id);
      }
    }
  }

  const relatedLedgers = await db
    .collection("ledgers")
    .find({ id: { $in: Array.from(relatedLedgerIds) } })
    .toArray();

  const ledgerNameById = new Map(relatedLedgers.map((ledger) => [ledger.id, ledger.name]));

  const getBestCounterpartyName = (entries, pickCreditSide) => {
    let bestName = "";
    let bestAmount = -1;

    for (const entry of entries) {
      const ledgerName = ledgerNameById.get(entry?.ledger_id) || "";
      if (!ledgerName) {
        continue;
      }

      const { debit, credit } = getEntryAmounts(entry);
      const candidateAmount = pickCreditSide ? credit : debit;

      if (candidateAmount > bestAmount) {
        bestAmount = candidateAmount;
        bestName = ledgerName;
      }
    }

    return bestAmount > 0 ? bestName : "";
  };

  const transactions = [];
  let runningBalance = openingSigned;

  for (const voucher of vouchers) {
    const entries = Array.isArray(voucher.ledger_entries) ? voucher.ledger_entries : [];
    const groupEntries = entries.filter((entry) => ledgerIds.has(entry?.ledger_id));
    if (groupEntries.length === 0) {
      continue;
    }

    let debit = 0;
    let credit = 0;

    for (const entry of groupEntries) {
      const amounts = getEntryAmounts(entry);
      debit += amounts.debit;
      credit += amounts.credit;
    }

    const oppositeEntries = entries.filter(
      (entry) => entry?.ledger_id && !ledgerIds.has(entry.ledger_id),
    );

    const useCreditSideFromOpposite = debit >= credit;
    const particulars = getBestCounterpartyName(oppositeEntries, useCreditSideFromOpposite)
      || voucher.narration
      || voucher.voucher_type
      || "Voucher Entry";

    runningBalance = runningBalance + credit - debit;

    transactions.push({
      voucherId: voucher.id || "",
      date: voucher.voucher_date,
      particulars,
      voucherType: voucher.voucher_type || "",
      voucherNumber: voucher.voucher_number || "",
      debit,
      credit,
      balance: runningBalance,
    });
  }

  return {
    group: selectedGroup,
    transactions,
    opening: openingSigned,
  };
}

// Get bill allocations for a billwise ledger
export async function getBillAllocations(ledgerId, companyId) {
  const db = getDb();
  const normalizeReference = (value) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();

  const ledger = await db.collection("ledgers").findOne({
    id: ledgerId,
    company_id: companyId,
  });

  if (!ledger) {
    return [];
  }

  if (ledger.bill_allocations && Array.isArray(ledger.bill_allocations)) {
    return ledger.bill_allocations.map((alloc) => {
      const normalizedRef = normalizeReference(alloc.bill_reference);
      const explicitType = normalizeBillType(alloc.bill_type);
      const normalizedType = normalizedRef
        ? explicitType === BILL_TYPE_ON_ACCOUNTS
          ? BILL_TYPE_OPENING
          : explicitType || BILL_TYPE_OPENING
        : BILL_TYPE_ON_ACCOUNTS;

      return {
        id: alloc.id || uuidv4(),
        bill_reference: alloc.bill_reference || "",
        amount: Number(alloc.amount ?? alloc.allocated_amount ?? 0) || 0,
        bill_date: alloc.bill_date || null,
        bill_type: normalizedType,
      };
    });
  }

  return [];
}

// Save bill allocations for a billwise ledger
export async function saveBillAllocations(ledgerId, companyId, allocations) {
  const db = getDb();

  console.log(`[SAVE BILL ALLOCATIONS] Starting for ledger ${ledgerId}`, {
    allocationCount: allocations?.length || 0,
  });

  // Get the ledger
  const ledger = await db.collection("ledgers").findOne({
    id: ledgerId,
    company_id: companyId,
  });

  if (!ledger) {
    throw new Error("Ledger not found");
  }

  const existingAllocations = Array.isArray(ledger.bill_allocations)
    ? ledger.bill_allocations
    : [];

  const normalizeReference = (value) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();

  const openingBalanceAmount = toFiniteNumber(ledger.opening, 0);
  const inputAllocations = Array.isArray(allocations) ? allocations : [];
  const ledgerIsBillwise = isBillwiseEnabled(ledger);

  const existingOnAccountsAllocation = existingAllocations.find((alloc) =>
    ON_ACCOUNTS_REFERENCE_ALIASES.includes(
      normalizeReference(alloc?.bill_reference),
    ) ||
    normalizeBillType(alloc?.bill_type) === BILL_TYPE_ON_ACCOUNTS,
  );

  const getAllocationAmount = (alloc) => {
    const value =
      alloc?.amount !== undefined && alloc?.amount !== null
        ? Number(alloc.amount)
        : alloc?.allocated_amount !== undefined && alloc?.allocated_amount !== null
          ? Number(alloc.allocated_amount)
          : 0;
    return Number.isFinite(value) ? value : 0;
  };

  const isOnAccountsAllocation = (alloc) => {
    const normalizedRef = normalizeReference(alloc?.bill_reference);
    return (
      ON_ACCOUNTS_REFERENCE_ALIASES.includes(normalizedRef) ||
      normalizeBillType(alloc?.bill_type) === BILL_TYPE_ON_ACCOUNTS ||
      normalizedRef === ""
    );
  };

  const explicitReferenceAllocations = inputAllocations.filter(
    (alloc) => !isOnAccountsAllocation(alloc),
  );

  const explicitReferenceTotal = explicitReferenceAllocations.reduce(
    (sum, alloc) => sum + getAllocationAmount(alloc),
    0,
  );

  const onAccountsBalance = openingBalanceAmount - explicitReferenceTotal;

  const shouldKeepOnAccountsBalance =
    ledgerIsBillwise &&
    (Math.abs(onAccountsBalance) > 0.000001 ||
      !!existingOnAccountsAllocation ||
      explicitReferenceAllocations.length === 0);

  const sourceAllocations =
    inputAllocations.length > 0
      ? ledgerIsBillwise
        ? [
            ...explicitReferenceAllocations,
            ...(shouldKeepOnAccountsBalance
              ? [
                  {
                    id: existingOnAccountsAllocation?.id || uuidv4(),
                    bill_reference: "",
                    amount: onAccountsBalance,
                    bill_date: null,
                    bill_type: BILL_TYPE_ON_ACCOUNTS,
                  },
                ]
              : []),
          ]
        : inputAllocations
      : [
          {
            id: existingOnAccountsAllocation?.id || uuidv4(),
            bill_reference: "",
            amount: openingBalanceAmount,
            bill_date: null,
            bill_type: ledgerIsBillwise
              ? BILL_TYPE_OPENING
              : BILL_TYPE_ON_ACCOUNTS,
          },
        ];

  const findMatchingExistingAllocation = (alloc) => {
    const normalizedRef = normalizeReference(alloc?.bill_reference);
    const hasExplicitReference = Boolean(normalizedRef);

    // Prevent explicit bill references from reusing ON ACCOUNTS allocation id.
    if (
      hasExplicitReference &&
      alloc?.id &&
      existingOnAccountsAllocation?.id &&
      alloc.id === existingOnAccountsAllocation.id
    ) {
      return null;
    }

    if (alloc?.id) {
      const byId = existingAllocations.find((item) => item.id === alloc.id);
      if (byId) return byId;
    }

    if (isOnAccountsAllocation(alloc)) {
      return existingOnAccountsAllocation || null;
    }

    if (normalizedRef) {
      const sameRefAndDate = existingAllocations.find(
        (item) =>
          normalizeReference(item?.bill_reference) === normalizedRef &&
          (item?.bill_date || null) === (alloc?.bill_date || null),
      );
      if (sameRefAndDate) return sameRefAndDate;

      const sameRef = existingAllocations.find(
        (item) => normalizeReference(item?.bill_reference) === normalizedRef,
      );
      if (sameRef) return sameRef;
    }

    return null;
  };

  const usedAllocationIds = new Set();

  const resolveAllocationId = (
    alloc,
    matchedExistingAllocation,
    finalBillReference,
    normalizedBillType,
  ) => {
    const normalizedInputId = String(alloc?.id || "").trim();
    const isOnAccountsRow = normalizedBillType === BILL_TYPE_ON_ACCOUNTS;

    if (matchedExistingAllocation?.id) {
      return matchedExistingAllocation.id;
    }

    if (normalizedInputId) {
      const existingById = existingAllocations.find(
        (item) => item.id === normalizedInputId,
      );

      if (!existingById) {
        return normalizedInputId;
      }

      const existingByIdReference = normalizeReference(
        existingById.bill_reference,
      );
      const existingByIdIsOnAccounts =
        existingByIdReference === "" ||
        normalizeBillType(existingById.bill_type) === BILL_TYPE_ON_ACCOUNTS;

      if (isOnAccountsRow && existingByIdIsOnAccounts) {
        return normalizedInputId;
      }

      if (!isOnAccountsRow && !existingByIdIsOnAccounts) {
        const targetReference = normalizeReference(finalBillReference);
        if (targetReference && existingByIdReference === targetReference) {
          return normalizedInputId;
        }
      }
    }

    return uuidv4();
  };

  // Create or update the opening balance entry with bill allocations
  const billallocations = sourceAllocations.map((alloc) => {
    const matchedExistingAllocation = findMatchingExistingAllocation(alloc);

    const normalizedReference = normalizeReference(alloc.bill_reference);
    const finalBillReference = ledgerIsBillwise ? normalizedReference : "";

    const normalizedBillType = ledgerIsBillwise
      ? finalBillReference
        ? BILL_TYPE_OPENING
        : BILL_TYPE_ON_ACCOUNTS
      : BILL_TYPE_ON_ACCOUNTS;

    const amountValue =
      alloc.amount !== undefined && alloc.amount !== null
        ? Number(alloc.amount)
        : alloc.allocated_amount !== undefined &&
            alloc.allocated_amount !== null
          ? Number(alloc.allocated_amount)
          : inputAllocations.length === 0
            ? openingBalanceAmount
            : 0;

    let signedAmount = Number.isFinite(amountValue) ? Number(amountValue) : 0;

    let resolvedId = resolveAllocationId(
      alloc,
      matchedExistingAllocation,
      finalBillReference,
      normalizedBillType,
    );

    while (usedAllocationIds.has(resolvedId)) {
      resolvedId = uuidv4();
    }
    usedAllocationIds.add(resolvedId);

    return {
      id: resolvedId,
      bill_reference: finalBillReference,
      amount: signedAmount,
      bill_date: alloc.bill_date || null,
      bill_type: normalizedBillType,
    };
  });

  const referenceCounts = new Map();
  for (const alloc of billallocations) {
    const normalizedReference = normalizeReference(alloc.bill_reference);
    if (!normalizedReference) continue;
    referenceCounts.set(
      normalizedReference,
      (referenceCounts.get(normalizedReference) || 0) + 1,
    );
  }

  const duplicateReferences = Array.from(referenceCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([reference]) => reference);

  if (duplicateReferences.length > 0) {
    throw new Error(
      `Duplicate bill reference not allowed for a ledger: ${duplicateReferences.join(", ")}`,
    );
  }

  const now = new Date().toISOString();
  console.log(`[SAVE BILL ALLOCATIONS] Updating ledger master bill allocations...`);

  // Keep ledger master bill_allocations aligned with opening ledger entry billallocation.
  await db.collection("ledgers").updateOne(
    { id: ledgerId, company_id: companyId },
    {
      $set: {
        bill_allocations: billallocations,
        updated_at: new Date(),
      },
    },
  );

  // Upsert bills in the bills collection while preserving existing debit/credit movements.
  console.log(`[SAVE BILL ALLOCATIONS] Syncing bills collection from allocations...`);

  try {
    const createdBills = await createBillsFromLedgerAllocations(
      ledgerId,
      companyId,
      billallocations,
    );

    const activeBillIds = createdBills.map((bill) => bill.id);

    // Cleanup only stale opening/master rows with no movement to avoid losing receipt/payment effects.
    const cleanupRes = await db.collection("bills").deleteMany({
      ledger_id: ledgerId,
      company_id: companyId,
      id: { $nin: activeBillIds },
      source: { $in: ["ledger-opening", "standalone", null, ""] },
      credit: { $in: [0, null] },
      debit: { $in: [0, null] },
      $or: [
        { invoice_voucher_id: { $exists: false } },
        { invoice_voucher_id: { $in: [null, ""] } },
      ],
      $and: [
        {
          $or: [
            { payment_voucher_id: { $exists: false } },
            { payment_voucher_id: { $in: [null, ""] } },
          ],
        },
      ],
    });

    console.log(
      `[SAVE BILL ALLOCATIONS] ✅ Synced ${createdBills.length} bills and removed ${cleanupRes.deletedCount} stale no-movement rows for ledger ${ledgerId}`,
    );

    return {
      id: ledgerId,
      billallocation: billallocations,
      createdBills: createdBills,
    };
  } catch (billError) {
    console.error(
      `[SAVE BILL ALLOCATIONS] ❌ Error creating bills:`,
      billError,
    );
    throw new Error(
      `Failed to create bills in bills collection: ${billError.message}`,
    );
  }
}

// Delete a bill allocation
export async function deleteBillAllocation(ledgerId, allocationId, companyId) {
  const db = getDb();

  const ledger = await db.collection("ledgers").findOne({
    id: ledgerId,
    company_id: companyId,
  });

  if (!ledger) {
    throw new Error("Ledger not found");
  }

  if (Array.isArray(ledger.bill_allocations)) {
    const filteredAllocations = ledger.bill_allocations.filter(
      (alloc) => alloc.id !== allocationId,
    );

    // Keep ledger master bill_allocations aligned after deletion.
    await db.collection("ledgers").updateOne(
      { id: ledgerId, company_id: companyId },
      {
        $set: {
          bill_allocations: filteredAllocations,
          updated_at: new Date(),
        },
      },
    );
  }

  // Also delete from bills collection
  await db.collection("bills").deleteOne({
    id: allocationId,
    ledger_id: ledgerId,
    company_id: companyId,
    source: "ledger-opening",
  });

  console.log(
    `[DELETE BILL ALLOCATION] Deleted bill allocation ${allocationId} from ledger ${ledgerId}`,
  );

  return true;
}
