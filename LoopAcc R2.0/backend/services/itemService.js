import { getDb } from "../db.js";
import { v4 as uuidv4 } from "uuid";
import {
  createBatchAllocation,
  createBatchAllocations,
  syncBatchAllocationsForItem,
  deleteBatchAllocationsByItem,
  getBatchAllocationsByItem,
} from "./batchAllocationService.js";

function createInUseError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBatchNumber(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function assertUniqueBatchNumbers(batchDetails) {
  if (!Array.isArray(batchDetails) || batchDetails.length === 0) {
    return;
  }

  const counts = new Map();
  for (const batch of batchDetails) {
    const normalizedBatch = normalizeBatchNumber(batch?.batch_number);
    if (!normalizedBatch) continue;
    counts.set(normalizedBatch, (counts.get(normalizedBatch) || 0) + 1);
  }

  const duplicates = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([batch]) => batch);

  if (duplicates.length > 0) {
    throw new Error(
      `Duplicate batch number not allowed for an item: ${duplicates.join(", ")}`,
    );
  }
}

function recomputeItemStockMetrics(item) {
  const openingQty = toNumber(item.opening_stock ?? item.opening_qty, 0);
  const openingRate = toNumber(item.opening_rate, 0);
  const openingValue =
    item.opening_value !== undefined
      ? toNumber(item.opening_value, 0)
      : openingQty * openingRate;

  const inwardQty = toNumber(item.inward_qty, 0);
  const inwardValue = toNumber(item.inward_value, 0);
  const inwardRate = inwardQty > 0 ? inwardValue / inwardQty : 0;

  const outwardQty = toNumber(item.outward_qty, 0);
  const outwardValue = toNumber(item.outward_value, 0);
  const outwardRate = outwardQty > 0 ? outwardValue / outwardQty : 0;

  const closingQty = openingQty + inwardQty - outwardQty;
  const closingValue = openingValue + inwardValue - outwardValue;
  const closingRate = closingQty > 0 ? closingValue / closingQty : 0;

  return {
    opening_stock: openingQty,
    opening_rate: openingRate,
    opening_value: openingValue,
    inward_qty: inwardQty,
    inward_rate: inwardRate,
    inward_value: inwardValue,
    outward_qty: outwardQty,
    outward_rate: outwardRate,
    outward_value: outwardValue,
    closing_qty: closingQty,
    closing_rate: closingRate,
    closing_value: closingValue,
  };
}

export async function getItemsByCompany(companyId) {
  const db = getDb();
  // Use aggregation to populate related masters and batch allocations
  const items = await db
    .collection("item_master")
    .aggregate([
      { $match: { company_id: companyId } },
      {
        $lookup: {
          from: "uom_master",
          localField: "uom_id",
          foreignField: "id",
          as: "uom_master",
        },
      },
      { $unwind: { path: "$uom_master", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "stock_groups",
          localField: "stock_group_id",
          foreignField: "id",
          as: "stock_groups",
        },
      },
      { $unwind: { path: "$stock_groups", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "stock_categories",
          localField: "stock_category_id",
          foreignField: "id",
          as: "stock_categories",
        },
      },
      {
        $unwind: {
          path: "$stock_categories",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "batch_allocation",
          localField: "id",
          foreignField: "item_id",
          as: "batch_details",
        },
      },
      {
        $project: {
          id: 1,
          name: 1,
          code: 1,
          description: 1,
          company_id: 1,
          uom_id: 1,
          uom_master: 1,
          stock_group_id: 1,
          stock_groups: 1,
          stock_category_id: 1,
          stock_categories: 1,
          purchase_rate: 1,
          sales_rate: 1,
          reorder_level: 1,
          opening_stock: { $ifNull: ["$opening_stock", "$opening_qty"] },
          opening_rate: 1,
          opening_value: 1,
          inward_qty: { $ifNull: ["$inward_qty", 0] },
          inward_rate: { $ifNull: ["$inward_rate", 0] },
          inward_value: { $ifNull: ["$inward_value", 0] },
          outward_qty: { $ifNull: ["$outward_qty", 0] },
          outward_rate: { $ifNull: ["$outward_rate", 0] },
          outward_value: { $ifNull: ["$outward_value", 0] },
          closing_qty: { $ifNull: ["$closing_qty", "$opening_stock"] },
          closing_rate: { $ifNull: ["$closing_rate", 0] },
          closing_value: { $ifNull: ["$closing_value", "$opening_value"] },
          tax_rate: 1,
          cgst_rate: 1,
          sgst_rate: 1,
          igst_rate: 1,
          tax_history: 1,
          enable_batches: { $ifNull: ["$enable_batches", false] },
          batch_details: 1,
          created_at: 1,
          updated_at: 1,
        },
      },
      { $sort: { name: 1 } },
    ])
    .toArray();
  return items;
}

