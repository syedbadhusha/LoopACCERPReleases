# Batch Allocation - Voucher Service Integration Guide

## 📌 Overview

This guide shows how to integrate the Batch Allocation system into your Voucher Service to properly track inventory movements through purchases, sales, debit notes, and credit notes.

---

## 🔗 Integration Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Voucher Service                        │
│  (Purchase, Sales, Debit Note, Credit Note)              │
└────────────────┬────────────────────────────────────────┘
                 │
                 ├─→ addBatchInward()    ← Purchase/Debit
                 │
                 ├─→ addBatchOutward()   ← Sales/Credit
                 │
                 └─→ reverseBatchMovement() ← Delete/Undo

┌─────────────────────────────────────────────────────────┐
│         Batch Allocation Service                          │
│  (Track Opening, Inward, Outward, Closing)              │
└────────────────┬────────────────────────────────────────┘
                 │
                 └─→ batch_allocation Collection

                 Opening + Inward - Outward = Closing
```

---

## 🎯 Implementation Steps

### Step 1: Import Batch Allocation Methods

In `voucherService.js`, add imports:

```javascript
import {
  addBatchInward,
  addBatchOutward,
  reverseBatchInward,
  reverseBatchOutward,
  reverseBatchMovement,
  deleteBatchIfEmpty,
} from "./batchAllocationService.js";
```

### Step 2: Create Voucher with Batch Tracking

When creating a purchase or sales voucher:

```javascript
async function createVoucher(voucherData) {
  const db = getDb();

  // Validate voucher type
  const isInward = ["purchase", "debit_note"].includes(
    voucherData.voucher_type
  );
  const isOutward = ["sales", "credit_note"].includes(voucherData.voucher_type);

  // Validate line items have required batch info
  for (const line of voucherData.line_items) {
    if (!line.item_id) throw new Error("item_id required");
    if (!line.quantity || line.quantity <= 0)
      throw new Error("Invalid quantity");
    if (!line.rate || line.rate < 0) throw new Error("Invalid rate");

    // If item has batches enabled, require batch_id
    const item = await db
      .collection("item_master")
      .findOne({ id: line.item_id });
    if (item && item.enable_batches && !line.batch_id) {
      throw new Error(`Batch required for ${item.name}`);
    }
  }

  // Create voucher
  const voucher = {
    id: uuidv4(),
    ...voucherData,
    created_at: new Date(),
    updated_at: new Date(),
    status: "posted",
  };

  // Create batch movements
  try {
    for (const line of voucherData.line_items) {
      if (line.batch_id) {
        if (isInward) {
          await addBatchInward(line.batch_id, line.quantity, line.rate);
        } else if (isOutward) {
          await addBatchOutward(line.batch_id, line.quantity, line.rate);
        }
      }
    }
  } catch (error) {
    console.error("Error updating batch:", error);
    throw new Error(`Batch update failed: ${error.message}`);
  }

  // Save voucher
  const res = await db.collection("vouchers").insertOne(voucher);
  if (!res.acknowledged) throw new Error("Voucher creation failed");

  return voucher;
}
```

### Step 3: Update Voucher (Modify Line Items)

When updating a voucher with new quantities:

```javascript
async function updateVoucher(voucherId, updates) {
  const db = getDb();

  // Get original voucher
  const original = await db.collection("vouchers").findOne({ id: voucherId });
  if (!original) throw new Error("Voucher not found");

  const isInward = ["purchase", "debit_note"].includes(original.voucher_type);
  const isOutward = ["sales", "credit_note"].includes(original.voucher_type);

  // Process each updated line
  for (const updatedLine of updates.line_items) {
    const originalLine = original.line_items.find(
      (l) => l.id === updatedLine.id
    );

    if (!originalLine) continue; // New line, will handle in create

    // If quantity changed, reverse old and add new
    if (originalLine.quantity !== updatedLine.quantity) {
      if (originalLine.batch_id) {
        // Reverse old quantity
        await reverseBatchMovement(
          originalLine.batch_id,
          isInward ? "inward" : "outward",
          originalLine.quantity,
          originalLine.rate
        );

        // Add new quantity
        if (isInward) {
          await addBatchInward(
            updatedLine.batch_id,
            updatedLine.quantity,
            updatedLine.rate
          );
        } else if (isOutward) {
          await addBatchOutward(
            updatedLine.batch_id,
            updatedLine.quantity,
            updatedLine.rate
          );
        }

        // Cleanup if batch is now empty
        await deleteBatchIfEmpty(originalLine.batch_id);
      }
    }

    // If batch changed, reverse old and add to new
    if (originalLine.batch_id !== updatedLine.batch_id) {
      // Reverse from old batch
      await reverseBatchMovement(
        originalLine.batch_id,
        isInward ? "inward" : "outward",
        originalLine.quantity,
        originalLine.rate
      );
      await deleteBatchIfEmpty(originalLine.batch_id);

      // Add to new batch
      if (isInward) {
        await addBatchInward(
          updatedLine.batch_id,
          updatedLine.quantity,
          updatedLine.rate
        );
      } else if (isOutward) {
        await addBatchOutward(
          updatedLine.batch_id,
          updatedLine.quantity,
          updatedLine.rate
        );
      }
    }
  }

  // Update voucher
  const res = await db.collection("vouchers").findOneAndUpdate(
    { id: voucherId },
    {
      $set: {
        ...updates,
        updated_at: new Date(),
      },
    },
    { returnDocument: "after" }
  );

  return res.value;
}
```

### Step 4: Delete Voucher Line Item

When removing a line from a voucher:

```javascript
async function deleteVoucherLine(voucherId, lineId) {
  const db = getDb();

  // Get voucher
  const voucher = await db.collection("vouchers").findOne({ id: voucherId });
  if (!voucher) throw new Error("Voucher not found");

  // Find line to delete
  const lineToDelete = voucher.line_items.find((l) => l.id === lineId);
  if (!lineToDelete) throw new Error("Line not found");

  // Determine movement type
  const isInward = ["purchase", "debit_note"].includes(voucher.voucher_type);
  const movementType = isInward ? "inward" : "outward";

  // Reverse batch movement if batch exists
  if (lineToDelete.batch_id) {
    try {
      await reverseBatchMovement(
        lineToDelete.batch_id,
        movementType,
        lineToDelete.quantity,
        lineToDelete.rate
      );

      // Clean up empty batch
      await deleteBatchIfEmpty(lineToDelete.batch_id);
    } catch (error) {
      console.error(`Error reversing batch movement:`, error);
      throw error;
    }
  }

  // Remove line from voucher
  const res = await db.collection("vouchers").findOneAndUpdate(
    { id: voucherId },
    {
      $pull: {
        line_items: { id: lineId },
      },
      $set: {
        updated_at: new Date(),
      },
    },
    { returnDocument: "after" }
  );

  return res.value;
}
```

### Step 5: Delete Entire Voucher

When deleting a complete voucher:

```javascript
async function deleteVoucher(voucherId) {
  const db = getDb();

  // Get voucher
  const voucher = await db.collection("vouchers").findOne({ id: voucherId });
  if (!voucher) throw new Error("Voucher not found");

  // Determine movement type
  const isInward = ["purchase", "debit_note"].includes(voucher.voucher_type);
  const movementType = isInward ? "inward" : "outward";

  // Reverse all batch movements
  for (const line of voucher.line_items) {
    if (line.batch_id) {
      try {
        await reverseBatchMovement(
          line.batch_id,
          movementType,
          line.quantity,
          line.rate
        );

        // Clean up empty batches
        await deleteBatchIfEmpty(line.batch_id);
      } catch (error) {
        console.error(`Error reversing batch for line ${line.id}:`, error);
        // Continue with other lines even if one fails
      }
    }
  }

  // Delete voucher
  const res = await db.collection("vouchers").deleteOne({ id: voucherId });

  return res.deletedCount === 1;
}
```

---

## 📋 Transaction Type Mapping

### Purchase Voucher (INWARD)

```javascript
voucher_type: 'purchase'
→ Use: addBatchInward()
→ Direction: Stock ⬆️ increases
→ From: Supplier
```

**Example:**

```javascript
const purchase = {
  voucher_type: "purchase",
  supplier_id: "supplier-123",
  line_items: [
    {
      item_id: "item-id",
      batch_id: "batch-id",
      quantity: 100,
      rate: 5.5,
    },
  ],
};

