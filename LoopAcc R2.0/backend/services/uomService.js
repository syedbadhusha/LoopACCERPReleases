import { getDb } from "../db.js";
import { v4 as uuidv4 } from "uuid";

function createInUseError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

export async function getUomsByCompany(companyId) {
  const db = getDb();
  return await db
    .collection("uom_master")
    .find({ company_id: companyId })
    .toArray();
}

export async function createUom(doc) {
  const db = getDb();
  const id = doc.id || uuidv4();
  const toInsert = {
    id,
    ...doc,
    created_at: new Date(),
    updated_at: new Date(),
  };
  const res = await db.collection("uom_master").insertOne(toInsert);
  if (!res.acknowledged) throw new Error("Insert failed");
  return toInsert;
}

export async function updateUom(id, update) {
  const db = getDb();
  const res = await db
    .collection("uom_master")
    .findOneAndUpdate(
      { id },
      { $set: { ...update, updated_at: new Date() } },
      { returnDocument: "after" }
    );
  if (!res.value) throw new Error("Update failed");
  return res.value;
}

export async function deleteUom(id) {
  const db = getDb();

  const itemCount = await db.collection("item_master").countDocuments({
    uom_id: id,
  });
  if (itemCount > 0) {
    throw createInUseError(
      `Cannot delete UOM. It is used by ${itemCount} item(s).`,
    );
  }

  const res = await db.collection("uom_master").deleteOne({ id });
  return res.deletedCount === 1;
}
