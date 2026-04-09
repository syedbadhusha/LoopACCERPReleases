# Tally-Standard Single Voucher Collection Implementation

## ✅ Database Schema Restructured

### Before (Multiple Collections):
```
voucher_master
voucher_details  
ledger_entries
bill_allocation
(4 separate collections)
```

### After (Single Collection - Tally Standard):
```
vouchers  ← Single unified collection
{
  id: uuid,
  voucher_number: "PUR-001",
  voucher_date: "2025-12-16",
  voucher_type: "purchase",  // purchase, sales, payment, receipt
  company_id: uuid,
  ledger_id: uuid,  // Main supplier/customer ledger
  
  // ✅ Inventory entries with batch details
  inventory: [
    {
      item_id: uuid,
      quantity: 10,
      rate: 100,
      amount: 1000,
      discount_percent: 0,
      discount_amount: 0,
      tax_percent: 18,
      tax_amount: 180,
      net_amount: 1180,
      batch_id: uuid || null  // If null, uses PRIMARY batch automatically
    }
  ],
  
  // ✅ Ledger entries (simplified - only ledger_id and amount)
  ledger_entries: [
    {
      ledger_id: uuid,        // Only ID needed
      amount: 1000,
      net_amount: 1000
    }
  ],
  
  // Summary totals
  total_amount: 1000,
  tax_amount: 180,
  net_amount: 1180,
  
  // Metadata
  reference_number: "",
  reference_date: null,
  narration: "Purchase from supplier",
  created_at: "2025-12-16T10:00:00Z",
  updated_at: "2025-12-16T10:00:00Z"
}
```

---

## 📊 Data Transformation Logic

### Transform Function: `transformVoucherPayload(payload)`

**What it does:**
1. Takes frontend payload (with mixed item and ledger entries in `details` array)
2. Separates into two arrays:
   - `inventory[]` - Items with item_id (for batch tracking)
   - `ledger_entries[]` - Ledgers with ledger_id only (simplified)

**Frontend Sends:**
```javascript
{
  details: [
    { item_id: "...", quantity: 10, rate: 100, ... },  // Item
    { ledger_id: "...", amount: 1000, ... },            // Ledger
    { item_id: "...", quantity: 5, rate: 50, ... },     // Item
  ]
}
```

**Backend Transforms To:**
```javascript
{
  inventory: [
    { item_id: "...", quantity: 10, rate: 100, batch_id: null, ... },
    { item_id: "...", quantity: 5, rate: 50, batch_id: null, ... }
  ],
  ledger_entries: [
    { ledger_id: "...", amount: 1000 }
  ]
}
```

---

## 🔄 Backend Service Changes

### 1. `transformVoucherPayload(payload)`
**New Function** - Converts frontend format to Tally format
- Location: `backend/services/voucherService.js:6`
- Separates items (inventory) from ledgers
- Filters out unnecessary fields

### 2. `createVoucherWithDetails(payload)`
**Modified** - Now stores in single `vouchers` collection
```javascript
// Before: Inserted into voucher_master, voucher_details, ledger_entries
// After: Single document with inventory and ledger_entries arrays
await db.collection("vouchers").insertOne(voucher);
```

### 3. `updateVoucherWithDetails(id, payload)`
**Modified** - Updates single document
```javascript
// Before: Deleted and recreated multiple collections
// After: Updates single voucher document
await db.collection("vouchers").findOneAndUpdate({id}, {$set: updatedVoucher});
```

### 4. `getVouchersByCompany(companyId)`
**Modified** - Queries from single collection
```javascript
// Before
await db.collection("voucher_master").find({company_id}).toArray();

// After
await db.collection("vouchers").find({company_id}).sort({voucher_date: -1}).toArray();
```

### 5. `getVoucherById(id)`
**Modified** - Gets complete voucher in one query
```javascript
// Before: Fetched from 4 separate collections
// After: Single document with everything
await db.collection("vouchers").findOne({id});
```

### 6. `deleteVoucher(id)`
**Modified** - Deletes from single collection
```javascript
// Before: Deleted from 4 separate collections
// After: Single delete operation
await db.collection("vouchers").deleteOne({id});
```

---

## 🎯 Batch Handling (Unchanged Logic)

### Automatic Primary Batch Assignment
When `batch_id` is null in inventory entry:
```javascript
// getPrimaryBatchForItem() is called
// Creates or retrieves batch with batch_number: "PRIMARY"
// Updates batch_allocation collection with inward/outward quantities
// Aggregates to item_master
```

**Flow remains the same:**
1. Voucher saved to `vouchers` collection
2. For each inventory item:
   - If `batch_id` is null → create/use PRIMARY batch
   - Update `batch_allocation` with quantities
3. Update `item_master` with aggregated stock levels

---

## 🔍 Frontend Data Structure (NEEDS NO CHANGES)

