import { getDb } from "../db.js";
import { v4 as uuidv4 } from "uuid";

function createInUseError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

/**
 * Get batch allocations for an item
 * Returns all batches for an item with current stock levels
 */
export async function getBatchAllocationsByItem(itemId, companyId) {
  const db = getDb();
  const batches = await db
    .collection("batch_allocation")
    .find({ item_id: itemId, company_id: companyId })
    .sort({ created_at: 1 })
    .toArray();
  return batches;
}

/**
 * Get batch wise stock report
 * Returns all batches with current quantities and values
 */
export async function getBatchWiseStock(itemId, companyId) {
  const db = getDb();
  return await db
    .collection("batch_allocation")
    .aggregate([
      {
        $match: {
          item_id: itemId,
          company_id: companyId,
        },
      },
      {
        $project: {
          batch_number: 1,
          opening_qty: 1,
          opening_rate: 1,
          opening_value: 1,
          inward_qty: 1,
          inward_rate: 1,
          inward_value: 1,
          outward_qty: 1,
          outward_rate: 1,
          outward_value: 1,
          closing_qty: 1,
          closing_rate: 1,
          closing_value: 1,
          created_at: 1,
          updated_at: 1,
        },
      },
      { $sort: { batch_number: 1 } },
    ])
    .toArray();
}

/**
 * Get item-wise total stock across all batches
 */
export async function getItemTotalStock(itemId, companyId) {
  const db = getDb();
  const result = await db
    .collection("batch_allocation")
    .aggregate([
      {
        $match: {
          item_id: itemId,
          company_id: companyId,
        },
      },
      {
        $group: {
          _id: "$item_id",
          total_opening_qty: { $sum: "$opening_qty" },
          total_opening_value: { $sum: "$opening_value" },
          total_inward_qty: { $sum: "$inward_qty" },
          total_inward_value: { $sum: "$inward_value" },
          total_outward_qty: { $sum: "$outward_qty" },
          total_outward_value: { $sum: "$outward_value" },
          total_closing_qty: { $sum: "$closing_qty" },
          total_closing_value: { $sum: "$closing_value" },
        },
      },
    ])
    .toArray();
  return result.length > 0 ? result[0] : null;
}

/**
 * Create batch allocation (single batch)
 * Initializes opening balance from item master, keeps inward_qty = 0
 * Opening balance is NOT counted as inward
 *
 * @param {Object} batch - Batch data with opening_qty, opening_rate, opening_value
 * @param {String} itemId - Item ID
 * @param {String} companyId - Company ID
 * @returns {Object} Created batch record
 */
