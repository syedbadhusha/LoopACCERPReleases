# Bills Collection and Enhanced Ledger Entries - Implementation Summary

## Overview

Enhanced the ledger entries system with:

1. **Bills Collection** - New collection to track bill/invoice documents
2. **Bill Allocation Array** - Added to both ledger_entries collection and vouchers.ledger_entries array
3. **isDeemedPositive Property** - Indicates whether an amount should be treated as Debit ("yes") or Credit ("no")
4. **Opening Balance Support** - Automatic creation of opening balance entries from ledger master

## Collections Updated

### 1. Bills Collection (New)

**Purpose:** Track individual bills and their allocations

```javascript
{
  id: "bill-001",
  voucher_id: "vch-001",
  voucher_number: "PUR-001",
  company_id: "comp-001",
  ledger_id: "ledger-002",
  bill_amount: 5000,
  allocated_amount: 0,
  pending_amount: 5000,
  bill_date: "2025-12-16",
  due_date: "2026-01-16",
  status: "pending", // pending, partial, fully_allocated
  created_at: Date,
  updated_at: Date
}
```

### 2. Ledger Entries Collection (Enhanced)

**New Fields Added:**

- `isDeemedPositive` - "yes" (treat as debit) or "no" (treat as credit)
- `billallocation` - Array of bill allocations

```javascript
{
  id: "uuid",
  voucher_id: "vch-001",
  voucher_number: "PUR-001",
  voucher_date: "2025-12-16",
  voucher_type: "purchase",
  company_id: "comp-001",
  ledger_id: "ledger-003",
  debit_amount: 100,
  credit_amount: 0,
  amount: 100,
  narration: "Purchase of items",
  isDeemedPositive: "yes",  // NEW: Indicates debit treatment
  billallocation: [          // NEW: Track bill allocations
    {
      bill_id: "bill-001",
      allocated_amount: 50,
      allocation_date: "2025-12-20"
    }
  ],
  created_at: Date,
  updated_at: Date
}
```

### 3. Vouchers Collection (Enhanced)

**Ledger Entries Array Now Includes:**

```javascript
ledger_entries: [
  {
    ledger_id: "ledger-003",
    amount: 100,
    net_amount: 100,
    debit_amount: 100,
    credit_amount: 0,
    isDeemedPositive: "yes", // NEW
    billallocation: [
      // NEW
      {
        bill_id: "bill-001",
        allocated_amount: 50,
      },
    ],
  },
];
```

## Files Modified

### 1. [backend/db.js](backend/db.js)

- Added "bills" to the required collections list

### 2. [backend/services/voucherService.js](backend/services/voucherService.js)

#### New Function: `createOpeningBalanceEntry(ledgerId, companyId)`

**Purpose:** Create opening balance entries from ledger master

```javascript
// Creates an entry for ledger's opening_balance
// Uses balance_type (debit/credit) to set isDeemedPositive
// Checks if already exists to avoid duplicates
```

**Features:**

- Converts ledger opening_balance to ledger_entries collection
- Sets isDeemedPositive based on ledger's balance_type:
  - If balance_type = "debit" → isDeemedPositive = "yes"
  - If balance_type = "credit" → isDeemedPositive = "no"
