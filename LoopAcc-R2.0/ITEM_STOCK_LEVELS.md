# Item Master Stock Levels Implementation

## Overview

Added inward, outward, and closing stock quantity fields to the `item_master` collection to provide quick access to item stock levels without needing to aggregate batch data.

## Database Schema Changes

### item_master Collection - New Fields

```json
{
  "id": "string",
  "name": "string",
  "code": "string",
  "company_id": "string",
  "opening_stock": "number",

  // NEW FIELDS - Stock Movement Tracking
  "inward_qty": "number", // Total quantity received (purchases/receipts)
  "outward_qty": "number", // Total quantity issued/sold
  "closing_qty": "number", // Current closing stock = inward - outward

  "created_at": "Date",
  "updated_at": "Date"
}
```

## Implementation Details

### 1. **Item Creation**

When a new item is created, stock fields are initialized:

- `inward_qty`: 0
- `outward_qty`: 0
- `closing_qty`: opening_stock (or opening_qty) value

**File:** [itemService.js](backend/services/itemService.js#L100-L108)

```javascript
const toInsert = {
  id,
  ...itemData,
  enable_batches: itemData.enable_batches || false,
  inward_qty: 0,
  outward_qty: 0,
  closing_qty: itemData.opening_stock || itemData.opening_qty || 0,
  created_at: new Date(),
  updated_at: new Date(),
};
```

### 2. **Item Retrieval**

When fetching items, stock fields are included with fallback defaults:

- If field doesn't exist, defaults to 0
- closing_qty defaults to opening_stock if not set

**File:** [itemService.js](backend/services/itemService.js#L53-L77)

```javascript
$project: {
  // ... other fields ...
  inward_qty: { $ifNull: ["$inward_qty", 0] },
  outward_qty: { $ifNull: ["$outward_qty", 0] },
  closing_qty: { $ifNull: ["$closing_qty", "$opening_stock"] },
  // ... other fields ...
}
```

### 3. **Stock Level Updates**

#### New Function: `updateItemStockLevels(itemId)`

Aggregates all batch allocations for an item and updates item master:

**File:** [voucherService.js](backend/services/voucherService.js#L622-L651)

```javascript
export async function updateItemStockLevels(itemId) {
  const db = getDb();

  // Get all batches for this item
  const batches = await db
    .collection("batch_allocation")
    .find({ item_id: itemId })
    .toArray();

  // Aggregate totals from all batches
  let totalInward = 0;
  let totalOutward = 0;

  batches.forEach((batch) => {
    totalInward += batch.inward_qty || 0;
    totalOutward += batch.outward_qty || 0;
  });

  const totalClosing = totalInward - totalOutward;

  // Update item_master with aggregated stock levels
  await db.collection("item_master").updateOne(
    { id: itemId },
    {
      $set: {
        inward_qty: totalInward,
        outward_qty: totalOutward,
        closing_qty: totalClosing,
        updated_at: new Date(),
      },
    }
  );
}
```

### 4. **Automatic Updates on Voucher Operations**

The `updateItemStockLevels()` function is called in three places:

#### a. Purchase/Receipt Vouchers

When inward stock is recorded, `updateItemStockLevels()` is called in `updateBatchesForPurchase()`

**File:** [voucherService.js](backend/services/voucherService.js#L653-L699)

```javascript
// Update batch allocation
await db.collection("batch_allocation").updateOne(...);

// Update item master stock levels
await updateItemStockLevels(batch.item_id);
```

#### b. Sales/Issue Vouchers

When outward stock is recorded, `updateItemStockLevels()` is called in `updateBatchesForSales()`

**File:** [voucherService.js](backend/services/voucherService.js#L705-L752)

#### c. Voucher Deletion

When vouchers are reversed, `updateItemStockLevels()` is called in `reverseBatchAllocations()`

**File:** [voucherService.js](backend/services/voucherService.js#L758-T817)

## Data Flow Example

### Scenario: Create Item → Record Purchase → Record Sales

**Step 1: Create Item**

```
Item: ABC Widget
Opening Stock: 100
→ item_master:
  - inward_qty: 0
  - outward_qty: 0
  - closing_qty: 100
```

**Step 2: Record Purchase Voucher (Receive 50 units)**

```
Purchase Voucher: PUR-001
Quantity: 50, Rate: 100
→ batch_allocation updated:
  - inward_qty: 50
→ item_master updated:
  - inward_qty: 50
  - outward_qty: 0
  - closing_qty: 100 + 50 = 150
```

**Step 3: Record Sales Voucher (Sell 30 units)**

```
Sales Voucher: SAL-001
Quantity: 30, Rate: 150
→ batch_allocation updated:
  - outward_qty: 30
→ item_master updated:
  - inward_qty: 50
  - outward_qty: 30
  - closing_qty: 50 - 30 = 20 (plus opening stock = 120)
```

**Step 4: Check Item Stock**

```
GET /api/items?companyId=XXX
Response includes:
{
  "id": "item-123",
  "name": "ABC Widget",
  "opening_stock": 100,
  "inward_qty": 50,      // Total received
  "outward_qty": 30,     // Total sold
  "closing_qty": 120,    // Current stock
  "batch_details": [...]
}
```

## Performance Benefits

1. **Quick Access**: No need to aggregate batch data for item lists
2. **Direct Query**: Can filter items by stock levels directly
3. **Real-time**: Updates immediately when vouchers are created/deleted
4. **Report Optimization**: Stock summary reports don't need aggregation pipelines

## API Endpoints Updated

- `GET /api/items?companyId=XXX` - Now includes inward, outward, closing quantities
- `POST /api/items` - Creates items with initialized stock fields
- `PUT /api/items/:id` - Updates item stock levels via batch allocations
- `DELETE /api/items/:id` - Cleans up item and associated batch data

## Migration for Existing Data

To populate stock fields for existing items without these fields, run a script similar to:

```javascript
async function migrateItemStockLevels() {
  const db = getDb();

  const items = await db.collection("item_master").find({}).toArray();

  for (const item of items) {
    await updateItemStockLevels(item.id);
  }
}
```

## Testing

### Create New Item

1. POST `/api/items` with opening_stock = 100
2. Check response - should have inward_qty: 0, outward_qty: 0, closing_qty: 100

### Record Purchase

1. Create purchase voucher with 50 units for the item
2. GET `/api/items?companyId=XXX`
3. Verify item shows: inward_qty: 50, outward_qty: 0, closing_qty: 150

### Record Sales

1. Create sales voucher with 30 units
2. GET `/api/items?companyId=XXX`
3. Verify item shows: inward_qty: 50, outward_qty: 30, closing_qty: 120

### Delete Voucher

1. Delete the purchase voucher
2. GET `/api/items?companyId=XXX`
3. Verify item reverts: inward_qty: 0, outward_qty: 30, closing_qty: 70
