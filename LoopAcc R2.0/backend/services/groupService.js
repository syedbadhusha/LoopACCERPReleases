import { getDb } from "../db.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Fixed 4-digit group index values.
 * These are permanent identifiers used for internal logic regardless of
 * whether the display name is ever changed.
 * Never change these numbers once assigned.
 */
const DEFAULT_TALLY_GROUPS = [
  { group_index: 1001, name: "Branch / Divisions",       nature: "liability", parent_name: null },
  { group_index: 1002, name: "Capital Account",           nature: "liability", parent_name: null },
  { group_index: 1003, name: "Reserves & Surplus",        nature: "liability", parent_name: "Capital Account" },
  { group_index: 1004, name: "Current Assets",            nature: "assets",    parent_name: null },
  { group_index: 1005, name: "Bank Accounts",             nature: "assets",    parent_name: "Current Assets" },
  { group_index: 1006, name: "Cash-in-Hand",              nature: "assets",    parent_name: "Current Assets" },
  { group_index: 1007, name: "Deposits (Asset)",          nature: "assets",    parent_name: "Current Assets" },
  { group_index: 1008, name: "Loans & Advances (Asset)",  nature: "assets",    parent_name: "Current Assets" },
  { group_index: 1009, name: "Stock-in-Hand",             nature: "assets",    parent_name: "Current Assets" },
  { group_index: 1010, name: "Sundry Debtors",            nature: "assets",    parent_name: "Current Assets" },
  { group_index: 1011, name: "Current Liabilities",       nature: "liability", parent_name: null },
  { group_index: 1012, name: "Duties & Taxes",            nature: "liability", parent_name: "Current Liabilities" },
  { group_index: 1013, name: "Provisions",                nature: "liability", parent_name: "Current Liabilities" },
  { group_index: 1014, name: "Sundry Creditors",          nature: "liability", parent_name: "Current Liabilities" },
  { group_index: 1015, name: "Direct Expenses",           nature: "expense",   parent_name: null },
  { group_index: 1016, name: "Direct Incomes",            nature: "income",    parent_name: null },
  { group_index: 1017, name: "Fixed Assets",              nature: "assets",    parent_name: null },
  { group_index: 1018, name: "Indirect Expenses",         nature: "expense",   parent_name: null },
  { group_index: 1019, name: "Indirect Incomes",          nature: "income",    parent_name: null },
  { group_index: 1020, name: "Investments",               nature: "assets",    parent_name: null },
  { group_index: 1021, name: "Loans (Liability)",         nature: "liability", parent_name: null },
  { group_index: 1022, name: "Bank OD A/c",              nature: "liability", parent_name: "Loans (Liability)" },
  { group_index: 1023, name: "Secured Loans",             nature: "liability", parent_name: "Loans (Liability)" },
  { group_index: 1024, name: "Unsecured Loans",           nature: "liability", parent_name: "Loans (Liability)" },
  { group_index: 1025, name: "Misc. Expenses (ASSET)",    nature: "assets",    parent_name: null },
  { group_index: 1026, name: "Purchase Accounts",         nature: "expense",   parent_name: null },
  { group_index: 1027, name: "Sales Accounts",            nature: "income",    parent_name: null },
  { group_index: 1028, name: "Suspense A/c",              nature: "liability", parent_name: null },
];

/**
 * Group indexes where bill-wise allocation must be disabled.
 * 1005 = Bank Accounts
 * 1006 = Cash-in-Hand
 * 1017 = Fixed Assets
 * 1022 = Bank OD A/c
 */
export const BILLWISE_DISABLED_GROUP_INDEXES = new Set([1005, 1006, 1017, 1022]);

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function createInUseError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

function hasExactDefaultSystemGroups(existingSystemGroups) {
  if (existingSystemGroups.length !== DEFAULT_TALLY_GROUPS.length) {
    return false;
  }

  // Primary check: all expected group_index values present
  const existingIndexSet = new Set(
    existingSystemGroups.map((g) => Number(g?.group_index)).filter(Boolean),
  );
  const allIndexesMatch = DEFAULT_TALLY_GROUPS.every((g) =>
    existingIndexSet.has(g.group_index),
  );

  return allIndexesMatch;
}