- Idempotent (won't create duplicates)

#### Updated Function: `transformVoucherPayload(payload)`

- Added `isDeemedPositive` to ledger entries object
- Added `billallocation` array to ledger entries object
- Preserves debit_amount and credit_amount

#### Updated Function: `createVoucherWithDetails(payload)`

- Calculates `isDeemedPositive` automatically:
  - If debit_amount > credit_amount → "yes"
  - Otherwise → "no"
- Inserts ledger entries with full information including:
  - isDeemedPositive
  - billallocation array
- Calls `createOpeningBalanceEntry()` for the main ledger
- All with proper logging

#### Updated Function: `updateVoucherWithDetails(payload)`

- Same isDeemedPositive calculation logic
- Deletes old ledger entries
- Inserts new entries with all enhanced fields
- Preserves original creation timestamp

## isDeemedPositive Logic

### Automatic Determination

When not explicitly provided, isDeemedPositive is calculated:

```javascript
const isDeemedPositive =
  entry.isDeemedPositive ||
  ((entry.debit_amount || 0) > (entry.credit_amount || 0) ? "yes" : "no");
```

### Usage in Reports

- **"yes"** → Amount is positive/debit for the ledger
- **"no"** → Amount is negative/credit for the ledger

This helps normalize amounts across different ledger groups that have opposite debit/credit conventions.

## Bill Allocation Tracking

### BillAllocation Array Structure

```javascript
billallocation: [
  {
    bill_id: "bill-001", // Reference to bill
    allocated_amount: 5000, // Amount allocated from this entry
    allocation_date: "2025-12-20",
  },
];
```

### Purpose

- Track which ledger entries are allocated to which bills
- Support partial bill payments
- Enable bill status updates (pending → partial → fully_allocated)

## Opening Balance Handling

### Automatic Creation

When a voucher is created with a ledger_id:

1. System checks if opening balance entry exists
2. If not, creates entry from ledger.opening_balance
3. Uses ledger.balance_type for isDeemedPositive
4. Entry marked with voucher_type = "opening"

### Entry Details

```javascript
{
  voucher_id: "OPENING",
  voucher_number: "OPENING-BALANCE",
  voucher_type: "opening",
  ledger_id: <from ledger>,
  debit_amount: <opening_balance if balance_type="debit">,
  credit_amount: <opening_balance if balance_type="credit">,
  isDeemedPositive: <based on balance_type>,
  billallocation: []  // Empty for opening balance
}
```

## Data Flow

### Create Voucher

```
Frontend API → createVoucherWithDetails()
├─ Transform payload (enriches with isDeemedPositive, billallocation)
├─ Save to 'vouchers' collection
├─ Write ledger entries to 'ledger_entries' collection
│  └─ Each with: isDeemedPositive, billallocation
├─ Create opening balance for main ledger (if not exists)
└─ Update batch allocations and item stock
```

### Update Voucher

```
Frontend API → updateVoucherWithDetails()
├─ Transform new payload
├─ Update 'vouchers' collection
├─ Delete old ledger entries
├─ Insert new entries (with isDeemedPositive, billallocation)
├─ Update opening balance if needed
└─ Reprocess batches and stock
```

## Example Scenarios

### Scenario 1: Purchase Voucher

```javascript
// Ledger Entry
{
  ledger_id: "supplier-abc",
  debit_amount: 0,
  credit_amount: 5000,
  isDeemedPositive: "no",  // Credit = negative for supplier liability
  billallocation: [
    {
      bill_id: "SUPP-001",
      allocated_amount: 5000
    }
  ]
}
```

### Scenario 2: Sales with Opening Balance

```javascript
// Ledger Entry from opening balance
{
  voucher_id: "OPENING",
  ledger_id: "customer-xyz",
  debit_amount: 10000,
  credit_amount: 0,
  isDeemedPositive: "yes",  // Debit = positive for customer receivable
  billallocation: []
}

// Later: Sales invoice
{
  voucher_id: "vch-002",
  ledger_id: "customer-xyz",
  debit_amount: 5000,
  credit_amount: 0,
  isDeemedPositive: "yes",
  billallocation: [
    {
      bill_id: "INV-001",
      allocated_amount: 5000
    }
  ]
}
```

## Testing Checklist

- [ ] Create voucher with ledger entries

  - [ ] Verify isDeemedPositive calculated correctly
  - [ ] Verify billallocation array present (empty initially)
  - [ ] Check ledger_entries collection has entries

- [ ] Create voucher with specific ledger

  - [ ] Verify opening balance created automatically
  - [ ] Check opening entry has correct isDeemedPositive
  - [ ] Verify idempotent (no duplicates on second voucher)

- [ ] Update voucher ledger entries

  - [ ] Verify old entries deleted
  - [ ] Verify new entries have updated isDeemedPositive
  - [ ] Check timestamps preserved/updated correctly

- [ ] Query ledger balance
  - [ ] Sum debit amounts where isDeemedPositive = "yes"
  - [ ] Sum credit amounts where isDeemedPositive = "no"
  - [ ] Verify correct balance calculation

## Backward Compatibility

✓ Existing vouchers continue to work
✓ New fields default to sensible values
✓ isDeemedPositive auto-calculated if not provided
✓ billallocation defaults to empty array
✓ No breaking changes to existing APIs

## Logging

Each operation logs its progress:

```
[CREATE VOUCHER] Inserting voucher: ...
[CREATE VOUCHER] Writing ledger entries to ledger_entries collection...
[CREATE VOUCHER] Inserted X ledger entries
[CREATE VOUCHER] Processing opening balance...
[CREATE VOUCHER] Processing inventory items...

[UPDATE VOUCHER] Syncing ledger entries...
[UPDATE VOUCHER] Updated X ledger entries

[DELETE VOUCHER] Deleting ledger entries...
[DELETE VOUCHER] Deleted X ledger entries
```