### Current Frontend Payload (PurchaseForm.tsx)
```typescript
const voucherPayload = {
  voucher_number: "PUR-001",
  voucher_date: "2025-12-16",
  company_id: "...",
  ledger_id: "...",  // Main supplier ledger
  reference_number: "",
  reference_date: null,
  narration: "Purchase from ABC Suppliers",
  total_amount: 1180,
  tax_amount: 180,
  net_amount: 1180,
  
  // Mixed array (unchanged)
  details: [
    {
      // Item entries
      item_id: "item-001",
      quantity: 10,
      rate: 100,
      amount: 1000,
      tax_percent: 18,
      tax_amount: 180,
      net_amount: 1180,
      batch_id: null  // Can be null or uuid
    },
    {
      // Ledger entries (additional ledgers)
      ledger_id: "ledger-002",
      amount: 100,
      net_amount: 100
    }
  ],
  
  // Additional ledger entries from tax/other columns
  ledger_entries: [
    {
      ledger_id: "ledger-003",
      debit_amount: 100,
      credit_amount: 0
    }
  ]
};
```

**✅ Status:** No changes needed! Frontend already sends correct format.

---

## 📝 Voucher Document Example (Complete)

```javascript
{
  "_id": ObjectId("..."),
  "id": "vch-001",
  "voucher_number": "PUR-001",
  "voucher_date": "2025-12-16",
  "voucher_type": "purchase",
  "company_id": "comp-001",
  "ledger_id": "ledger-supplier-001",
  
  // ✅ Inventory: All selected items with batch details
  "inventory": [
    {
      "item_id": "item-001",
      "quantity": 10,
      "rate": 100,
      "amount": 1000,
      "discount_percent": 0,
      "discount_amount": 0,
      "tax_percent": 18,
      "tax_amount": 180,
      "net_amount": 1180,
      "batch_id": "batch-001"  // User selected this batch
    },
    {
      "item_id": "item-002",
      "quantity": 5,
      "rate": 50,
      "amount": 250,
      "discount_percent": 0,
      "discount_amount": 0,
      "tax_percent": 0,
      "tax_amount": 0,
      "net_amount": 250,
      "batch_id": null  // No batch selected → PRIMARY batch will be used
    }
  ],
  
  // ✅ Ledger entries: Only selected ledgers
  "ledger_entries": [
    {
      "ledger_id": "ledger-supplier-001",  // Main ledger
      "amount": 1430
    },
    {
      "ledger_id": "ledger-tax-001",  // Tax ledger (if selected)
      "amount": 180
    }
  ],
  
  // Summary
  "total_amount": 1250,
  "tax_amount": 180,
  "net_amount": 1430,
  
  // Additional info
  "reference_number": "REF-001",
  "reference_date": null,
  "narration": "Monthly purchase from ABC",
  
  "created_at": "2025-12-16T10:30:00Z",
  "updated_at": "2025-12-16T10:30:00Z"
}
```

---

## ✅ Benefits of New Structure

1. **Single Collection** ✅
   - Simpler database design
   - Faster queries (no JOINs needed)
   - Aligned with Tally software standard

2. **Inventory Array** ✅
   - All items with batch details in one place
   - Easy to iterate for batch allocation
   - Batch details preserved in document

3. **Simplified Ledger Entries** ✅
   - Only essentials: ledger_id and amount
   - No redundant data
   - Easy to post to ledgers

4. **Automatic Primary Batch** ✅
   - Items without batch selection automatically use PRIMARY batch
   - No data loss
   - Seamless tracking

---

## 🔄 Data Flow (Complete)

```
Frontend (PurchaseForm.tsx)
    ↓ JSON payload with details array
API POST /api/vouchers
    ↓ routes/vouchers.js passes to createVoucherWithDetails()
transformVoucherPayload(payload)
    ↓ Separates items from ledgers
createVoucherWithDetails()
    ↓ Single insert to vouchers collection
db.collection("vouchers").insertOne(voucher)
    ↓
updateBatchesForPurchase(voucher.inventory)
    ├─ For each item: getPrimaryBatchForItem() if batch_id is null
    ├─ Update batch_allocation: inward_qty += quantity
    └─ Update item_master: aggregate all batches
    ↓
Response with complete voucher document
```

---

## 🧪 Testing Checklist

- [ ] Create purchase voucher with mixed items (some with batch, some without)
- [ ] Verify single document in `vouchers` collection
- [ ] Check `inventory` array has all items with batch details
- [ ] Check `ledger_entries` array has simplified structure
- [ ] Verify PRIMARY batch created for items without batch_id
- [ ] Verify `batch_allocation` updated correctly
- [ ] Verify `item_master` stock levels updated
- [ ] Test update voucher - single document updated
- [ ] Test delete voucher - batch allocations reversed
- [ ] Test sales voucher - outward quantities tracked

---

## 📌 Collection Names

Old:
- voucher_master ❌
- voucher_details ❌
- ledger_entries ❌
- bill_allocation (still used for AR/AP)

New:
- vouchers ✅ (single collection, Tally-standard)
- batch_allocation ✅ (unchanged)
- item_master ✅ (unchanged)
- bill_allocation ✅ (unchanged)

---

**Implementation Complete! Ready for testing!**
