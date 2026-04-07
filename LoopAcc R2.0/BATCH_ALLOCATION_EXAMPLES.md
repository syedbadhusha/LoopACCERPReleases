# Batch Allocation - Practical Usage Examples

## Complete Workflow Examples

### Example 1: Pharmaceutical Product with Multiple Batches

**Scenario**: Managing Paracetamol 500mg with 3 batches

#### Step 1: Create Item with Batches

```javascript
// Create item with initial batches
const item = {
  name: "Paracetamol 500mg",
  code: "PARA-500",
  enable_batches: true,
  opening_stock: 300, // Total opening: 100+100+100
  opening_rate: 5.5,
  opening_value: 1650,
  batch_details: [
    {
      batch_number: "B001",
      opening_qty: 100,
      opening_rate: 5.5,
      opening_value: 550,
    },
    {
      batch_number: "B002",
      opening_qty: 100,
      opening_rate: 5.5,
      opening_value: 550,
    },
    {
      batch_number: "B003",
      opening_qty: 100,
      opening_rate: 5.5,
      opening_value: 550,
    },
  ],
};

const createdItem = await createItem(item);
console.log(`Item created with ${createdItem.batch_details.length} batches`);
```

**Batch State After Creation:**

```
B001: opening_qty: 100, inward_qty: 100, outward_qty: 0, closing_qty: 100
B002: opening_qty: 100, inward_qty: 100, outward_qty: 0, closing_qty: 100
B003: opening_qty: 100, inward_qty: 100, outward_qty: 0, closing_qty: 100
TOTAL CLOSING: 300
```

#### Step 2: Purchase Voucher (Add Inward)

```javascript
// Purchase 150 units of B001 @ 5.75 from supplier
const purchaseVoucher = {
  voucher_type: "purchase",
  voucher_number: "PO-001",
  supplier_ledger_id: "supplier-123",
  line_items: [
    {
      item_id: "para-500-id",
      batch_id: "batch-b001-id",
      batch_number: "B001",
      quantity: 150,
      rate: 5.75,
      amount: 862.5,
    },
  ],
};

// In voucherService.js
for (const line of purchaseVoucher.line_items) {
  await addBatchInward(line.batch_id, line.quantity, line.rate);
}
```

**Batch B001 State After Purchase:**

```
{
  opening_qty: 100,
  inward_qty: 250,         // 100 + 150
  inward_rate: 5.62,       // (550 + 862.50) / 250 = 1412.50 / 250
  inward_value: 1412.50,   // 550 + 862.50
  outward_qty: 0,
  closing_qty: 250,        // 100 + 250 - 0
  closing_rate: 5.65,      // 1412.50 / 250
  closing_value: 1412.50
}
```

#### Step 3: Sales Voucher (Add Outward)

```javascript
// Sales: 80 units of B001 @ 8.50, 60 units of B002 @ 8.50
const salesVoucher = {
  voucher_type: "sales",
  voucher_number: "SL-001",
  customer_ledger_id: "customer-456",
  line_items: [
    {
      item_id: "para-500-id",
      batch_id: "batch-b001-id",
      batch_number: "B001",
      quantity: 80,
      rate: 8.5,
      amount: 680,
    },
    {
      item_id: "para-500-id",
      batch_id: "batch-b002-id",
      batch_number: "B002",
      quantity: 60,
      rate: 8.5,
      amount: 510,
    },
  ],
};

// In voucherService.js
for (const line of salesVoucher.line_items) {
  await addBatchOutward(line.batch_id, line.quantity, line.rate);
}
```

**Batch States After Sales:**

```
B001 After Sales:
{
  opening_qty: 100,
  inward_qty: 250,
  inward_rate: 5.62,
  inward_value: 1412.50,
  outward_qty: 80,         // NEW
  outward_rate: 8.50,      // NEW
  outward_value: 680,      // NEW
  closing_qty: 270,        // 100 + 250 - 80
  closing_rate: 2.71,      // (1412.50 - 680) / 270 = 732.50 / 270
  closing_value: 732.50
}

B002 After Sales:
{
  opening_qty: 100,
  inward_qty: 100,
  inward_rate: 5.50,
  inward_value: 550,
  outward_qty: 60,         // NEW
  outward_rate: 8.50,      // NEW
  outward_value: 510,      // NEW
  closing_qty: 140,        // 100 + 100 - 60
  closing_rate: 0.29,      // (550 - 510) / 140 = 40 / 140
  closing_value: 40
}

B003 (unchanged):
{
  closing_qty: 100
}

TOTAL CLOSING: 270 + 140 + 100 = 510 units
```

