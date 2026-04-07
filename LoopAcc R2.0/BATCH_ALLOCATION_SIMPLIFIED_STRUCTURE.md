# Simplified Batch Allocation Structure - Implementation Summary

## Overview

Implemented a simplified batch allocation array structure across item master and voucher collections. The new structure contains only essential fields: `batch_number`, `qty`, `rate`, and `amount` - without the breakdown of opening, inward, outward, and closing.

Additionally, updated the batch_allocation collection to properly distinguish opening balance (from item master) from inward movements (from vouchers).

---

## Changes Made

### 1. **Item Master Collection** (`item_master`)

#### New Field: `batch_allocations` Array

Each item now includes a simplified `batch_allocations` array:

```javascript
{
  id: "item-123",
  name: "Paracetamol",
  enable_batches: true,

  // NEW: Simplified batch allocations array
  batch_allocations: [
    {
      batch_number: "B001",
      qty: 100,           // Opening quantity
      rate: 50,           // Opening rate
      amount: 5000        // Opening value (qty × rate)
    },
    {
      batch_number: "B002",
      qty: 50,
      rate: 55,
      amount: 2750
    }
  ],

  // ... other fields
}
```

#### Populated When:

- Item is created with batch details
- Item is updated with batch details
- Uses opening balance values from batch_details

#### Structure:

- `batch_number` (String): The batch number
- `qty` (Number): Opening quantity from item master
- `rate` (Number): Opening rate from item master
- `amount` (Number): Opening value (opening_qty × opening_rate)

---

### 2. **Voucher Collection** - Inventory Entries

#### Updated Field: `batch_allocations` Array

Each inventory entry in a voucher now has an enhanced `batch_allocations` array:

```javascript
{
  inventory: [
    {
      item_id: "item-123",
      quantity: 50,
      rate: 100,
      amount: 5000,
      batch_id: "batch-456",

      // UPDATED: Simplified batch allocations array
      batch_allocations: [
        {
          batch_id: "batch-456", // Reference to batch_allocation doc
          batch_number: "B001", // Batch number for display
          qty: 50, // Quantity in this transaction
          rate: 100, // Rate in this transaction
          amount: 5000, // Amount in this transaction
        },
      ],
    },
  ];
}
```

#### Structure:

- `batch_id` (String): Reference to the batch_allocation document
- `batch_number` (String): Batch number (fetched from batch_allocation if not provided)
- `qty` (Number): Quantity of this batch in the transaction
- `rate` (Number): Rate of this batch in the transaction
- `amount` (Number): Amount of this batch in the transaction

---

### 3. **Batch Allocation Collection** (`batch_allocation`)

#### Updated Logic: Opening vs Inward Distinction

The collection now properly distinguishes between:

- **Opening Balance**: Initial stock from item master (stays in `opening_qty`)
- **Inward**: Stock received from purchases/vouchers (tracked in `inward_qty`)

#### Previous Behavior:

```javascript
// OLD: Opening was added to inward
opening_qty: 100;
inward_qty: 100; // ❌ Counted opening balance as inward
inward_rate: 50;
inward_value: 5000;
```

#### New Behavior:

```javascript
// NEW: Opening stays separate from inward
opening_qty: 100          // Opening balance from item master
opening_rate: 50
opening_value: 5000

inward_qty: 0             // ✓ Does NOT include opening
inward_rate: 0
inward_value: 0

// When purchase is added, inward gets updated:
inward_qty: 50            // From voucher transaction
inward_rate: 55
inward_value: 2750

// Closing calculation includes both
closing_qty: 100 + 50 - 0 = 150
closing_rate: (5000 + 2750) / 150 = 51.67
closing_value: 150 × 51.67 = 7750
```

---

## Files Modified

### 1. **[backend/services/itemService.js](backend/services/itemService.js)**

#### Changes:

- Added `batch_allocations: []` initialization in `createItem()` toInsert object
- Populate simplified `batch_allocations` array from batch_details in `createItem()`
- Update `batch_allocations` array in `updateItem()` when batch_details are provided
- Simplified structure contains only: batch_number, qty, rate, amount

#### Key Functions:

- `createItem()`: Creates item with empty batch_allocations array, populates when batch_details provided
- `updateItem()`: Updates batch_allocations array when batch_details are provided

---

### 2. **[backend/services/voucherService.js](backend/services/voucherService.js)**

#### Changes:

- Updated `transformVoucherPayload()` to fetch batch_number from batch_allocation collection
- Enhanced batch_allocations array structure to include batch_number
- Changed from `quantity` to `qty` for consistency with item master structure

#### Updated batch_allocations Array:

```javascript
batch_allocations: batchId
  ? [
      {
        batch_id: batchId,
        batch_number: batchNumber, // Now fetched from batch_allocation
        qty: detail.quantity || 0, // Renamed from 'quantity'
        rate: detail.rate || 0,
        amount: detail.amount || 0,
      },
    ]
  : [];
```

#### Key Changes:

- Fetch batch_number from batch_allocation document when batchId is available
- Use consistent field names: `qty` instead of `quantity`
- Store both batch_id and batch_number for reference and display

---

### 3. **[backend/services/batchAllocationService.js](backend/services/batchAllocationService.js)**

#### Changes:

