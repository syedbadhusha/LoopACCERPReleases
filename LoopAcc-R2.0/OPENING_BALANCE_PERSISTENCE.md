# Opening Balance Persistence - Bill Reference Lifecycle

## Overview

Opening balance is now set only once when a new bill reference is created. After creation, only credit and debit values are updated from subsequent vouchers. This ensures opening balance remains stable throughout the bill's lifecycle.

## Bill Reference Lifecycle

### Phase 1: Creation (First Voucher)

When a bill reference is created for the first time:

1. **openingBalance**: Set from ledger's opening_balance

   - Applied with sign convention (negative for debit, positive for credit)
   - **Never changes** after this point

2. **credit**: Set from voucher transaction
3. **debit**: Set from voucher transaction
4. **closingBalance**: Calculated = openingBalance + credit - debit

**Example - New Customer Invoice**:

```
Ledger: Customer A (opening_balance: 50000, balance_type: debit)
Voucher: SALE-001 (amount: 5000)

Created billallocation:
{
  bill_reference: "SALE-001",
  openingBalance: -50000,      ✅ Set from ledger
  credit: -5000,               ✅ Set from voucher
  debit: 0,
  closingBalance: -55000       ✅ Calculated
}
```

### Phase 2: Updates (Subsequent Vouchers)

When the same bill reference is updated in subsequent vouchers:

1. **openingBalance**: Kept from original creation

   - **Not changed** even if ledger opening balance changes
   - Preserves the original starting point

2. **credit**: Updated from new voucher
3. **debit**: Updated from new voucher
4. **closingBalance**: Recalculated = openingBalance + new_credit - new_debit

**Example - Payment for Same Customer**:

```
Existing billallocation (from above):
{
  bill_reference: "SALE-001",
  openingBalance: -50000,      ✅ Remains unchanged
  credit: -5000,
  closingBalance: -55000
}

New Voucher: PAYMENT-001 (amount: 2000)

Updated billallocation:
{
  bill_reference: "SALE-001",
  openingBalance: -50000,      ✅ Unchanged from creation
  credit: -7000,               ✅ Updated: -5000 + (-2000)
  debit: 0,
  closingBalance: -57000       ✅ Recalculated
}
```

## Implementation Details

### For Explicit Bill References

**Create Voucher - Lines 810-870**:

```javascript
for (const billalloc of entry.billallocation) {
  // Check if bill reference already exists
  const existingAllocation = await db.collection("bill_allocation").findOne({
    ledger_id: entry.ledger_id,
    bill_reference: billalloc.bill_reference,
    company_id: voucher.company_id,
  });

  if (existingAllocation) {
    // Existing: Keep opening balance, update credit/debit
    processedAlloc.openingBalance = existingAllocation.openingBalance;
    processedAlloc.closingBalance =
      existingAllocation.openingBalance +
      (billalloc.credit || 0) -
      (billalloc.debit || 0);
  } else {
    // New: Set opening balance from ledger
    const openingBalance = baseOpeningBalance * signMultiplier;
    // Apply credit/debit from voucher
    // Calculate closing balance
  }
}
```

### For Auto-Generated Bill References

**Create Voucher - Lines 880-970**:

```javascript
const existingAllocation = await db.collection("bill_allocation").findOne({
  ledger_id: entry.ledger_id,
  bill_reference: billReference,
  company_id: voucher.company_id,
});

if (existingAllocation) {
  // Update with fixed opening balance
  openingBalance = existingAllocation.openingBalance;
  closingBalance =
    openingBalance +
    creditAmount * signMultiplier -
    debitAmount * signMultiplier;
} else {
  // Create with ledger's opening balance
  const baseOpeningBalance = ledger?.opening_balance || 0;
  openingBalance = baseOpeningBalance * signMultiplier;
  closingBalance =
    openingBalance +
    creditAmount * signMultiplier -
    debitAmount * signMultiplier;
}
```

### Same Logic in Update Function

**Update Voucher - Lines 1210-1330**:

- Identical logic to create function
- Ensures consistency during voucher updates

## Complex Scenarios

### Scenario 1: Multiple Allocations to Same Bill

```
Initial: SALE-001 created with 50000 ledger opening balance

Transaction 1 (SALE-001):
- openingBalance: -50000 (from ledger)
- credit: -5000 (sale amount)
- closingBalance: -55000

Transaction 2 (PAYMENT-001 allocated to SALE-001):
- openingBalance: -50000 (unchanged)
- credit: -7000 (5000 + 2000 payment)
- closingBalance: -57000

Transaction 3 (CREDIT-NOTE-001 allocated to SALE-001):
- openingBalance: -50000 (unchanged)
- credit: -6500 (7000 - 500 credit note)
- closingBalance: -56500
```

### Scenario 2: Bill Reference Across Ledgers