export async function createItem(doc) {
  const db = getDb();
  const id = doc.id || uuidv4();

  // Separate batch_details and enable_batches from item data
  // These should NOT be spread into itemData
  const { batch_details, enable_batches, ...itemData } = doc;

  // Set enable_batches based on user's explicit selection
  // If not provided, default to false (without batch)
  const shouldEnableBatches = enable_batches === true;

  // DEBUG: Log the values being received and set
  console.log(
    `[Item Creation] enable_batches received: ${enable_batches}, shouldEnableBatches: ${shouldEnableBatches}`,
  );

  assertUniqueBatchNumbers(batch_details);

  // Ensure enable_batches is NOT in itemData
  delete itemData?.enable_batches;

  const openingStock = toNumber(itemData?.opening_stock ?? itemData?.opening_qty, 0);
  const openingRate = toNumber(itemData?.opening_rate, 0);
  const openingValue =
    itemData?.opening_value !== undefined
      ? toNumber(itemData?.opening_value, 0)
      : openingStock * openingRate;

  const toInsert = {
    id,
    ...itemData,
    enable_batches: shouldEnableBatches,
    opening_stock: openingStock,
    opening_rate: openingRate,
    opening_value: openingValue,
    inward_qty: 0,
    inward_rate: 0,
    inward_value: 0,
    outward_qty: 0,
    outward_rate: 0,
    outward_value: 0,
    closing_qty: openingStock,
    closing_rate: openingStock > 0 ? openingValue / openingStock : 0,
    closing_value: openingValue,
    // Simplified batch_allocations array for tracking batches in item master
    // Contains: batch_number, qty, rate, amount (no opening/inward/outward/closing)
    batch_allocations: [],
    created_at: new Date(),
    updated_at: new Date(),
  };

  const res = await db.collection("item_master").insertOne(toInsert);
  if (!res.acknowledged) throw new Error("Insert failed");

  // Create batch allocations if provided
  let batchAllocations = [];
  let simplifiedBatchAllocations = [];
  if (
    batch_details &&
    Array.isArray(batch_details) &&
    batch_details.length > 0
  ) {
    try {
      batchAllocations = await createBatchAllocations(
        batch_details,
        id,
        itemData?.company_id,
      );

      // Create simplified batch_allocations array for item_master
      // Contains: batch_number, qty, rate, amount (from opening balance)
      simplifiedBatchAllocations = batch_details.map((batch) => ({
        batch_number: batch.batch_number,
        qty: batch.opening_qty || 0,
        rate: batch.opening_rate || 0,
        amount: batch.opening_value || 0,
      }));

      // Update item_master with simplified batch_allocations array
      await db.collection("item_master").updateOne(
        { id },
        {
          $set: {
            batch_allocations: simplifiedBatchAllocations,
            updated_at: new Date(),
          },
        },
      );
    } catch (error) {
      console.error("Error creating batch allocations:", error);
      // Continue even if batch allocation fails
    }
  } else if (!shouldEnableBatches) {
    // For items without batches enabled, create a PRIMARY batch
    try {
      console.log(
        `[Item Creation] Creating PRIMARY batch for item without batches enabled`,
      );
      const primaryBatchData = {
        batch_number: "primary",
        opening_qty: itemData?.opening_stock || 0,
        opening_rate: itemData?.opening_rate || 0,
        opening_value: itemData?.opening_value || 0,
      };

      const primaryBatch = await createBatchAllocation(
        primaryBatchData,
        id,
        itemData?.company_id,
      );
      console.log(`[Item Creation] PRIMARY batch created:`, primaryBatch.id);
      batchAllocations = [primaryBatch];
    } catch (error) {
      console.error("Error creating PRIMARY batch:", error);
      // Continue even if primary batch creation fails
    }
  }

  return {
    ...toInsert,
    batch_allocations: simplifiedBatchAllocations,
    batch_details: batchAllocations,
  };
}