export async function createBatchAllocation(batch, itemId, companyId) {
  const db = getDb();
  const id = uuidv4();

  // Get opening values from batch (from item master)
  const opening_qty = batch.opening_qty || 0;
  const opening_rate = batch.opening_rate || 0;
  const opening_value = batch.opening_value || 0;

  // Initialize inward to 0 - opening balance from item master is NOT counted as inward
  // Only purchases/receipts (from vouchers) should update inward_qty
  const inward_qty = 0;
  const inward_rate = 0;
  const inward_value = 0;

  // Outward starts at zero (will be updated with sales)
  const outward_qty = 0;
  const outward_value = 0;
  const outward_rate = 0;

  // Calculate closing (includes opening balance + inward - outward)
  const closing_qty = opening_qty + inward_qty - outward_qty;
  const closing_rate =
    closing_qty > 0
      ? (opening_value + inward_value - outward_value) / closing_qty
      : 0;
  const closing_value = closing_qty * closing_rate;

  const toInsert = {
    id,
    item_id: itemId,
    company_id: companyId,
    batch_number: batch.batch_number,
    // Opening balance (from Item Master) - kept separate from inward
    opening_qty,
    opening_rate,
    opening_value,
    // Inward tracking (purchases/receipts - does NOT include opening balance)
    inward_qty,
    inward_rate,
    inward_value,
    // Outward tracking (sales/issues)
    outward_qty,
    outward_rate,
    outward_value,
    // Closing position
    closing_qty,
    closing_rate,
    closing_value,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const res = await db.collection("batch_allocation").insertOne(toInsert);
  if (!res.acknowledged) throw new Error("Batch allocation insert failed");
  return toInsert;
}

/**
 * Create multiple batch allocations (for item creation)
 * Each batch starts with opening balance from item master
 * Inward is initialized to 0 - opening is NOT counted as inward
 */
export async function createBatchAllocations(batches, itemId, companyId) {
  const db = getDb();
  if (!batches || batches.length === 0) return [];

  const docsToInsert = batches.map((batch) => {
    const opening_qty = batch.opening_qty || 0;
    const opening_rate = batch.opening_rate || 0;
    const opening_value = batch.opening_value || 0;

    // Initialize inward to 0 - opening balance from item master is NOT counted as inward
    const inward_qty = 0;
    const inward_rate = 0;
    const inward_value = 0;

    // Outward starts at zero
    const outward_qty = 0;
    const outward_value = 0;
    const outward_rate = 0;

    // Calculate closing (opening + inward - outward)
    const closing_qty = opening_qty + inward_qty - outward_qty;
    const closing_rate =
      closing_qty > 0
        ? (opening_value + inward_value - outward_value) / closing_qty
        : 0;
    const closing_value = closing_qty * closing_rate;

    return {
      id: uuidv4(),
      item_id: itemId,
      company_id: companyId,
      batch_number: batch.batch_number,
      // Opening balance (from Item Master)
      opening_qty,
      opening_rate,
      opening_value,
      // Inward tracking (does NOT include opening balance)
      inward_qty,
      inward_rate,
      inward_value,
      // Outward tracking
      outward_qty,
      outward_rate,
      outward_value,
      // Closing position
      closing_qty,
      closing_rate,
      closing_value,
      created_at: new Date(),
      updated_at: new Date(),
    };
  });

  const res = await db.collection("batch_allocation").insertMany(docsToInsert);
  if (!res.acknowledged) throw new Error("Batch allocations insert failed");
  return docsToInsert;
}

/**
 * Update batch allocation (only non-date fields updated)
 * created_at remains unchanged, only updated_at changes
 */
export async function updateBatchAllocation(batchId, update) {
  const db = getDb();
  // Remove fields that shouldn't be updated
  const { created_at, id, item_id, company_id, ...allowedUpdates } = update;

  const res = await db
    .collection("batch_allocation")
    .findOneAndUpdate(
      { id: batchId },
      { $set: { ...allowedUpdates, updated_at: new Date() } },
      { returnDocument: "after" }
    );
  if (!res.value) throw new Error("Batch allocation update failed");
  return res.value;
}

/**
 * Delete batch allocation by ID
 */
export async function deleteBatchAllocation(batchId) {
  const db = getDb();

  const voucherUsageCount = await db.collection("vouchers").countDocuments({
    $or: [
      { "inventory.batch_id": batchId },
      { "inventory.batch_allocations.batch_id": batchId },
      { "details.batch_id": batchId },
      { "details.batch_allocations.batch_id": batchId },
      { "line_items.batch_id": batchId },
      { "line_items.batch_allocations.batch_id": batchId },
    ],
  });
  if (voucherUsageCount > 0) {
    throw createInUseError(
      `Cannot delete batch. It is used in ${voucherUsageCount} voucher/vouchers.`,
    );
  }

  const res = await db
    .collection("batch_allocation")
    .deleteOne({ id: batchId });
  return res.deletedCount === 1;
}

/**
 * Delete all batch allocations for an item
 */
export async function deleteBatchAllocationsByItem(itemId) {
  const db = getDb();
  const res = await db
    .collection("batch_allocation")
    .deleteMany({ item_id: itemId });
  return res.deletedCount;
}

/**
 * Replace all batch allocations for an item (for updates)
 */
export async function replaceBatchAllocations(batches, itemId, companyId) {
  // Delete old batches
  await deleteBatchAllocationsByItem(itemId);
  // Create new ones
  if (batches && batches.length > 0) {
    return await createBatchAllocations(batches, itemId, companyId);
  }
  return [];
}

function normalizeBatchNumber(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function computeClosingFromOpeningAndMovement({
  opening_qty,
  opening_rate,
  opening_value,
  inward_qty,
  inward_value,
  outward_qty,
  outward_value,
}) {
  const openingQty = Number(opening_qty || 0);
  const openingRate = Number(opening_rate || 0);
  const openingValue =
    opening_value !== undefined
      ? Number(opening_value || 0)
      : openingQty * openingRate;

  const inwardQty = Number(inward_qty || 0);
  const inwardValue = Number(inward_value || 0);
  const outwardQty = Number(outward_qty || 0);
  const outwardValue = Number(outward_value || 0);

  const inwardRate = inwardQty > 0 ? inwardValue / inwardQty : 0;
  const outwardRate = outwardQty > 0 ? outwardValue / outwardQty : 0;
  const closing_qty = openingQty + inwardQty - outwardQty;
  const closing_value = openingValue + inwardValue - outwardValue;
  const closing_rate = closing_qty > 0 ? closing_value / closing_qty : 0;

  return {
    opening_qty: openingQty,
    opening_rate: openingRate,
    opening_value: openingValue,
    inward_qty: inwardQty,
    inward_rate: inwardRate,
    inward_value: inwardValue,
    outward_qty: outwardQty,
    outward_rate: outwardRate,
    outward_value: outwardValue,
    closing_qty,
    closing_rate,
    closing_value,
  };
}

/**
 * Sync item batches by merging incoming rows with existing records.
 * - Preserves existing movement buckets (inward/outward)
 * - Creates new IDs for new batches
 * - Protects PRIMARY batch from accidental rename on edit
 */
export async function syncBatchAllocationsForItem(batches, itemId, companyId) {
  const db = getDb();
  const normalizedInput = Array.isArray(batches) ? batches : [];

  const existingBatches = await db
    .collection("batch_allocation")
    .find({ item_id: itemId, company_id: companyId })
    .toArray();

  const existingById = new Map(existingBatches.map((b) => [String(b.id), b]));
  const existingByNormalizedNumber = new Map(
    existingBatches.map((b) => [normalizeBatchNumber(b.batch_number), b]),
  );

  const preparedInput = normalizedInput.map((batch) => ({ ...batch }));
  const existingPrimaryBatch = existingByNormalizedNumber.get("PRIMARY") || null;
  const hasAnyNonPrimaryInput = preparedInput.some((batch) => {
    const normalized = normalizeBatchNumber(batch?.batch_number);
    return normalized && normalized !== "PRIMARY";
  });

  // When moving from a single PRIMARY opening to explicit named batches,
  // shift opening out of PRIMARY so it is not duplicated.
  if (existingPrimaryBatch && hasAnyNonPrimaryInput) {
    const primaryIndex = preparedInput.findIndex(
      (batch) => normalizeBatchNumber(batch?.batch_number) === "PRIMARY",
    );

    const shouldZeroExistingPrimaryInput = (() => {
      if (primaryIndex < 0) {
        return true;
      }

      const inputPrimary = preparedInput[primaryIndex] || {};
      const inputOpeningQty = Number(inputPrimary.opening_qty || 0);
      const inputOpeningRate = Number(inputPrimary.opening_rate || 0);
      const inputOpeningValue =
        inputPrimary.opening_value !== undefined
          ? Number(inputPrimary.opening_value || 0)
          : inputOpeningQty * inputOpeningRate;

      const existingOpeningQty = Number(existingPrimaryBatch.opening_qty || 0);
      const existingOpeningRate = Number(existingPrimaryBatch.opening_rate || 0);
      const existingOpeningValue =
        existingPrimaryBatch.opening_value !== undefined
          ? Number(existingPrimaryBatch.opening_value || 0)
          : existingOpeningQty * existingOpeningRate;

      // Auto-zero only when input still mirrors old PRIMARY opening.
      return (
        Math.abs(inputOpeningQty - existingOpeningQty) < 0.000001 &&
        Math.abs(inputOpeningValue - existingOpeningValue) < 0.000001
      );
    })();

    if (shouldZeroExistingPrimaryInput) {
      if (primaryIndex >= 0) {
        preparedInput[primaryIndex] = {
          ...preparedInput[primaryIndex],
          id: preparedInput[primaryIndex]?.id || existingPrimaryBatch.id,
          batch_number: "primary",
          opening_qty: 0,
          opening_rate: 0,
          opening_value: 0,
        };
      } else {
        preparedInput.push({
          id: existingPrimaryBatch.id,
          batch_number: "primary",
          opening_qty: 0,
          opening_rate: 0,
          opening_value: 0,
        });
      }
    }
  }

  for (const inputBatch of preparedInput) {
    const requestedBatchNumber = String(inputBatch?.batch_number || "").trim();
    const normalizedRequestedBatch = normalizeBatchNumber(requestedBatchNumber);
    if (!normalizedRequestedBatch) {
      continue;
    }

    const requestedId =
      inputBatch?.id !== undefined && inputBatch?.id !== null
        ? String(inputBatch.id)
        : "";

    const byId = requestedId ? existingById.get(requestedId) : null;
    const byNumber = existingByNormalizedNumber.get(normalizedRequestedBatch) || null;

    const isPrimaryRenameAttempt =
      byId &&
      normalizeBatchNumber(byId.batch_number) === "PRIMARY" &&
      normalizedRequestedBatch !== "PRIMARY";

    // Do not mutate PRIMARY into some other batch name.
    // Treat this as a request to create a brand new batch.
    const targetExistingBatch = isPrimaryRenameAttempt ? null : byId || byNumber;

    if (targetExistingBatch) {
      const nextValues = computeClosingFromOpeningAndMovement({
        opening_qty: inputBatch.opening_qty,
        opening_rate: inputBatch.opening_rate,
        opening_value: inputBatch.opening_value,
        inward_qty: targetExistingBatch.inward_qty,
        inward_value: targetExistingBatch.inward_value,
        outward_qty: targetExistingBatch.outward_qty,
        outward_value: targetExistingBatch.outward_value,
      });

      const updated = {
        ...targetExistingBatch,
        ...nextValues,
        batch_number: requestedBatchNumber,
        updated_at: new Date(),
      };

      await db.collection("batch_allocation").updateOne(
        { id: targetExistingBatch.id, item_id: itemId, company_id: companyId },
        {
          $set: {
            batch_number: updated.batch_number,
            opening_qty: updated.opening_qty,
            opening_rate: updated.opening_rate,
            opening_value: updated.opening_value,
            inward_qty: updated.inward_qty,
            inward_rate: updated.inward_rate,
            inward_value: updated.inward_value,
            outward_qty: updated.outward_qty,
            outward_rate: updated.outward_rate,
            outward_value: updated.outward_value,
            closing_qty: updated.closing_qty,
            closing_rate: updated.closing_rate,
            closing_value: updated.closing_value,
            updated_at: updated.updated_at,
          },
        },
      );

      existingById.set(String(targetExistingBatch.id), updated);
      existingByNormalizedNumber.set(normalizeBatchNumber(updated.batch_number), updated);
      continue;
    }

    // New batch: create with its own ID and zero movement buckets.
    const created = await createBatchAllocation(
      {
        batch_number: requestedBatchNumber,
        opening_qty: inputBatch.opening_qty || 0,
        opening_rate: inputBatch.opening_rate || 0,
        opening_value: inputBatch.opening_value || 0,
      },
      itemId,
      companyId,
    );

    existingById.set(String(created.id), created);
    existingByNormalizedNumber.set(normalizeBatchNumber(created.batch_number), created);
  }

  return await db
    .collection("batch_allocation")
    .find({ item_id: itemId, company_id: companyId })
    .sort({ created_at: 1 })
    .toArray();
}

/**
 * Reverse inward movement from batch (Undo Purchase or Debit Note)
 * Subtracts quantity and recalculates weighted average rate
 *
 * @param {String} batchId - Batch ID
 * @param {Number} quantity - Quantity to reverse
 * @param {Number} rate - Rate of the reversed transaction
 * @returns {Object} Updated batch
 */
export async function reverseBatchInward(batchId, quantity, rate) {
  const db = getDb();

  const batch = await db
    .collection("batch_allocation")
    .findOne({ id: batchId });
  if (!batch) throw new Error("Batch not found");

  // Calculate new inward values (subtract)
  const new_inward_qty = Math.max(0, batch.inward_qty - quantity);
  const new_inward_value = Math.max(0, batch.inward_value - quantity * rate);
  const new_inward_rate =
    new_inward_qty > 0 ? new_inward_value / new_inward_qty : 0;

  // Calculate new closing position
  const closing_qty = batch.opening_qty + new_inward_qty - batch.outward_qty;
  const closing_rate =
    closing_qty > 0
      ? (new_inward_value - batch.outward_value) / closing_qty
      : 0;
  const closing_value = closing_qty * closing_rate;

  const res = await db.collection("batch_allocation").findOneAndUpdate(
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
    { returnDocument: "after" }
  );

  if (!res.value) throw new Error("Failed to reverse batch inward");
  return res.value;
}

/**
 * Reverse outward movement from batch (Undo Sales or Credit Note)
 * Subtracts quantity and recalculates weighted average rate
 *
 * @param {String} batchId - Batch ID
 * @param {Number} quantity - Quantity to reverse
 * @param {Number} rate - Rate of the reversed transaction
 * @returns {Object} Updated batch
 */
export async function reverseBatchOutward(batchId, quantity, rate) {
  const db = getDb();

  const batch = await db
    .collection("batch_allocation")
    .findOne({ id: batchId });
  if (!batch) throw new Error("Batch not found");

  // Calculate new outward values (subtract)
  const new_outward_qty = Math.max(0, batch.outward_qty - quantity);
  const new_outward_value = Math.max(0, batch.outward_value - quantity * rate);
  const new_outward_rate =
    new_outward_qty > 0 ? new_outward_value / new_outward_qty : 0;

  // Calculate new closing position
  const closing_qty = batch.opening_qty + batch.inward_qty - new_outward_qty;
  const closing_rate =
    closing_qty > 0
      ? (batch.inward_value - new_outward_value) / closing_qty
      : 0;
  const closing_value = closing_qty * closing_rate;

  const res = await db.collection("batch_allocation").findOneAndUpdate(
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
    { returnDocument: "after" }
  );

  if (!res.value) throw new Error("Failed to reverse batch outward");
  return res.value;
}

/**
 * Generic reverse batch movement (inward or outward)
 * Helper method that routes to specific reverse methods
 *
 * @param {String} batchId - Batch ID
 * @param {String} type - 'inward' or 'outward'
 * @param {Number} quantity - Quantity to reverse
 * @param {Number} rate - Rate of the transaction
 * @returns {Object} Updated batch
 */
export async function reverseBatchMovement(batchId, type, quantity, rate) {
  if (type === "inward") {
    return await reverseBatchInward(batchId, quantity, rate);
  } else if (type === "outward") {
    return await reverseBatchOutward(batchId, quantity, rate);
  } else {
    throw new Error("Invalid movement type. Use 'inward' or 'outward'");
  }
}

/**
 * Delete batch if empty (closing_qty <= 0)
 * Used when batch has no stock and all transactions are reversed
 *
 * @param {String} batchId - Batch ID
 * @returns {Boolean} true if deleted, false if kept
 */
export async function deleteBatchIfEmpty(batchId) {
  const db = getDb();

  const batch = await db
    .collection("batch_allocation")
    .findOne({ id: batchId });

  if (!batch) return false;

  // Only delete if closing quantity is zero or less
  if (batch.closing_qty <= 0) {
    const res = await db
      .collection("batch_allocation")
      .deleteOne({ id: batchId });
    return res.deletedCount === 1;
  }

  return false;
}

/**
 * Update batch outward quantity (for sale modifications)
 */
export async function updateBatchOutward(batchId, outwardQty, outwardRate) {
  const db = getDb();

  // Get current batch
  const batch = await db
    .collection("batch_allocation")
    .findOne({ id: batchId });
  if (!batch) throw new Error("Batch not found");

  // Calculate new outward values
  const new_outward_qty = batch.outward_qty + outwardQty;
  const new_outward_value = batch.outward_value + outwardQty * outwardRate;

  // Calculate new closing position
  const closing_qty = batch.inward_qty - new_outward_qty;
  const closing_rate =
    closing_qty > 0
      ? (batch.inward_value - new_outward_value) / closing_qty
      : 0;
  const closing_value = closing_qty * closing_rate;

  const res = await db.collection("batch_allocation").findOneAndUpdate(
    { id: batchId },
    {
      $set: {
        outward_qty: new_outward_qty,
        outward_rate:
          new_outward_qty > 0 ? new_outward_value / new_outward_qty : 0,
        outward_value: new_outward_value,
        closing_qty,
        closing_rate,
        closing_value,
        updated_at: new Date(),
      },
    },
    { returnDocument: "after" }
  );

  if (!res.value) throw new Error("Failed to update batch outward");
  return res.value;
}

/**
 * Add inward movement to batch (Purchase or Debit Note received)
 * Accumulates quantity and recalculates weighted average rate
 *
 * @param {String} batchId - Batch ID
 * @param {Number} quantity - Quantity to add
 * @param {Number} rate - Rate at which added
 * @returns {Object} Updated batch
 */
export async function addBatchInward(batchId, quantity, rate) {
  const db = getDb();

  const batch = await db
    .collection("batch_allocation")
    .findOne({ id: batchId });
  if (!batch) throw new Error("Batch not found");

  // Calculate new inward values
  const new_inward_qty = batch.inward_qty + quantity;
  const new_inward_value = batch.inward_value + quantity * rate;
  const new_inward_rate =
    new_inward_qty > 0 ? new_inward_value / new_inward_qty : 0;

  // Calculate new closing position
  const closing_qty = batch.opening_qty + new_inward_qty - batch.outward_qty;
  const closing_rate =
    closing_qty > 0
      ? (new_inward_value - batch.outward_value) / closing_qty
      : 0;
  const closing_value = closing_qty * closing_rate;

  const res = await db.collection("batch_allocation").findOneAndUpdate(
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
    { returnDocument: "after" }
  );

  if (!res.value) throw new Error("Failed to add batch inward");
  return res.value;
}

/**
 * Add outward movement to batch (Sales or Credit Note issued)
 * Accumulates quantity and recalculates weighted average rate
 *
 * @param {String} batchId - Batch ID
 * @param {Number} quantity - Quantity to deduct
 * @param {Number} rate - Rate at which deducted
 * @returns {Object} Updated batch
 */
export async function addBatchOutward(batchId, quantity, rate) {
  const db = getDb();

  const batch = await db
    .collection("batch_allocation")
    .findOne({ id: batchId });
  if (!batch) throw new Error("Batch not found");

  // Calculate new outward values
  const new_outward_qty = batch.outward_qty + quantity;
  const new_outward_value = batch.outward_value + quantity * rate;
  const new_outward_rate =
    new_outward_qty > 0 ? new_outward_value / new_outward_qty : 0;

  // Calculate new closing position
  const closing_qty = batch.opening_qty + batch.inward_qty - new_outward_qty;
  const closing_rate =
    closing_qty > 0
      ? (batch.inward_value - new_outward_value) / closing_qty
      : 0;
  const closing_value = closing_qty * closing_rate;

  const res = await db.collection("batch_allocation").findOneAndUpdate(
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
    { returnDocument: "after" }
  );

  if (!res.value) throw new Error("Failed to add batch outward");
  return res.value;
}
