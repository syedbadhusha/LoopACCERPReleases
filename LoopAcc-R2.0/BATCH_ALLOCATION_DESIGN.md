# Batch Allocation Collection - Design Document

## Overview

This document details the redesigned **Batch Allocation Collection** that tracks inventory on a batch-wise basis with proper support for opening balance, inward, and outward movements.

---

## Collection Schema: `batch_allocation`

### Field Definitions

```javascript
{
  // Identity Fields
  id: String,                    // UUID - Primary identifier
  item_id: String,               // UUID - Reference to item_master
  company_id: String,            // UUID - Reference to company
  batch_number: String,          // Batch number (unique within item, can repeat across items)

  // Opening Balance (from Item Master)
  opening_qty: Number,           // Opening quantity
  opening_rate: Number,          // Opening rate (cost per unit)
  opening_value: Number,         // Opening value (opening_qty * opening_rate)

  // Inward Movement (Purchase & Debit Note)
  // Inward includes: Purchase Vouchers + Debit Notes received
  inward_qty: Number,            // Total inward quantity
  inward_rate: Number,           // Weighted average inward rate
  inward_value: Number,          // Total inward value

  // Outward Movement (Sales & Credit Note)
  // Outward includes: Sales Vouchers + Credit Notes issued
  outward_qty: Number,           // Total outward quantity
  outward_rate: Number,          // Weighted average outward rate
  outward_value: Number,         // Total outward value

  // Closing Balance
  closing_qty: Number,           // Calculated: opening_qty + inward_qty - outward_qty
  closing_rate: Number,          // Weighted average closing rate
  closing_value: Number,         // closing_qty * closing_rate

  // Metadata
  created_at: Date,              // Creation timestamp
  updated_at: Date,              // Last update timestamp
}
```

### Index Strategy

```javascript
// Unique index: One batch_number per item per company
db.batch_allocation.createIndex(
  { item_id: 1, batch_number: 1, company_id: 1 },
  { unique: true }
);

// Performance indexes
db.batch_allocation.createIndex({ item_id: 1, company_id: 1 });
db.batch_allocation.createIndex({ company_id: 1 });
```

---

## Business Rules

### 1. Opening Balance

- **Source**: Item Master (`opening_stock`, `opening_rate`, `opening_value`)
- **When**: At item creation or batch creation
- **Calculation**:
  - `opening_qty` = from item_master.opening_stock
  - `opening_rate` = from item_master.opening_rate
  - `opening_value` = opening_qty × opening_rate
  - `inward_qty = opening_qty` (initialize to match opening)

### 2. Inward Movement (Quantity Addition)

**Transactions**: Purchase Vouchers, Debit Notes

- Update when:
  - Purchase Voucher is created/updated with this batch
  - Debit Note (from supplier) is created/updated
- Update formula:
  ```
  inward_qty += purchase_qty
  inward_value += (purchase_qty × purchase_rate)
  inward_rate = inward_value / inward_qty
  closing_qty = opening_qty + inward_qty - outward_qty
  ```

### 3. Outward Movement (Quantity Reduction)

**Transactions**: Sales Vouchers, Credit Notes

- Update when:
  - Sales Voucher is created/updated with this batch
  - Credit Note (issued to customer) is created/updated
- Update formula:
  ```
  outward_qty += sales_qty
  outward_value += (sales_qty × sales_rate)
  outward_rate = outward_value / outward_qty
  closing_qty = opening_qty + inward_qty - outward_qty
  ```

### 4. Closing Balance Calculation

```
closing_qty = opening_qty + inward_qty - outward_qty
closing_rate = inward_value / closing_qty (if closing_qty > 0, else 0)
closing_value = closing_qty × closing_rate
```

### 5. Batch Number Uniqueness

- **Unique Within**: Each Item + Company combination
- **NOT Globally Unique**: Different items can have the same batch_number
- Example:

  ```
  Item: Paracetamol
    Batch: B001

  Item: Aspirin
    Batch: B001  ← Same batch number, different item, ALLOWED
  ```

### 6. Delete/Remove Cascade Logic

#### When deleting a batch from Voucher line:

