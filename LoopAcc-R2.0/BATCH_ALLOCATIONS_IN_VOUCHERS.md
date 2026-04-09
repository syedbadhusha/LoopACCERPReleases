# Batch Allocation Array in Vouchers Collection - Implementation Summary

## Overview

Added batch allocation array to the vouchers collection inside the inventory to track batch information for each item. When `enable_batch` is disabled in the item master, the system automatically assigns the primary batch by default.

## Changes Made

### 1. **Vouchers Collection Structure Update**

Each inventory entry in the vouchers collection now includes a `batch_allocations` array:

```javascript
// Before
inventory: [
  {
    item_id: "item-123",
    quantity: 50,
    rate: 100,
    amount: 5000,
    batch_id: "batch-456", // or null
  },
];

// After
inventory: [
  {
    item_id: "item-123",
    quantity: 50,
    rate: 100,
    amount: 5000,
    batch_id: "batch-456", // Primary batch if enable_batch is false
    batch_allocations: [
      {
        batch_id: "batch-456",
        quantity: 50,
        rate: 100,
        amount: 5000,
      },
    ],
  },
];
```

### 2. **Automatic Primary Batch Assignment**

Modified `transformVoucherPayload()` function to:

- Check if the item has `enable_batches` enabled in the item master
- If `enable_batches` is `false` and no batch is selected, automatically assign the primary batch
- Create the primary batch if it doesn't exist

**Key Logic:**

```javascript
const item = await db.collection("item_master").findOne({ id: detail.item_id });
const batchesEnabled = item?.enable_batches === true;

// If batches are disabled, use primary batch
if (!batchesEnabled && !batchId) {
  const primaryBatch = await getPrimaryBatchForItem(
    detail.item_id,
    payload.company_id
  );
  batchId = primaryBatch.id;
}
```

### 3. **Function Updates**

#### `getPrimaryBatchForItem(itemId, companyId)`

- Moved to the beginning of the file for early access
- Used in both `transformVoucherPayload()` and batch update functions
- Creates a PRIMARY batch if it doesn't exist

#### `transformVoucherPayload(payload)` - Now Async

- Changed from synchronous to asynchronous to support database queries
- Enriches inventory entries with:
  - Automatic batch assignment for disabled items
  - `batch_allocations` array with batch tracking
- Calls updated functions:
  - `createVoucherWithDetails()` - Updated to use `await`
  - `updateVoucherWithDetails()` - Updated to use `await`

### 4. **File Modified**

- **[backend/services/voucherService.js](backend/services/voucherService.js)**
  - Added `getPrimaryBatchForItem()` helper function at the top
  - Enhanced `transformVoucherPayload()` with batch allocation logic
  - Updated `createVoucherWithDetails()` to await async transform
  - Updated `updateVoucherWithDetails()` to await async transform
  - Removed duplicate `getPrimaryBatchForItem()` function definition

## Benefits

1. **Automatic Batch Handling**: Items without batch tracking automatically use the primary batch
2. **Flexible Structure**: The `batch_allocations` array supports future enhancement for split batch allocations
3. **Data Persistence**: Batch allocation information is stored with the voucher for audit trails
4. **Consistency**: Ensures all items are tracked with batch information regardless of `enable_batches` setting

## Implementation Details

### Primary Batch ("PRIMARY")

When an item has `enable_batches: false`, the system uses a special "PRIMARY" batch:

- Batch number: "PRIMARY"
- Created automatically on first use
- Aggregates all stock for non-batch items
- Tracks inward, outward, and closing quantities

### Batch Allocations Array

Each inventory entry maintains:

- `batch_id`: The single batch being used for this line item
- `batch_allocations`: Array of batch allocations (currently single item, extensible for multi-batch)
  - `batch_id`: Reference to the batch
  - `quantity`: Allocated quantity
  - `rate`: Unit rate
  - `amount`: Total amount

## Example Scenario

### Item with Batches Disabled

```javascript
{
  item_id: "INV-001",
  quantity: 100,
  rate: 50,
  amount: 5000,
  batch_id: "batch-primary", // Auto-assigned
  batch_allocations: [
    {
      batch_id: "batch-primary",
      quantity: 100,
      rate: 50,
      amount: 5000
    }
  ]
}
```

### Item with Batches Enabled

```javascript
{
  item_id: "INV-002",
  quantity: 50,
  rate: 100,
  amount: 5000,
  batch_id: "batch-B001", // User-selected batch
  batch_allocations: [
    {
      batch_id: "batch-B001",
      quantity: 50,
      rate: 100,
      amount: 5000
    }
  ]
}
```

## Testing

A test script has been created: `test-batch-allocation-in-vouchers.js`

**Tests Covered:**

1. Item creation with `enable_batches: false`
2. Item creation with `enable_batches: true`
3. Voucher creation with mixed item types
4. Inventory structure verification
5. Persistence verification
6. Primary batch auto-assignment validation

**Run Test:**

```bash
node test-batch-allocation-in-vouchers.js
```

## Backward Compatibility

- Existing vouchers continue to work (batch_id is preserved)
- New vouchers get batch_allocations array automatically
- Items without batches are transparently converted to use primary batch

## Future Enhancements

The `batch_allocations` array structure supports:

1. **Multiple batches per line**: Split allocation across multiple batches
2. **Batch costing methods**: FIFO, LIFO, Weighted Average tracking per batch
3. **Batch expiry tracking**: Linked to batch details for expiry management
4. **Detailed audit logs**: History of batch movements through the supply chain

## Notes

- The `getPrimaryBatchForItem()` function is called during voucher creation/update
- Primary batch is created on-demand, not at item creation time
- All existing batch update functions (`updateBatchesForPurchase`, `updateBatchesForSales`) continue to work unchanged
- The change is fully integrated with the existing batch allocation tracking system