#### Step 4: Customer Return (Credit Note)

```javascript
// Customer returns 20 units of B001 @ 8.50
const creditNote = {
  notes_type: "credit_note",
  notes_number: "CN-001",
  notes_for: "customer",
  customer_ledger_id: "customer-456",
  line_items: [
    {
      item_id: "para-500-id",
      batch_id: "batch-b001-id",
      batch_number: "B001",
      quantity: 20,
      rate: 8.5,
      amount: 170,
    },
  ],
};

// Credit Note is OUTWARD (customer return)
for (const line of creditNote.line_items) {
  await addBatchOutward(line.batch_id, line.quantity, line.rate);
}
```

**Batch B001 After Credit Note (Return):**

```
{
  outward_qty: 100,        // 80 + 20
  outward_value: 850,      // 680 + 170
  closing_qty: 250,        // 100 + 250 - 100
  closing_rate: 2.65,      // (1412.50 - 850) / 250 = 562.50 / 250
  closing_value: 662.50
}
```

#### Step 5: Cancel Sales Transaction

```javascript
// User cancels sales of 50 units of B001 from sales voucher
const cancelledQuantity = 50;
const cancelledRate = 8.5;

await reverseBatchOutward("batch-b001-id", cancelledQuantity, cancelledRate);

// Check if batch should be deleted (it won't be if closing > 0)
await deleteBatchIfEmpty("batch-b001-id");
```

**Batch B001 After Cancellation:**

```
{
  outward_qty: 50,         // 100 - 50
  outward_value: 425,      // 850 - 425
  closing_qty: 300,        // 100 + 250 - 50
  closing_rate: 3.58,      // (1412.50 - 425) / 300 = 987.50 / 300
  closing_value: 987.50
}
```

---

### Example 2: Different Items, Same Batch Number

**Scenario**: Warehouse managing multiple products with same batch numbering scheme

```javascript
// Item A: Paracetamol
const itemA = {
  name: "Paracetamol 500mg",
  code: "PARA-500",
  enable_batches: true,
  opening_stock: 100,
  batch_details: [
    {
      batch_number: "2024-JAN",
      opening_qty: 100,
      opening_rate: 5.0,
      opening_value: 500,
    },
  ],
};

// Item B: Aspirin
const itemB = {
  name: "Aspirin 75mg",
  code: "ASPR-75",
  enable_batches: true,
  opening_stock: 200,
  batch_details: [
    {
      batch_number: "2024-JAN", // ← SAME batch number as Paracetamol
      opening_qty: 200,
      opening_rate: 3.0,
      opening_value: 600,
    },
  ],
};

await createItem(itemA);
await createItem(itemB);

// In database:
// batch_allocation: {
//   { item_id: 'para-id', batch_number: '2024-JAN', opening_qty: 100 }
//   { item_id: 'aspr-id', batch_number: '2024-JAN', opening_qty: 200 }
// }
// These are SEPARATE records - no conflict!
```

**Query All Batches for Item A:**

```javascript
const paracelBatches = await getBatchAllocationsByItem(
  "para-id",
  "company-123"
);
// Returns only Paracetamol's 2024-JAN batch

const aspirinBatches = await getBatchAllocationsByItem(
  "aspr-id",
  "company-123"
);
// Returns only Aspirin's 2024-JAN batch (different record)
```

---

### Example 3: Complete Stock Report

```javascript
async function generateBatchWiseReport(companyId) {
  const db = getDb();

  return await db
    .collection("batch_allocation")
    .aggregate([
      { $match: { company_id: companyId } },
      {
        $lookup: {
          from: "item_master",
          localField: "item_id",
          foreignField: "id",
          as: "item",
        },
      },
      { $unwind: "$item" },
      {
        $project: {
          item_name: "$item.name",
          item_code: "$item.code",
          batch_number: 1,
          opening_qty: 1,
          inward_qty: 1,
          outward_qty: 1,
          closing_qty: 1,
          closing_rate: 1,
          closing_value: 1,
          expiry_status: {
            $cond: [{ $lt: ["$expiry_date", new Date()] }, "Expired", "Valid"],
          },
        },
      },
      {
        $group: {
          _id: "$item_name",
          batches: {
            $push: {
              batch_number: "$batch_number",
              closing_qty: "$closing_qty",
              closing_value: "$closing_value",
            },
          },
          total_closing: { $sum: "$closing_qty" },
          total_value: { $sum: "$closing_value" },
        },
      },
      { $sort: { item_name: 1 } },
    ])
    .toArray();
}

// Sample output:
// [
//   {
//     _id: 'Paracetamol 500mg',
//     batches: [
//       { batch_number: 'B001', closing_qty: 270, closing_value: 1412.50 },
//       { batch_number: 'B002', closing_qty: 140, closing_value: 650 },
//       { batch_number: 'B003', closing_qty: 100, closing_value: 550 }
//     ],
//     total_closing: 510,
//     total_value: 2612.50
//   },
//   ...
// ]
```

