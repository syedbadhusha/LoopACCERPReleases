# Ledger Master IsBillwise Feature

## Overview

Added `is_billwise` option to ledger master to enable bill-wise tracking similar to batch-wise tracking in item master. When enabled, opening balance entries are created with "ON ACCOUNT" designation instead of a primary batch.

## Implementation

### 1. Ledger Master Schema Updates

**New Field:**

```javascript
{
  id: "uuid",
  name: "Supplier Name",
  company_id: "uuid",
  group_id: "uuid",
  opening_balance: 10000,
  balance_type: "debit" | "credit",
  is_billwise: true,  // ✅ NEW: Enable bill-wise tracking
  // ... other fields
  created_at: "2025-12-17T10:00:00Z",
  updated_at: "2025-12-17T10:00:00Z"
}
```

### 2. Opening Balance Handling

#### When `is_billwise: false` (Traditional - Single Opening Balance)

```javascript
// Opens as single opening balance entry
ledger_entries collection:
{
  voucher_id: "OPENING",
  voucher_number: "OPENING-BALANCE",
  amount: 10000,
  isDeemedPositive: "yes",
  billallocation: []  // No allocations
}
```

#### When `is_billwise: true` (Bill-Wise - "ON ACCOUNT" Mode)

```javascript
// Opens with "ON ACCOUNT" opening balance entry
ledger_entries collection:
{
  voucher_id: "OPENING-ON-ACCOUNT",
  voucher_number: "OPENING-ON-ACCOUNT",
  amount: 10000,
  isDeemedPositive: "yes",
  billallocation: [
    {
      bill_reference: "ON-ACCOUNT",       // ✅ Marks as opening balance
      allocated_amount: 10000,            // Full opening balance
      invoice_voucher_id: null,           // No specific invoice
      invoice_voucher_number: "ON-ACCOUNT"
    }
  ]
}
```

## Code Changes

### File: backend/services/voucherService.js

**New Export Function:**

```javascript
/**
 * Create "on account" opening balance entry for billwise-enabled ledgers
 * Similar to batch allocations for items, but for billwise ledger opening balance
 */
export async function createOnAccountOpeningBalance(ledgerId, companyId) {
  const db = getDb();

  // Get the ledger details
  const ledger = await db.collection("ledgers").findOne({ id: ledgerId });
  if (!ledger || !ledger.opening_balance || !ledger.is_billwise) {
    return null;
  }

  // Check if "ON ACCOUNT" entry already exists
  let onAccountEntry = await db.collection("ledger_entries").findOne({
    ledger_id: ledgerId,
    voucher_id: "OPENING-ON-ACCOUNT",
    voucher_number: "OPENING-ON-ACCOUNT",
  });

  if (!onAccountEntry) {
    // Create "ON ACCOUNT" opening balance entry with billallocation
    onAccountEntry = {
      id: uuidv4(),
      voucher_id: "OPENING-ON-ACCOUNT",
      voucher_number: "OPENING-ON-ACCOUNT",
      voucher_date: new Date(0),
      voucher_type: "opening",
      company_id: companyId,
      ledger_id: ledgerId,
      amount: ledger.opening_balance,
      narration: "Opening Balance - On Account",
      isDeemedPositive: isDeemedPositive,
      billallocation: [
        {
          bill_reference: "ON-ACCOUNT",
          allocated_amount: ledger.opening_balance,
          invoice_voucher_id: null,
          invoice_voucher_number: "ON-ACCOUNT",
        },
      ],
      created_at: new Date(),
      updated_at: new Date(),
    };

    await db.collection("ledger_entries").insertOne(onAccountEntry);
  }

  return onAccountEntry;
}
```

### File: backend/services/ledgerService.js

**Updated createLedger() function:**

```javascript
export async function createLedger(doc) {
  const db = getDb();
  const id = doc.id || uuidv4();

  const docToInsert = { ...doc };
  if (docToInsert.ledger_group_id && !docToInsert.group_id) {
    docToInsert.group_id = docToInsert.ledger_group_id;
    delete docToInsert.ledger_group_id;
  }

  const toInsert = {
    id,
    ...docToInsert,
    is_billwise: docToInsert.is_billwise === true, // ✅ Ensure boolean
    created_at: new Date(),
    updated_at: new Date(),
  };

  const res = await db.collection("ledgers").insertOne(toInsert);
  if (!res.acknowledged) throw new Error("Insert failed");

  // ✅ Create on-account opening balance if billwise is enabled
  if (toInsert.is_billwise && toInsert.opening_balance) {
    try {
      console.log(
        `[CREATE LEDGER] Creating on-account opening balance for billwise ledger: ${id}`
      );
      await createOnAccountOpeningBalance(id, toInsert.company_id);
    } catch (error) {
      console.log(
        "[CREATE LEDGER] On-account opening balance creation failed:",
        error.message
      );
      // Continue - don't fail the ledger creation
    }
  }

  return toInsert;
}
```

