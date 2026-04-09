# Ledger Entries Synchronization - Implementation Summary

## Overview

Updated the voucher service to synchronize ledger entries to a separate `ledger_entries` collection whenever vouchers are created, updated, or deleted. This ensures the `ledger_entries` collection stays in sync with the vouchers collection.

## Changes Made

### File Modified

- **[backend/services/voucherService.js](backend/services/voucherService.js)**

### Functions Updated

#### 1. `createVoucherWithDetails(payload)`

**Added:** Ledger entries insertion after voucher creation

```javascript
// Insert ledger entries into separate ledger_entries collection
if (ledger_entries && ledger_entries.length > 0) {
  const entriesToInsert = ledger_entries.map((entry) => ({
    id: uuidv4(),
    voucher_id: voucher.id,
    voucher_number: voucher.voucher_number,
    voucher_date: voucher.voucher_date,
    voucher_type: voucher.voucher_type,
    company_id: voucher.company_id,
    ledger_id: entry.ledger_id,
    debit_amount: entry.debit_amount || 0,
    credit_amount: entry.credit_amount || 0,
    amount: entry.amount || 0,
    narration: voucher.narration || "",
    created_at: new Date(),
    updated_at: new Date(),
  }));

  const ledgerRes = await db
    .collection("ledger_entries")
    .insertMany(entriesToInsert);
}
```

**Effect:** Each time a voucher is created, all its ledger entries are stored in the `ledger_entries` collection with full context (voucher_id, voucher_number, dates, etc.)

---

#### 2. `updateVoucherWithDetails(id, payload)`

**Added:** Ledger entries synchronization (delete old, insert new)

```javascript
// Delete old ledger entries
await db.collection("ledger_entries").deleteMany({ voucher_id: id });

// Insert new ledger entries
if (ledger_entries && ledger_entries.length > 0) {
  const entriesToInsert = ledger_entries.map((entry) => ({
    id: uuidv4(),
    voucher_id: id,
    voucher_number: updatedVoucher.voucher_number,
    voucher_date: updatedVoucher.voucher_date,
    voucher_type: updatedVoucher.voucher_type,
    company_id: updatedVoucher.company_id,
    ledger_id: entry.ledger_id,
    debit_amount: entry.debit_amount || 0,
    credit_amount: entry.credit_amount || 0,
    amount: entry.amount || 0,
    narration: updatedVoucher.narration || "",
    created_at: oldVoucher.created_at || new Date(),
    updated_at: new Date(),
  }));

  const ledgerRes = await db
    .collection("ledger_entries")
    .insertMany(entriesToInsert);
}
```

**Effect:** When a voucher is updated:

1. All old ledger entries for that voucher are deleted
2. All new ledger entries are inserted with updated information
3. Original creation timestamp is preserved, update timestamp is refreshed

---

#### 3. `deleteVoucher(id)`

**Added:** Ledger entries deletion

```javascript
// Delete ledger entries from separate collection
const ledgerDeleteRes = await db
  .collection("ledger_entries")
  .deleteMany({ voucher_id: id });
console.log(
  "[DELETE VOUCHER] Deleted",
  ledgerDeleteRes.deletedCount,
  "ledger entries"
);
```

**Effect:** When a voucher is deleted, all associated ledger entries are also deleted from the `ledger_entries` collection

---

## Ledger Entry Structure

Each entry in the `ledger_entries` collection contains:

```javascript
{
  id: "uuid",                    // Unique identifier for this ledger entry
  voucher_id: "vch-001",         // Reference to parent voucher
  voucher_number: "PUR-001",     // Human-readable voucher number
  voucher_date: "2025-12-16",    // Date of transaction
  voucher_type: "purchase",      // Type: purchase, sales, payment, receipt, etc.
  company_id: "comp-001",        // Company reference
  ledger_id: "ledger-003",       // Ledger account
  debit_amount: 100,             // Debit side amount (if any)
  credit_amount: 0,              // Credit side amount (if any)
  amount: 100,                   // Total amount
  narration: "Purchase of items",// Description
  created_at: Date,              // When entry was created
  updated_at: Date               // When entry was last updated
}
```

## Synchronization Flow

### Create Voucher

```
Frontend → Backend API
  ↓
createVoucherWithDetails()
  ├─ Save to 'vouchers' collection
  ├─ Save to 'ledger_entries' collection ✓ NEW
  ├─ Update batch allocations
  └─ Update item stock levels
```

### Update Voucher

```
Frontend → Backend API
  ↓
updateVoucherWithDetails()
  ├─ Update 'vouchers' collection
  ├─ Delete old from 'ledger_entries' ✓ NEW
  ├─ Insert new to 'ledger_entries' ✓ NEW
  ├─ Reverse old batch allocations
  ├─ Apply new batch allocations
  └─ Update item stock levels
```

### Delete Voucher

```
Frontend → Backend API
  ↓
deleteVoucher()
  ├─ Reverse batch allocations
  ├─ Delete from 'ledger_entries' ✓ NEW
  └─ Delete from 'vouchers' collection
```

## Benefits

1. **Dual Storage**: Ledger entries are maintained in two places:

   - Inside `vouchers.ledger_entries` array (for voucher-centric queries)
   - In `ledger_entries` collection (for ledger-centric reports)

2. **Report Flexibility**: Reports can now query:

   - Ledger balance by querying `ledger_entries` directly
   - Voucher details with ledger breakdown from `vouchers` collection

3. **Audit Trail**: Each ledger entry has:

   - Created timestamp (when voucher was created)
   - Updated timestamp (when voucher was last modified)
   - Full voucher context (number, date, type, narration)

4. **Data Consistency**: Three-way synchronization ensures:
   - `vouchers.ledger_entries` always matches source
   - `ledger_entries` collection always has current state
   - Deletions cascade properly

## Testing

To verify the implementation:

1. **Create a voucher** with multiple ledger entries

   - Verify entries appear in both:
     - `vouchers.ledger_entries` array
     - `ledger_entries` collection

2. **Update a voucher** (change ledger entries)

   - Verify old entries deleted from `ledger_entries`
   - Verify new entries inserted with updated info
   - Verify timestamps handled correctly

3. **Delete a voucher**

   - Verify entries removed from both collections

4. **Query ledger balance**
   - Query should work using `ledger_entries` collection
   - Should return accurate debit/credit amounts

## Logging

Each operation logs its progress:

```
[CREATE VOUCHER] Writing ledger entries to ledger_entries collection...
[CREATE VOUCHER] Inserted 3 ledger entries

[UPDATE VOUCHER] Syncing ledger entries...
[UPDATE VOUCHER] Updated 3 ledger entries

[DELETE VOUCHER] Deleting ledger entries...
[DELETE VOUCHER] Deleted 3 ledger entries
```

## No Breaking Changes

- ✓ Existing voucher retrieval still works
- ✓ Backward compatible with previous data
- ✓ All other voucher functions unchanged
- ✓ Batch allocation logic unaffected