---

### Example 4: Handling Inventory Adjustment

**Scenario**: Physical count shows 5 units missing from B001

```javascript
async function adjustBatchInventory(batchId, discrepancy, reason) {
  const db = getDb();
  const batch = await db
    .collection("batch_allocation")
    .findOne({ id: batchId });

  if (!batch) {
    throw new Error("Batch not found");
  }

  // Adjustment is considered OUTWARD (loss/damage)
  // Use the current closing_rate for adjustment
  const adjustmentRate = batch.closing_rate || batch.inward_rate || 0;

  // Record adjustment as outward movement
  const updated = await addBatchOutward(
    batchId,
    Math.abs(discrepancy),
    adjustmentRate
  );

  // Create adjustment note for audit trail
  const adjustment = {
    id: uuidv4(),
    batch_id: batchId,
    type: "inventory_adjustment",
    quantity: discrepancy,
    reason: reason,
    rate: adjustmentRate,
    value: discrepancy * adjustmentRate,
    previous_closing_qty: batch.closing_qty,
    new_closing_qty: updated.closing_qty,
    created_at: new Date(),
  };

  await db.collection("batch_adjustments").insertOne(adjustment);

  return updated;
}

// Usage:
await adjustBatchInventory(
  "batch-b001-id",
  5,
  "Physical count discrepancy - shortage"
);
```

**Batch B001 After Adjustment:**

```
Assuming before adjustment: closing_qty: 300, closing_rate: 5.00

After adjustment (5 units missing):
{
  outward_qty: (previous + 5),
  closing_qty: 295,        // 300 - 5
  closing_rate: 5.00,      // unchanged (using same rate)
  closing_value: 1475      // 295 × 5.00
}
```

---

### Example 5: Batch Transfer Between Locations (Multi-Warehouse)

```javascript
async function transferBatchBetweenWarehouses(
  batchId,
  quantity,
  fromWarehouseId,
  toWarehouseId
) {
  const db = getDb();

  // Step 1: Record outward from source warehouse
  const outwardRecord = await addBatchOutward(
    batchId,
    quantity,
    batch.closing_rate // Use current rate
  );

  // Step 2: Create transfer voucher
  const transferVoucher = {
    id: uuidv4(),
    voucher_type: "transfer",
    batch_id: batchId,
    from_warehouse: fromWarehouseId,
    to_warehouse: toWarehouseId,
    quantity: quantity,
    rate: outwardRecord.closing_rate,
    status: "pending",
  };

  await db.collection("transfer_vouchers").insertOne(transferVoucher);

  return transferVoucher;
}

// For now, this records it as an outward from source location
// When received in destination warehouse, create inward entry for that location
```

---

### Example 6: Expiry Batch Removal

```javascript
async function removeBatchAtExpiry(batchId, expiryDate) {
  const db = getDb();
  const batch = await db
    .collection("batch_allocation")
    .findOne({ id: batchId });

  if (!batch) {
    throw new Error("Batch not found");
  }

  // If batch still has closing qty at expiry
  if (batch.closing_qty > 0) {
    // Record as outward (loss due to expiry)
    const removal = await addBatchOutward(
      batchId,
      batch.closing_qty,
      batch.closing_rate
    );

    // Create expiry record
    const expiryRecord = {
      id: uuidv4(),
      batch_id: batchId,
      item_id: batch.item_id,
      expiry_date: expiryDate,
      quantity_expired: batch.closing_qty,
      value_lost: batch.closing_value,
      created_at: new Date(),
    };

    await db.collection("batch_expiries").insertOne(expiryRecord);

    // Now delete the batch (since closing_qty should be 0)
    const deleted = await deleteBatchIfEmpty(batchId);

    return {
      success: deleted,
      quantityRemoved: batch.closing_qty,
      valueLost: batch.closing_value,
    };
  }

  return { success: true, quantityRemoved: 0 };
}

// Usage:
await removeBatchAtExpiry("batch-b001-id", new Date("2024-12-31"));
```

---

### Example 7: Stock Alert Query