export async function updateItem(id, update) {
  const db = getDb();

  // Get the existing item to check if name is being updated
  const existingItem = await db.collection("item_master").findOne({ id });
  if (!existingItem) throw new Error("Item not found");

  // Separate batch_details and enable_batches from update data
  const { batch_details, enable_batches, ...itemUpdate } = update;

  assertUniqueBatchNumbers(batch_details);

  // Handle enable_batches based on user's explicit selection
  // Set it only if it's explicitly provided in the update
  if (enable_batches !== undefined && enable_batches !== null) {
    itemUpdate.enable_batches = enable_batches === true;
  } else {
    // If not provided, remove any existing enable_batches from itemUpdate
    delete itemUpdate?.enable_batches;
  }

  const res = await db
    .collection("item_master")
    .findOneAndUpdate(
      { id },
      {
        $set: {
          ...recomputeItemStockMetrics({ ...existingItem, ...itemUpdate }),
          ...itemUpdate,
          updated_at: new Date(),
        },
      },
      { returnDocument: "after" },
    );
  if (!res.value) throw new Error("Update failed");

  // If item name is being updated, cascade update to all references
  if (itemUpdate.name && itemUpdate.name !== existingItem.name) {
    const oldName = existingItem.name;
    const newName = itemUpdate.name;

    // Update voucher line items
    await db
      .collection("vouchers")
      .updateMany(
        { "line_items.item_name": oldName, "line_items.item_id": id },
        { $set: { "line_items.$[elem].item_name": newName } },
        { arrayFilters: [{ "elem.item_id": id }] },
      );

    // Update batch allocations in vouchers
    await db
      .collection("vouchers")
      .updateMany(
        {
          "line_items.batch_allocations.item_name": oldName,
          "line_items.batch_allocations.item_id": id,
        },
        {
          $set: {
            "line_items.$[].batch_allocations.$[elem].item_name": newName,
          },
        },
        { arrayFilters: [{ "elem.item_id": id }] },
      );
  }

  // Update batch allocations if provided
  if (batch_details !== undefined && Array.isArray(batch_details)) {
    try {
      // Get company_id from the updated item
      const updatedItem = res.value;
      await syncBatchAllocationsForItem(batch_details, id, updatedItem.company_id);

      // Fetch updated batch allocations and include in response
      const batchAllocations = await getBatchAllocationsByItem(
        id,
        updatedItem.company_id,
      );

      // Create simplified batch_allocations array for item_master
      const simplifiedBatchAllocations = batchAllocations.map((batch) => ({
        batch_number: batch.batch_number,
        qty: batch.opening_qty || batch.qty || 0,
        rate: batch.opening_rate || batch.rate || 0,
        amount: batch.opening_value || batch.amount || 0,
      }));

      const totals = batchAllocations.reduce(
        (acc, batch) => {
          acc.opening_qty += toNumber(batch.opening_qty, 0);
          acc.opening_value += toNumber(batch.opening_value, 0);
          acc.inward_qty += toNumber(batch.inward_qty, 0);
          acc.inward_value += toNumber(batch.inward_value, 0);
          acc.outward_qty += toNumber(batch.outward_qty, 0);
          acc.outward_value += toNumber(batch.outward_value, 0);
          acc.closing_qty += toNumber(batch.closing_qty, 0);
          acc.closing_value += toNumber(batch.closing_value, 0);
          return acc;
        },
        {
          opening_qty: 0,
          opening_value: 0,
          inward_qty: 0,
          inward_value: 0,
          outward_qty: 0,
          outward_value: 0,
          closing_qty: 0,
          closing_value: 0,
        },
      );

      const openingRate =
        totals.opening_qty > 0 ? totals.opening_value / totals.opening_qty : 0;
      const inwardRate =
        totals.inward_qty > 0 ? totals.inward_value / totals.inward_qty : 0;
      const outwardRate =
        totals.outward_qty > 0 ? totals.outward_value / totals.outward_qty : 0;
      const closingRate =
        totals.closing_qty > 0 ? totals.closing_value / totals.closing_qty : 0;

      // Update item_master with simplified batch_allocations array
      await db.collection("item_master").updateOne(
        { id },
        {
          $set: {
            batch_allocations: simplifiedBatchAllocations,
            opening_stock: totals.opening_qty,
            opening_rate: openingRate,
            opening_value: totals.opening_value,
            inward_qty: totals.inward_qty,
            inward_rate: inwardRate,
            inward_value: totals.inward_value,
            outward_qty: totals.outward_qty,
            outward_rate: outwardRate,
            outward_value: totals.outward_value,
            closing_qty: totals.closing_qty,
            closing_rate: closingRate,
            closing_value: totals.closing_value,
            updated_at: new Date(),
          },
        },
      );

      const finalItem = await db.collection("item_master").findOne({ id });

      return {
        ...(finalItem || res.value),
        batch_allocations: simplifiedBatchAllocations,
        batch_details: batchAllocations,
      };
    } catch (error) {
      console.error("Error updating batch allocations:", error);
      // Return updated item even if batch allocation update fails
      return res.value;
    }
  }

  return res.value;
}

export async function deleteItem(id) {
  const db = getDb();

  // Check if item is used in any voucher line items across supported schemas
  const voucherCount = await db.collection("vouchers").countDocuments({
    $or: [
      { "line_items.item_id": id },
      { "inventory.item_id": id },
      { "details.item_id": id },
    ],
  });
  if (voucherCount > 0) {
    throw createInUseError(
      `Cannot delete item. It is used in ${voucherCount} voucher/vouchers.`,
    );
  }

  // Check if item is used in any bills
  const billCount = await db.collection("bills").countDocuments({
    "line_items.item_id": id,
  });
  if (billCount > 0) {
    throw createInUseError(
      `Cannot delete item. It is used in ${billCount} bill/bills.`,
    );
  }

  // Delete associated batch allocations first
  await deleteBatchAllocationsByItem(id);

  const res = await db.collection("item_master").deleteOne({ id });
  return res.deletedCount === 1;
}