// This will call: addBatchInward(batch_id, 100, 5.50)
```

### Sales Voucher (OUTWARD)

```javascript
voucher_type: 'sales'
→ Use: addBatchOutward()
→ Direction: Stock ⬇️ decreases
→ To: Customer
```

**Example:**

```javascript
const sales = {
  voucher_type: "sales",
  customer_id: "customer-456",
  line_items: [
    {
      item_id: "item-id",
      batch_id: "batch-id",
      quantity: 50,
      rate: 8.5,
    },
  ],
};

// This will call: addBatchOutward(batch_id, 50, 8.50)
```

### Debit Note (INWARD)

```javascript
voucher_type: 'debit_note'
notes_for: 'supplier'
→ Use: addBatchInward()
→ Direction: Stock ⬆️ increases
→ Scenario: Supplier sends extra units/goods received
```

**Example:**

```javascript
const debitNote = {
  voucher_type: "debit_note",
  notes_for: "supplier",
  supplier_id: "supplier-123",
  line_items: [
    {
      item_id: "item-id",
      batch_id: "batch-id",
      quantity: 20,
      rate: 5.5,
    },
  ],
};

// This will call: addBatchInward(batch_id, 20, 5.50)
```

### Credit Note (OUTWARD)

```javascript
voucher_type: 'credit_note'
notes_for: 'customer'
→ Use: addBatchOutward()
→ Direction: Stock ⬇️ decreases
→ Scenario: Customer returns goods/deduction
```

**Example:**

```javascript
const creditNote = {
  voucher_type: "credit_note",
  notes_for: "customer",
  customer_id: "customer-456",
  line_items: [
    {
      item_id: "item-id",
      batch_id: "batch-id",
      quantity: 10,
      rate: 8.5,
    },
  ],
};