export async function replaceDefaultGroupsForCompany(companyId) {
  const db = getDb();
  const now = new Date();

  // Keep IDs for matching names so existing ledgers stay mapped to the same group IDs.
  const existingSystemGroups = await db
    .collection("groups")
    .find({ company_id: companyId, is_system: true })
    .toArray();

  // Match existing system groups by group_index first, then by name as fallback.
  const existingByIndex = new Map();
  const existingByName = new Map();
  for (const group of existingSystemGroups) {
    if (group.group_index) existingByIndex.set(Number(group.group_index), group);
    const key = normalizeName(group?.name);
    if (!existingByName.has(key)) existingByName.set(key, group);
  }

  const idByName = new Map();
  const docs = DEFAULT_TALLY_GROUPS.map((group) => {
    const existing =
      existingByIndex.get(group.group_index) ||
      existingByName.get(normalizeName(group.name));
    const id = existing?.id || uuidv4();
    idByName.set(group.name, id);

    return {
      id,
      group_index: group.group_index,
      company_id: companyId,
      name: group.name,
      nature: group.nature,
      is_system: true,
      parent_id: null,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
  });

  for (const doc of docs) {
    const blueprint = DEFAULT_TALLY_GROUPS.find((g) => g.name === doc.name);
    const parentName = blueprint?.parent_name || null;
    doc.parent_id = parentName ? idByName.get(parentName) || null : null;
  }

  const allowedIds = docs.map((doc) => doc.id);
  await db.collection("groups").deleteMany({
    company_id: companyId,
    is_system: true,
    id: { $nin: allowedIds },
  });

  for (const doc of docs) {
    await db.collection("groups").updateOne(
      { company_id: companyId, id: doc.id },
      { $set: doc },
      { upsert: true },
    );
  }

  return docs;
}

async function ensureRequiredDefaultGroups(companyId) {
  const db = getDb();
  const existingSystemGroups = await db
    .collection("groups")
    .find({ company_id: companyId, is_system: true })
    .project({ name: 1, nature: 1, parent_id: 1 })
    .toArray();

  if (!hasExactDefaultSystemGroups(existingSystemGroups)) {
    await replaceDefaultGroupsForCompany(companyId);
  }
}

export async function getGroupsByCompany(companyId) {
  const db = getDb();
  await ensureRequiredDefaultGroups(companyId);
  return await db
    .collection("groups")
    .find({ company_id: companyId })
    .toArray();
}

export async function createGroup(doc) {
  const db = getDb();
  const id = doc.id || uuidv4();

  // Case-insensitive name uniqueness check
  if (doc.name && doc.company_id) {
    const nameDup = await db.collection("groups").findOne({
      company_id: doc.company_id,
      name: { $regex: new RegExp(`^${doc.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
    if (nameDup) {
      const err = new Error(`Group "${doc.name}" already exists`);
      err.statusCode = 409;
      throw err;
    }
  }

  const toInsert = {
    id,
    ...doc,
    created_at: new Date(),
    updated_at: new Date(),
  };
  const res = await db.collection("groups").insertOne(toInsert);
  if (!res.acknowledged) throw new Error("Insert failed");
  return toInsert;
}

export async function updateGroup(id, update) {
  const db = getDb();

  // Case-insensitive name uniqueness check (skip if name unchanged)
  if (update.name) {
    const existing = await db.collection("groups").findOne({ id });
    if (existing && update.name.trim().toLowerCase() !== (existing.name || '').toLowerCase()) {
      const nameDup = await db.collection("groups").findOne({
        company_id: existing.company_id,
        name: { $regex: new RegExp(`^${update.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        id: { $ne: id },
      });
      if (nameDup) {
        const err = new Error(`Group "${update.name}" already exists`);
        err.statusCode = 409;
        throw err;
      }
    }
  }

  const res = await db
    .collection("groups")
    .findOneAndUpdate(
      { id },
      { $set: { ...update, updated_at: new Date() } },
      { returnDocument: "after" }
    );
  if (!res.value) throw new Error("Update failed");
  return res.value;
}

export async function deleteGroup(id) {
  const db = getDb();

  const group = await db.collection("groups").findOne({ id });
  if (!group) {
    return false;
  }

  if (group.is_system === true) {
    throw createInUseError("Cannot delete system default group.");
  }

  const childGroupCount = await db.collection("groups").countDocuments({
    parent_id: id,
  });
  if (childGroupCount > 0) {
    throw createInUseError(
      `Cannot delete group. It is parent for ${childGroupCount} subgroup(s).`,
    );
  }

  const ledgerCount = await db.collection("ledgers").countDocuments({
    $or: [{ group_id: id }, { ledger_group_id: id }],
  });
  if (ledgerCount > 0) {
    throw createInUseError(
      `Cannot delete group. It is used by ${ledgerCount} ledger(s).`,
    );
  }

  const res = await db.collection("groups").deleteOne({ id });
  return res.deletedCount === 1;
}