```
If Transaction Type = Purchase/Debit Note:
  inward_qty -= deleted_qty
  inward_value -= (deleted_qty × deleted_rate)
  inward_rate = inward_value / inward_qty

If Transaction Type = Sales/Credit Note:
  outward_qty -= deleted_qty
  outward_value -= (deleted_qty × deleted_rate)
  outward_rate = outward_value / outward_qty

closing_qty = opening_qty + inward_qty - outward_qty
closing_rate = inward_value / closing_qty
closing_value = closing_qty × closing_rate
```

#### When deleting entire Batch from Item Master:

```
1. Find all vouchers using this batch
2. For each voucher line with this batch:
   - Reverse the inward/outward calculations
3. If closing_qty becomes <= 0 and no pending transactions:
   - Delete the batch record
   Otherwise:
   - Keep record with updated quantities
```

---

## Service Method Specifications

### batchAllocationService.js

#### 1. **getPrimaryBatchForItem(itemId, companyId)**

- Returns/creates PRIMARY batch for items without batch tracking
- Maintains backward compatibility

#### 2. **createBatchAllocation(batch, itemId, companyId)**

- Creates a new batch entry with initial opening balance
- Sets `inward_qty = opening_qty` initially
- All movement (inward/outward) updates from zero

#### 3. **updateBatchInward(batchId, quantity, rate)**

- Called from: Purchase Voucher, Debit Note creation
- Updates: `inward_qty`, `inward_value`, `inward_rate`, `closing_qty`
- Recalculates weighted average rates

#### 4. **updateBatchOutward(batchId, quantity, rate)**

- Called from: Sales Voucher, Credit Note creation
- Updates: `outward_qty`, `outward_value`, `outward_rate`, `closing_qty`
- Recalculates weighted average rates

#### 5. **reverseBatchMovement(batchId, type, quantity, rate)**

- Called from: Delete/Undo operations
- `type`: 'inward' | 'outward'
- Reverses the quantities and values

#### 6. **deleteBatchIfEmpty(batchId)**

- Deletes batch only if `closing_qty = 0`
- Returns true if deleted, false if kept

#### 7. **getBatchWiseStock(itemId, companyId)**

- Returns all batches with current stock levels
- Useful for: Stock reports, Batch-wise analysis

---

## Voucher Service Integration

### Creating Purchase/Sales Voucher with Batch:

```javascript
// For each line item with batch_number
for (let line of voucher.line_items) {
  if (line.batch_number && line.batch_id) {
    if (voucher.voucher_type === "purchase" || "debit_note") {
      await updateBatchInward(line.batch_id, line.quantity, line.rate);
    } else if (voucher.voucher_type === "sales" || "credit_note") {
      await updateBatchOutward(line.batch_id, line.quantity, line.rate);
    }
  }
}
```

### Deleting Voucher Line:

```javascript
// When deleting a voucher line item with batch
await reverseBatchMovement(
  line.batch_id,
  voucher.voucher_type.includes("purchase") ? "inward" : "outward",
  line.quantity,
  line.rate
);
```

---

## Example Flow

### Initial Setup

```
Item: Paracetamol 500mg
- opening_stock: 100
- opening_rate: 5
- opening_value: 500

Batch_Allocation created:
{
  batch_number: "B001",
  opening_qty: 100,
  opening_rate: 5,
  opening_value: 500,
  inward_qty: 100,        ← Initialize with opening
  inward_value: 500,
  inward_rate: 5,
  outward_qty: 0,
  outward_value: 0,
  closing_qty: 100,
  closing_rate: 5,
  closing_value: 500
}
```

### Purchase 50 units @ 6 per unit

```
Transaction: Purchase Voucher
Update batch_allocation:
{
  inward_qty: 100 + 50 = 150,
  inward_value: 500 + 300 = 800,
  inward_rate: 800 / 150 = 5.33,
  closing_qty: 100 + 150 - 0 = 250,
  closing_rate: 800 / 250 = 3.20,    ← Weighted average
  closing_value: 800
}
```

### Sales 80 units @ 8 per unit

