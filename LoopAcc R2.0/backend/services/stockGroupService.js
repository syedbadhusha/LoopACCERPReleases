import { getDb } from "../db.js";
import { v4 as uuidv4 } from "uuid";

function createInUseError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

export async function getStockGroupsByCompany(companyId) {
  const db = getDb();
  return await db
    .collection("stock_groups")
    .find({ company_id: companyId, is_active: { $ne: false } })
    .toArray();
}

export async function createStockGroup(doc) {
  const db = getDb();
  const id = doc.id || uuidv4();

  // Case-insensitive name uniqueness check
  if (doc.name && doc.company_id) {
    const nameDup = await db.collection("stock_groups").findOne({
      company_id: doc.company_id,
      name: { $regex: new RegExp(`^${doc.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
    if (nameDup) {
      const err = new Error(`Stock group "${doc.name}" already exists`);
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
  const res = await db.collection("stock_groups").insertOne(toInsert);
  if (!res.acknowledged) throw new Error("Insert failed");
  return toInsert;
}

export async function updateStockGroup(id, update) {
  const db = getDb();

  // Case-insensitive name uniqueness check (skip if name unchanged)
  if (update.name) {
    const existing = await db.collection("stock_groups").findOne({ id });
    if (existing && update.name.trim().toLowerCase() !== (existing.name || '').toLowerCase()) {
      const nameDup = await db.collection("stock_groups").findOne({
        company_id: existing.company_id,
        name: { $regex: new RegExp(`^${update.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        id: { $ne: id },
      });
      if (nameDup) {
        const err = new Error(`Stock group "${update.name}" already exists`);
        err.statusCode = 409;
        throw err;
      }
    }
  }

  const res = await db
    .collection("stock_groups")
    .findOneAndUpdate(
      { id },
      { $set: { ...update, updated_at: new Date() } },
      { returnDocument: "after" }
    );
  if (!res.value) throw new Error("Update failed");
  return res.value;
}

export async function deleteStockGroup(id) {
  const db = getDb();

  const itemCount = await db.collection("item_master").countDocuments({
    stock_group_id: id,
  });
  if (itemCount > 0) {
    throw createInUseError(
      `Cannot delete stock group. It is used by ${itemCount} item(s).`,
    );
  }

  const res = await db.collection("stock_groups").deleteOne({ id });
  return res.deletedCount === 1;
}