// This will call: addBatchOutward(batch_id, 10, 8.50)
```

---

## 🔒 Stock Validation

Before creating an outward movement (sales/credit note), validate stock:

```javascript
async function validateSufficientStock(batchId, requestedQty) {
  const db = getDb();

  const batch = await db
    .collection("batch_allocation")
    .findOne({ id: batchId });

  if (!batch) {
    throw new Error("Batch not found");
  }

  if (batch.closing_qty < requestedQty) {
    throw new Error(
      `Insufficient stock. Available: ${batch.closing_qty}, Requested: ${requestedQty}`
    );
  }

  return true;
}

// Use in createVoucher:
async function createSalesVoucher(voucherData) {
  // Validate stock for all lines
  for (const line of voucherData.line_items) {
    if (line.batch_id) {
      await validateSufficientStock(line.batch_id, line.quantity);
    }
  }

  // Continue with voucher creation...
}
```

---

## 🔄 Error Handling

Implement proper error handling for batch operations:

```javascript
async function createVoucherWithErrorHandling(voucherData) {
  const db = getDb();
  const session = db.startSession();

  try {
    await session.withTransaction(async () => {
      // Validate all data first
      for (const line of voucherData.line_items) {
        if (line.batch_id) {
          const batch = await db
            .collection("batch_allocation")
            .findOne({ id: line.batch_id });
          if (!batch) {
            throw new Error(`Batch ${line.batch_id} not found`);
          }
        }
      }

      // Create voucher
      const voucher = {
        id: uuidv4(),
        ...voucherData,
        created_at: new Date(),
      };

      await db.collection("vouchers").insertOne(voucher, { session });

      // Update batches
      for (const line of voucherData.line_items) {
        if (line.batch_id) {
          if (["purchase", "debit_note"].includes(voucherData.voucher_type)) {
            await addBatchInward(line.batch_id, line.quantity, line.rate);
          } else {
            await addBatchOutward(line.batch_id, line.quantity, line.rate);
          }
        }
      }

      return voucher;
    });
  } catch (error) {
    console.error("Transaction failed:", error);
    // Transaction automatically rolled back
    throw error;
  } finally {
    await session.endSession();
  }
}
```

---

## 📊 Batch-wise Voucher Report

Generate reports showing batch movements through vouchers:

```javascript
async function getBatchMovementHistory(batchId, companyId) {
  const db = getDb();

  return await db
    .collection("vouchers")
    .aggregate([
      {
        $match: { company_id: companyId },
      },
      {
        $unwind: "$line_items",
      },
      {
        $match: {
          "line_items.batch_id": batchId,
        },
      },
      {
        $project: {
          voucher_date: 1,
          voucher_type: 1,
          voucher_number: 1,
          batch_number: "$line_items.batch_number",
          quantity: "$line_items.quantity",
          rate: "$line_items.rate",
          amount: "$line_items.amount",
          movement_type: {
            $cond: [
              { $in: ["$voucher_type", ["purchase", "debit_note"]] },
              "Inward",
              "Outward",
            ],
          },
        },
      },
      { $sort: { voucher_date: 1 } },
    ])
    .toArray();
}
```

---

## 🧪 Testing Batch Voucher Operations

Create test cases:

```javascript
async function testBatchVoucherWorkflow() {
  const companyId = "test-company";
  const itemId = "test-item";

  // 1. Create item with batch
  console.log("1. Creating item with batch...");
  const item = await createItem({
    id: itemId,
    name: "Test Product",
    enable_batches: true,
    opening_stock: 100,
    opening_rate: 5,
    company_id: companyId,
    batch_details: [
      {
        batch_number: "B001",
        opening_qty: 100,
        opening_rate: 5,
        opening_value: 500,
      },
    ],
  });

  const batchId = item.batch_details[0].id;
  console.log(`✓ Item created with batch ${batchId}`);

  // 2. Create purchase voucher (INWARD)
  console.log("\n2. Creating purchase voucher...");
  const purchase = await createVoucher({
    voucher_type: "purchase",
    company_id: companyId,
    line_items: [
      {
        item_id: itemId,
        batch_id: batchId,
        quantity: 50,
        rate: 6,
      },
    ],
  });
  console.log(`✓ Purchase created. Stock should be: 100 + 50 = 150`);

  // 3. Create sales voucher (OUTWARD)
  console.log("\n3. Creating sales voucher...");
  const sales = await createVoucher({
    voucher_type: "sales",
    company_id: companyId,
    line_items: [
      {
        item_id: itemId,
        batch_id: batchId,
        quantity: 80,
        rate: 8,
      },
    ],
  });
  console.log(`✓ Sales created. Stock should be: 150 - 80 = 70`);

  // 4. Verify batch state
  console.log("\n4. Verifying batch state...");
  const batch = await db
    .collection("batch_allocation")
    .findOne({ id: batchId });
  console.log(`   Opening: ${batch.opening_qty}`);
  console.log(`   Inward: ${batch.inward_qty} @ ${batch.inward_rate}`);
  console.log(`   Outward: ${batch.outward_qty} @ ${batch.outward_rate}`);
  console.log(`   Closing: ${batch.closing_qty} @ ${batch.closing_rate}`);

  // 5. Delete sales line
  console.log("\n5. Deleting sales line...");
  const salesLine = sales.line_items[0];
  await deleteVoucherLine(sales.id, salesLine.id);
  console.log(`✓ Sales line deleted. Stock should be: 150 again`);

  // 6. Verify batch state after deletion
  console.log("\n6. Verifying batch state after deletion...");
  const batchAfter = await db
    .collection("batch_allocation")
    .findOne({ id: batchId });
  console.log(`   Closing: ${batchAfter.closing_qty}`);

  console.log("\n✅ Test completed successfully!");
}
```

---

## 📋 Integration Checklist

- [ ] Import batch methods in voucherService.js
- [ ] Add batch movement logic to createVoucher()
- [ ] Add batch reversal logic to deleteVoucher()
- [ ] Add batch update logic to updateVoucher()
- [ ] Add stock validation before outward movements
- [ ] Handle transaction rollback on errors
- [ ] Test purchase → sales → delete workflow
- [ ] Test debit note (inward) operations
- [ ] Test credit note (outward) operations
- [ ] Verify closing_qty calculations
- [ ] Test batch-wise reports
- [ ] Document batch line item requirements
- [ ] Create user guide for batch selection
- [ ] Add batch number dropdown to UI
- [ ] Add stock level display to item selection

---

## 🚨 Important Notes

1. **Always validate** that batch_id exists before updating
2. **Check sufficient stock** before creating outward movements
3. **Clean up empty batches** after reversals using deleteBatchIfEmpty()
4. **Handle decimal precision** carefully for rates and values
5. **Log all batch movements** for audit trail
6. **Use transactions** for multi-batch vouchers
7. **Test thoroughly** before deployment
