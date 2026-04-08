import { getDb } from "../db.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Default voucher types created automatically for every new company.
 * vt_index is a stable numeric identifier (never reassign / never reuse).
 */
export const DEFAULT_VOUCHER_TYPES = [
  { vt_index: 2001, name: "Sales",       base_type: "sales",       prefix: "INV",  suffix: "", starting_number: 1 },
  { vt_index: 2002, name: "Credit Note", base_type: "credit-note", prefix: "CN",   suffix: "", starting_number: 1 },
  { vt_index: 2003, name: "Purchase",    base_type: "purchase",    prefix: "BILL", suffix: "", starting_number: 1 },
  { vt_index: 2004, name: "Debit Note",  base_type: "debit-note",  prefix: "DN",   suffix: "", starting_number: 1 },
  { vt_index: 2005, name: "Payment",     base_type: "payment",     prefix: "PAY",  suffix: "", starting_number: 1 },
  { vt_index: 2006, name: "Receipt",     base_type: "receipt",     prefix: "REC",  suffix: "", starting_number: 1 },
];

/**
 * Create (or upsert) default voucher types for a company.
 * Called during company creation alongside replaceDefaultGroupsForCompany.
 *
 * For existing companies whose settings already carry numbering overrides, we
 * migrate those values into the new voucher-type documents (first call only –
 * subsequent calls re-use the existing IDs and leave numbers untouched).
 */
export async function createDefaultVoucherTypesForCompany(companyId, existingSettings = {}) {
  const db = getDb();
  const now = new Date();

  // Map settings keys → default type index so we can migrate existing prefixes.
  const SETTINGS_MIGRATION_MAP = {
    2001: { prefix: "invoice_prefix",     number: "invoice_starting_number" },
    2002: { prefix: "credit_note_prefix", number: "credit_note_starting_number" },
    2003: { prefix: "bill_prefix",        number: "bill_starting_number" },
    2004: { prefix: "debit_note_prefix",  number: "debit_note_starting_number" },
    2005: { prefix: "payment_prefix",     number: "payment_starting_number" },
    2006: { prefix: "receipt_prefix",     number: "receipt_starting_number" },
  };

  // Load existing system voucher types (by stable vt_index)
  const existingDocs = await db
    .collection("voucher_types")
    .find({ company_id: companyId, is_system: true })
    .toArray();

  const existingByIndex = new Map(
    existingDocs.map((d) => [Number(d.vt_index), d])
  );

  for (const def of DEFAULT_VOUCHER_TYPES) {
    const existing = existingByIndex.get(def.vt_index);
    const id = existing?.id || uuidv4();

    // Migrate prefix/number from settings only on very first creation
    const migration = SETTINGS_MIGRATION_MAP[def.vt_index] || {};
    const migratedPrefix =
      existing?.prefix ??
      (existingSettings[migration.prefix] || def.prefix);
    const migratedStarting =
      existing?.starting_number ??
      parseInt(String(existingSettings[migration.number] || def.starting_number));

    const doc = {
      id,
      vt_index: def.vt_index,
      company_id: companyId,
      name: existing?.name ?? def.name,
      base_type: def.base_type,
      is_system: true,
      prefix: migratedPrefix,
      suffix: existing?.suffix ?? def.suffix,
      starting_number: migratedStarting,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    await db.collection("voucher_types").updateOne(
      { company_id: companyId, id: doc.id },
      { $set: doc },
      { upsert: true }
    );
  }
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function listVoucherTypes(companyId) {
  const db = getDb();
  const docs = await db
    .collection("voucher_types")
    .find({ company_id: companyId })
    .sort({ is_system: -1, base_type: 1, name: 1 })
    .toArray();
  return docs;
}

export async function getVoucherTypeById(id) {
  const db = getDb();
  return db.collection("voucher_types").findOne({ id: String(id) });
}

export async function getVoucherTypeByBaseType(companyId, baseType) {
  const db = getDb();
  // Return the system type first; if not found, return the first matching custom type
  const doc = await db.collection("voucher_types").findOne({
    company_id: companyId,
    base_type: baseType,
    is_system: true,
  });
  if (doc) return doc;
  return db.collection("voucher_types").findOne({
    company_id: companyId,
    base_type: baseType,
  });
}

export async function createVoucherType(companyId, data) {
  const db = getDb();
  const now = new Date();

  const VALID_BASE_TYPES = [
    "sales", "credit-note", "purchase", "debit-note", "payment", "receipt",
  ];
  if (!VALID_BASE_TYPES.includes(data.base_type)) {
    const err = new Error(
      `Invalid base_type. Must be one of: ${VALID_BASE_TYPES.join(", ")}`
    );
    err.statusCode = 400;
    throw err;
  }

  // Prevent duplicate names within company
  const existing = await db.collection("voucher_types").findOne({
    company_id: companyId,
    name: { $regex: new RegExp(`^${escapeRegex(data.name.trim())}$`, "i") },
  });
  if (existing) {
    const err = new Error(`Voucher type "${data.name}" already exists`);
    err.statusCode = 409;
    throw err;
  }

  const doc = {
    id: uuidv4(),
    company_id: companyId,
    name: data.name.trim(),
    base_type: data.base_type,
    is_system: false,
    prefix: (data.prefix || "").trim(),
    suffix: (data.suffix || "").trim(),
    starting_number: Math.max(1, parseInt(String(data.starting_number || 1))),
    created_at: now,
    updated_at: now,
  };

  await db.collection("voucher_types").insertOne(doc);
  return doc;
}

export async function updateVoucherType(id, data) {
  const db = getDb();
  const existing = await db.collection("voucher_types").findOne({ id: String(id) });
  if (!existing) {
    const err = new Error("Voucher type not found");
    err.statusCode = 404;
    throw err;
  }

  const updateFields = {
    prefix: data.prefix !== undefined ? String(data.prefix).trim() : existing.prefix,
    suffix: data.suffix !== undefined ? String(data.suffix).trim() : existing.suffix,
    starting_number:
      data.starting_number !== undefined
        ? Math.max(1, parseInt(String(data.starting_number)))
        : existing.starting_number,
    updated_at: new Date(),
  };

  // Allow name change only for custom (non-system) types
  if (!existing.is_system && data.name) {
    // Check for duplicate name collision
    const nameDup = await db.collection("voucher_types").findOne({
      company_id: existing.company_id,
      name: { $regex: new RegExp(`^${escapeRegex(data.name.trim())}$`, "i") },
      id: { $ne: String(id) },
    });
    if (nameDup) {
      const err = new Error(`Voucher type "${data.name}" already exists`);
      err.statusCode = 409;
      throw err;
    }
    updateFields.name = data.name.trim();
  }

  // Allow base_type change only for custom (non-system) types
  if (!existing.is_system && data.base_type) {
    updateFields.base_type = data.base_type;
  }

  await db.collection("voucher_types").updateOne(
    { id: String(id) },
    { $set: updateFields }
  );

  return { ...existing, ...updateFields };
}

export async function deleteVoucherType(id) {
  const db = getDb();
  const existing = await db.collection("voucher_types").findOne({ id: String(id) });
  if (!existing) {
    const err = new Error("Voucher type not found");
    err.statusCode = 404;
    throw err;
  }
  if (existing.is_system) {
    const err = new Error("Cannot delete a system voucher type");
    err.statusCode = 400;
    throw err;
  }
  await db.collection("voucher_types").deleteOne({ id: String(id) });
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