```
Shared Bill: SHARED-001

Customer A Ledger (opening: 30000):
{
  bill_reference: "SHARED-001",
  ledger_id: "cust-A",
  openingBalance: -30000    (Set from Customer A's ledger)
}

Customer B Ledger (opening: 20000):
{
  bill_reference: "SHARED-001",
  ledger_id: "cust-B",
  openingBalance: -20000    (Set from Customer B's ledger)
}

Note: Each ledger maintains its own opening balance for the same bill reference
```

### Scenario 3: Ledger Opening Balance Change

```
Initial state:
- Ledger: Customer A, opening_balance: 50000
- Bill: INV-001
  - openingBalance: -50000 (from ledger)

Ledger master updated: opening_balance changed to 60000

New voucher for INV-001:
- openingBalance: -50000   ✅ Unchanged (original value preserved)
- credit/debit: Updated from new voucher
- closingBalance: Recalculated with unchanged opening balance
```

## Benefits

1. **Balance Stability**: Opening balance cannot drift due to ledger changes
2. **Audit Trail**: Original opening balance is permanently recorded
3. **Historical Accuracy**: Can trace back to the exact starting point
4. **Simplified Reconciliation**: No surprises with changing opening balances
5. **Consistent Reporting**: Reports always show original opening balance

## Database Behavior

### bill_allocation Collection

```javascript
// First creation
{
  id: "uuid-1",
  ledger_id: "cust-001",
  bill_reference: "SALE-001",
  openingBalance: -50000,
  credit: -5000,
  debit: 0,
  closingBalance: -55000,
  created_at: "2025-12-20T10:00:00Z",
  updated_at: "2025-12-20T10:00:00Z"
}

// After update (same document)
{
  id: "uuid-1",                      // Same ID
  ledger_id: "cust-001",
  bill_reference: "SALE-001",
  openingBalance: -50000,            // Unchanged
  credit: -7000,                     // Updated
  debit: 0,
  closingBalance: -57000,            // Recalculated
  created_at: "2025-12-20T10:00:00Z", // Original
  updated_at: "2025-12-20T10:30:00Z"  // Updated
}
```

### ledger_entries Collection

```javascript
// Each voucher creates a ledger_entry with billallocation
{
  id: "ledger-entry-uuid",
  voucher_id: "voucher-uuid",
  ledger_id: "cust-001",
  amount: 5000,
  billallocation: [
    {
      bill_reference: "SALE-001",
      openingBalance: -50000,    // From ledger at time of SALE-001 creation
      credit: -5000,             // From this voucher
      debit: 0,
      closingBalance: -55000,    // Calculated
      created_at: "2025-12-20T10:00:00Z"
    }
  ]
}

// Later voucher updates the bill reference
{
  id: "ledger-entry-uuid-2",
  voucher_id: "voucher-uuid-2",  // Different voucher
  ledger_id: "cust-001",
  amount: 2000,
  billallocation: [
    {
      bill_reference: "SALE-001",
      openingBalance: -50000,    // Same opening balance (from original SALE-001)
      credit: -7000,             // Accumulated: 5000 + 2000
      debit: 0,
      closingBalance: -57000,    // Recalculated
      created_at: "2025-12-20T10:00:00Z",  // Original creation time
      updated_at: "2025-12-20T10:30:00Z"   // Latest update time
    }
  ]
}
```

## Logging Examples

### Creating New Bill Reference

```
[CREATE VOUCHER] Creating new bill_reference SALE-001 for ledger cust-001:
openingBalance=-50000, credit=-5000, debit=0
```

### Updating Existing Bill Reference

```
[CREATE VOUCHER] Updating existing bill_reference SALE-001 for ledger cust-001:
keeping openingBalance=-50000, updating credit=-7000, debit=0
```

### Payment to Existing Bill

```
[CREATE VOUCHER] Updating existing auto billallocation for ledger Customer A:
bill_ref=SALE-001, keeping openingBalance=-50000, credit=-7000, debit=0
```

## Query Examples

### Get Opening Balance of Specific Bill

```javascript
db.collection("bill_allocation")
  .findOne({
    ledger_id: "cust-001",
    bill_reference: "SALE-001",
  })
  .then((doc) => console.log(doc.openingBalance));
// Returns: -50000 (original, never changes)
```

### Get Current Credit/Debit for Bill

```javascript
db.collection("bill_allocation")
  .findOne({
    ledger_id: "cust-001",
    bill_reference: "SALE-001",
  })
  .then((doc) => console.log(`Credit: ${doc.credit}, Debit: ${doc.debit}`));
// Returns: Credit: -7000, Debit: 0 (latest values)
```

### Get Closing Balance

```javascript
db.collection("bill_allocation")
  .findOne({
    ledger_id: "cust-001",
    bill_reference: "SALE-001",
  })
  .then((doc) => console.log(`Closing: ${doc.closingBalance}`));
// Returns: Closing: -57000 (calculated from opening + credit - debit)
```