- Updated `createBatchAllocation()` to initialize inward_qty = 0 instead of opening_qty
- Updated `createBatchAllocations()` to initialize inward_qty = 0 instead of opening_qty
- Opening balance from item master stays in `opening_qty` and is NOT added to `inward_qty`

#### Key Changes:

```javascript
// Initialize inward to 0 - opening balance from item master is NOT counted as inward
const inward_qty = 0;
const inward_rate = 0;
const inward_value = 0;

// Calculate closing (opening + inward - outward)
const closing_qty = opening_qty + inward_qty - outward_qty;
```

#### Impact:

- Opening balance is properly tracked as separate from inward
- When purchase vouchers are processed, they update inward_qty (not opening_qty)
- Closing balance correctly reflects: opening + inward - outward

---

## Data Flow

### Item Creation with Batches:

```
1. Frontend sends batch_details with opening_qty, opening_rate, opening_value
2. createItem() creates item with empty batch_allocations array
3. batch_details passed to createBatchAllocations()
4. createBatchAllocations() creates batch_allocation docs with:
   - opening_qty, opening_rate, opening_value from item master
   - inward_qty = 0 (NOT counting opening as inward)
5. Simplified batch_allocations array populated in item_master:
   [{ batch_number, qty: opening_qty, rate: opening_rate, amount: opening_value }]
```

### Voucher Creation with Batches:

```
1. Frontend sends voucher details with item_id, batch_id, quantity, rate
2. transformVoucherPayload() processes each detail:
   - Determine batch_id (primary if batches disabled)
   - Fetch batch_number from batch_allocation collection
   - Create inventory entry with batch_allocations array:
     [{ batch_id, batch_number, qty, rate, amount }]
3. When voucher saved, batch_allocation collection updated:
   - inward_qty += quantity (if purchase)
   - outward_qty += quantity (if sales)
   - closing_qty recalculated
```

---

## Examples

### Example 1: Item with Opening Balance

```javascript
// Item Master
{
  id: "item-123",
  name: "Paracetamol",
  opening_stock: 150,          // Aggregated opening across batches
  enable_batches: true,
  batch_allocations: [
    {
      batch_number: "B001",
      qty: 100,
      rate: 50,
      amount: 5000
    },
    {
      batch_number: "B002",
      qty: 50,
      rate: 55,
      amount: 2750
    }
  ]
}

// Batch Allocation Collection
{
  id: "batch-001",
  item_id: "item-123",
  batch_number: "B001",
  opening_qty: 100,
  opening_rate: 50,
  opening_value: 5000,
  inward_qty: 0,               // NOT counting opening as inward
  inward_rate: 0,
  inward_value: 0,
  outward_qty: 0,
  outward_rate: 0,
  outward_value: 0,
  closing_qty: 100,
  closing_rate: 50,
  closing_value: 5000
}

{
  id: "batch-002",
  item_id: "item-123",
  batch_number: "B002",
  opening_qty: 50,
  opening_rate: 55,
  opening_value: 2750,
  inward_qty: 0,
  inward_rate: 0,
  inward_value: 0,
  outward_qty: 0,
  outward_rate: 0,
  outward_value: 0,
  closing_qty: 50,
  closing_rate: 55,
  closing_value: 2750
}
```

### Example 2: Purchase Voucher

```javascript
// Voucher Entry
{
  id: "voucher-456",
  voucher_type: "purchase",
  date: "2025-12-23",
  inventory: [
    {
      item_id: "item-123",
      quantity: 50,
      rate: 60,
      amount: 3000,
      batch_id: "batch-001",
      batch_allocations: [
        {
          batch_id: "batch-001",
          batch_number: "B001",
          qty: 50,
          rate: 60,
          amount: 3000
        }
      ]
    }
  ]
}

// After voucher saved, batch_allocation B001 updated:
{
  id: "batch-001",
  item_id: "item-123",
  batch_number: "B001",
  opening_qty: 100,
  opening_rate: 50,
  opening_value: 5000,
  inward_qty: 50,              // Updated from purchase voucher
  inward_rate: 60,
  inward_value: 3000,
  outward_qty: 0,
  outward_rate: 0,
  outward_value: 0,
  closing_qty: 150,            // 100 + 50 - 0
  closing_rate: 53.33,         // (5000 + 3000) / 150
  closing_value: 8000          // 150 × 53.33
}
```

---

## Benefits

1. **Simplified Structure**: batch_allocations array contains only essential fields
2. **Proper Accounting**: Opening balance from item master is NOT counted as inward
3. **Clear Tracking**: Distinguishes between opening (initial stock) and inward (purchases)
4. **Flexible**: Supports both single and multiple batch allocations per item
5. **Audit Trail**: Both item master and voucher store batch allocation details
6. **Reference**: Includes both batch_id and batch_number for cross-referencing

---

## Testing Recommendations

1. **Create Item with Batches**:

   - Verify batch_allocations array populated with correct values
   - Verify batch_allocation collection has inward_qty = 0

2. **Create Purchase Voucher**:

   - Verify batch_allocations array in voucher inventory
   - Verify batch_number is fetched and stored
   - Verify batch_allocation.inward_qty updated correctly

3. **Query Reports**:
   - Batch-wise stock: opening + inward - outward = closing
   - Item-wise aggregation: sum all batches
   - Opening balance should only appear in opening_qty, not inward_qty

---