```javascript
async function getLowStockBatches(companyId, minThreshold = 50) {
  const db = getDb();

  return await db
    .collection("batch_allocation")
    .aggregate([
      { $match: { company_id: companyId } },
      {
        $lookup: {
          from: "item_master",
          localField: "item_id",
          foreignField: "id",
          as: "item",
        },
      },
      { $unwind: "$item" },
      {
        $match: {
          closing_qty: { $lte: minThreshold, $gt: 0 },
        },
      },
      {
        $project: {
          item_name: "$item.name",
          item_code: "$item.code",
          batch_number: 1,
          closing_qty: 1,
          closing_rate: 1,
          closing_value: 1,
          reorder_level: "$item.reorder_level",
          status: {
            $cond: [
              {
                $lte: [
                  "$closing_qty",
                  { $multiply: ["$item.reorder_level", 0.5] },
                ],
              },
              "Critical",
              "Low",
            ],
          },
        },
      },
      { $sort: { closing_qty: 1 } },
    ])
    .toArray();
}

// Returns batches with critically low stock for reordering
```

---

### Example 8: Batch Consolidation Report

```javascript
async function getBatchConsolidationReport(companyId) {
  const db = getDb();

  // Group by item to see all batches and suggest consolidation
  return await db
    .collection("batch_allocation")
    .aggregate([
      { $match: { company_id: companyId, closing_qty: { $gt: 0 } } },
      {
        $lookup: {
          from: "item_master",
          localField: "item_id",
          foreignField: "id",
          as: "item",
        },
      },
      { $unwind: "$item" },
      {
        $group: {
          _id: "$item_id",
          item_name: { $first: "$item.name" },
          item_code: { $first: "$item.code" },
          batch_count: { $sum: 1 },
          batches: {
            $push: {
              batch_number: "$batch_number",
              closing_qty: "$closing_qty",
              closing_rate: { $round: ["$closing_rate", 2] },
            },
          },
          total_qty: { $sum: "$closing_qty" },
          weighted_avg_rate: {
            $divide: [{ $sum: "$closing_value" }, { $sum: "$closing_qty" }],
          },
        },
      },
      {
        $match: { batch_count: { $gt: 1 } }, // Only items with multiple batches
      },
      { $sort: { batch_count: -1 } },
    ])
    .toArray();
}

// Output shows items with multiple batches for consolidation analysis
// Example: Paracetamol has 3 batches, could be consolidated to 1
```

---

## Error Handling Examples

### Safe Batch Addition

```javascript
async function safeBatchInwardAddition(batchId, quantity, rate) {
  try {
    // Validation
    if (!batchId) throw new Error("Batch ID required");
    if (quantity <= 0) throw new Error("Quantity must be positive");
    if (rate < 0) throw new Error("Rate cannot be negative");

    // Get batch to validate exists
    const batch = await db
      .collection("batch_allocation")
      .findOne({ id: batchId });
    if (!batch) throw new Error(`Batch ${batchId} not found`);

    // Perform update
    const result = await addBatchInward(batchId, quantity, rate);

    // Validate result
    if (!result) throw new Error("Update failed unexpectedly");

    // Log for audit
    console.log(`✓ Added ${quantity} units to batch ${batch.batch_number}`);

    return result;
  } catch (error) {
    console.error(`✗ Error adding inward:`, error.message);
    throw error;
  }
}
```

### Transaction Consistency Check

```javascript
async function validateBatchConsistency(batchId) {
  const batch = await db
    .collection("batch_allocation")
    .findOne({ id: batchId });

  // Check calculated vs stored closing_qty
  const calculated = batch.opening_qty + batch.inward_qty - batch.outward_qty;
  if (Math.abs(calculated - batch.closing_qty) > 0.01) {
    console.warn(`⚠ Batch ${batchId} inconsistency detected`);
    console.warn(`  Calculated: ${calculated}, Stored: ${batch.closing_qty}`);

    // Optionally auto-correct
    return await db
      .collection("batch_allocation")
      .updateOne({ id: batchId }, { $set: { closing_qty: calculated } });
  }

  return true;
}
```

---

## Summary

These examples demonstrate:

- ✅ Creating batches with opening balance
- ✅ Adding inward (purchases/debit notes)
- ✅ Adding outward (sales/credit notes)
- ✅ Reversing transactions
- ✅ Same batch number across items
- ✅ Generating reports
- ✅ Inventory adjustments
- ✅ Stock alerts
- ✅ Batch consolidation
- ✅ Error handling

Use these patterns to integrate batch allocation into your Voucher, Item, and Report services.