**Import Added:**

```javascript
import { createOnAccountOpeningBalance } from "./voucherService.js";
```

## Comparison: Item Batch-Wise vs Ledger Bill-Wise

| Feature          | Item Batch-Wise                      | Ledger Bill-Wise                            |
| ---------------- | ------------------------------------ | ------------------------------------------- |
| Enable Flag      | `enable_batches`                     | `is_billwise`                               |
| Default Tracking | "PRIMARY" batch                      | "ON ACCOUNT"                                |
| Opening Balance  | In batch_allocation collection       | In ledger_entries with billallocation array |
| Use Case         | Track stock by batch/lot             | Track credit by bill reference              |
| Allocation       | Batch allocations in voucher details | Bill allocations in ledger entries          |

## Usage Flow

### Step 1: Create Ledger with is_billwise Enabled

```javascript
POST /api/ledgers
{
  name: "Supplier A",
  company_id: "uuid",
  group_id: "supplier-group-uuid",
  opening_balance: 10000,
  balance_type: "debit",
  is_billwise: true  // ✅ Enable bill-wise tracking
}
```

### Step 2: Opening Balance Created Automatically

```javascript
// Automatically creates in ledger_entries:
{
  voucher_id: "OPENING-ON-ACCOUNT",
  voucher_number: "OPENING-ON-ACCOUNT",
  amount: 10000,
  billallocation: [
    {
      bill_reference: "ON-ACCOUNT",
      allocated_amount: 10000,
      invoice_voucher_number: "ON-ACCOUNT"
    }
  ]
}
```

### Step 3: Payment Allocation Reduces ON ACCOUNT

```javascript
POST /api/vouchers
{
  voucher_type: "payment",
  allocations: [
    {
      ledger_id: "supplier-ledger-uuid",
      allocated_amount: 5000,
      invoice_voucher_number: "ON-ACCOUNT"  // Against opening balance
    },
    {
      ledger_id: "supplier-ledger-uuid",
      allocated_amount: 3000,
      invoice_voucher_number: "PUR0001"  // Against specific bill
    }
  ]
}
```

### Step 4: Outstanding Balance Report

```
Supplier A - Total Opening: 10000
  - ON ACCOUNT (Opening Balance): Allocated 5000, Pending 5000
  - PUR0001 (Bill): Allocated 3000, Pending 2000
  Total Outstanding: 7000
```

## Database Queries

### Find all billwise ledgers

```javascript
db.ledgers.find({
  is_billwise: true,
});
```

### Get opening balance "ON ACCOUNT" for billwise ledger

```javascript
db.ledger_entries.findOne({
  ledger_id: "uuid",
  voucher_id: "OPENING-ON-ACCOUNT",
  voucher_number: "OPENING-ON-ACCOUNT",
});
```

### Track bill allocations against opening balance

```javascript
db.bills.find({
  ledger_id: "supplier-uuid",
  invoice_voucher_number: "ON-ACCOUNT", // Payments against opening balance
});
```

## Migration for Existing Ledgers

To convert existing ledgers to bill-wise:

```javascript
// Update specific ledger to enable bill-wise
db.ledgers.updateOne(
  { id: "ledger-uuid" },
  { $set: { is_billwise: true } }
);

// Trigger on-account opening balance creation via API update
PUT /api/ledgers/:id
{
  is_billwise: true
}
```

## Frontend Integration

The ledger creation form should include:

```tsx
<div>
  <Label>Enable Bill-Wise Tracking</Label>
  <input
    type="checkbox"
    checked={is_billwise}
    onChange={(e) => setIsBillwise(e.target.checked)}
  />
  <p className="text-sm text-gray-600">
    When enabled, opening balance is tracked "On Account" allowing bill-by-bill
    allocation in payments
  </p>
</div>
```

## Benefits

1. **Bill-Wise Tracking**: Track credit/payments against specific bills instead of bulk opening balance
2. **Better Receivables/Payables**: Clear allocation of payments to original bills
3. **Flexible Partial Payments**: Pay multiple bills simultaneously with flexible allocation
4. **Historical Trail**: Full audit trail of which bills were paid when
5. **Consistent with Items**: Uses same pattern as item batch-wise tracking

## Validation Rules

- ✅ `is_billwise` must be boolean (true/false)
- ✅ Opening balance is idempotent (creates only once)
- ✅ "ON ACCOUNT" entries cannot be deleted (only through ledger deletion)
- ✅ Bill allocations must reference "ON ACCOUNT" for opening balance payments