```
Transaction: Sales Voucher
Update batch_allocation:
{
  outward_qty: 0 + 80 = 80,
  outward_value: 0 + 640 = 640,
  outward_rate: 640 / 80 = 8,
  closing_qty: 100 + 150 - 80 = 170,
  closing_rate: (800 - 640) / 170 = 0.94,    ← Remaining value
  closing_value: 160
}
```

### Delete Sales of 30 units

```
Reverse outward movement:
{
  outward_qty: 80 - 30 = 50,
  outward_value: 640 - 240 = 400,
  outward_rate: 400 / 50 = 8,
  closing_qty: 100 + 150 - 50 = 200,
  closing_rate: (800 - 400) / 200 = 2,
  closing_value: 400
}
```

---

## Multi-Item Batch Number Example

```
Item A: Paracetamol
  Batch B001: 100 units
  Batch B002: 50 units

Item B: Aspirin
  Batch B001: 200 units    ← Same batch number, different item
  Batch B003: 75 units

These are independent records in batch_allocation:
- item_A:batch_B001 (100)
- item_A:batch_B002 (50)
- item_B:batch_B001 (200)  ← No conflict
- item_B:batch_B003 (75)
```

---

## Migration Strategy

When updating existing systems:

1. **Preserve Existing Opening Balance**

   - If item has `opening_stock`, create batch allocation with same values

2. **Aggregate Existing Transactions**

   - Sum all inward transactions (purchases, debit notes) → `inward_qty`, `inward_value`
   - Sum all outward transactions (sales, credit notes) → `outward_qty`, `outward_value`

3. **Create PRIMARY Batch for Non-Batch Items**

   - Items with `enable_batches = false` get "PRIMARY" batch

4. **Validate Consistency**
   - `closing_qty = opening_qty + inward_qty - outward_qty`

---

## Reporting Queries

### Batch-wise Stock Report

```javascript
db.batch_allocation.aggregate([
  { $match: { company_id: companyId, item_id: itemId } },
  {
    $project: {
      batch_number: 1,
      opening_qty: 1,
      inward_qty: 1,
      outward_qty: 1,
      closing_qty: 1,
      closing_rate: 1,
      closing_value: 1,
    },
  },
  { $sort: { batch_number: 1 } },
]);
```

### Item-wise Total Stock

```javascript
db.batch_allocation.aggregate([
  { $match: { company_id: companyId, item_id: itemId } },
  {
    $group: {
      _id: "$item_id",
      total_opening: { $sum: "$opening_qty" },
      total_inward: { $sum: "$inward_qty" },
      total_outward: { $sum: "$outward_qty" },
      total_closing: { $sum: "$closing_qty" },
    },
  },
]);
```

---

## Summary Table

| Field          | Purpose              | Updated From            | Calculation                 |
| -------------- | -------------------- | ----------------------- | --------------------------- |
| `opening_qty`  | Starting inventory   | Item Master             | Fixed at batch creation     |
| `inward_qty`   | Total purchases      | Purchase/Debit Vouchers | Sum of inward movements     |
| `outward_qty`  | Total sales          | Sales/Credit Vouchers   | Sum of outward movements    |
| `closing_qty`  | Current stock        | Calculated              | opening + inward - outward  |
| `inward_rate`  | Avg purchase rate    | Weighted average        | inward_value / inward_qty   |
| `outward_rate` | Avg sale rate        | Weighted average        | outward_value / outward_qty |
| `closing_rate` | Remaining value rate | Weighted average        | inward_value / closing_qty  |

---

## Implementation Checklist

- [ ] Create/Update `batch_allocation` schema indexes
- [ ] Implement `updateBatchInward()` method
- [ ] Implement `updateBatchOutward()` method
- [ ] Implement `reverseBatchMovement()` method
- [ ] Implement `deleteBatchIfEmpty()` method
- [ ] Update Voucher Service to call batch updates
- [ ] Update Voucher deletion to reverse batch movements
- [ ] Create migration for existing data
- [ ] Add batch-wise stock report queries
- [ ] Add validation: batch uniqueness per item
- [ ] Add validation: closing_qty >= 0
- [ ] Testing: Multiple batches per item
- [ ] Testing: Same batch number across items
- [ ] Testing: Delete/reverse transactions
