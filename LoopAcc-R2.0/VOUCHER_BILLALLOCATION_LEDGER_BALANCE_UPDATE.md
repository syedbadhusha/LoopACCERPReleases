# Voucher Bill Allocation - Ledger Balance Tracking Update

## Overview

Modified the billallocation structure in vouchers to track ledger balances instead of just allocated amounts. This provides better visibility into how the opening balance is affected by voucher transactions.

## Changes Made

### 1. Backend - voucherService.js

#### createVoucherWithDetails() - Lines 820-890

**Previous Structure:**

```javascript
const billallocData = {
  id: billAllocationId,
  bill_reference: voucher.voucher_number,
  amount: entry.amount || 0,
  balance_type: balanceType,
  isDeemedPositive: entry.isDeemedPositive || "no",
};
```

**New Structure:**

```javascript
// Get ledger opening balance
const openingBalance = ledger?.opening_balance || 0;

// Calculate credit and debit amounts from the voucher entry
const debitAmount = balanceType === "debit" ? entry.amount || 0 : 0;
const creditAmount = balanceType === "credit" ? entry.amount || 0 : 0;

// Calculate closing balance
const closingBalance = openingBalance + creditAmount - debitAmount;

const billallocData = {
  id: billAllocationId,
  bill_reference: voucher.voucher_number,
  openingBalance: openingBalance, // From ledger
  credit: creditAmount, // From voucher
  debit: debitAmount, // From voucher
  closingBalance: closingBalance, // Calculated
  balance_type: balanceType,
  isDeemedPositive: entry.isDeemedPositive || "no",
};
```

#### updateVoucherWithDetails() - Lines 1110-1180

**Applied the same changes as createVoucherWithDetails()**

### 2. Frontend - BillwiseAllocationDialog.tsx

#### BillAllocationEntry Interface - Lines 15-24

**Previous:**

```typescript
interface BillAllocationEntry {
  id?: string;
  bill_reference: string;
  allocated_amount: number;
  balance_type: "debit" | "credit";
  bill_date?: string;
  isDeemedPositive?: "yes" | "no";
}
```

**Updated:**

```typescript
interface BillAllocationEntry {
  id?: string;
  bill_reference: string;
  openingBalance: number;
  credit: number;
  debit: number;
  closingBalance: number;
  balance_type: "debit" | "credit";
  bill_date?: string;
  isDeemedPositive?: "yes" | "no";
}
```

## Bill Allocation Collection Update

The bill_allocation collection in MongoDB now includes:

```javascript
{
  id: "uuid",
  bill_reference: "VOUCHER-NUMBER",
  openingBalance: 50000,          // Ledger's opening balance
  credit: 5000,                    // Amount credited in voucher
  debit: 0,                        // Amount debited in voucher
  closingBalance: 55000,          // openingBalance + credit - debit
  balance_type: "debit",
  isDeemedPositive: "no",
  invoice_voucher_id: "voucher-uuid",
  invoice_voucher_number: "SALE-001",
  company_id: "company-uuid",
  bill_date: "2025-12-20",
  source: "invoice",
  created_at: timestamp,
  updated_at: timestamp
}
```

## Ledger Entries Collection Update

The ledger_entries collection billallocation array now stores:

```javascript
{
  id: "ledger-entry-uuid",
  voucher_id: "voucher-uuid",
  ledger_id: "ledger-uuid",
  billallocation: [
    {
      id: "allocation-uuid",
      bill_reference: "SALE-001",
      openingBalance: 50000,
      credit: 5000,
      debit: 0,
      closingBalance: 55000,
      balance_type: "debit",
      isDeemedPositive: "no",
      invoice_voucher_id: "voucher-uuid",
      invoice_voucher_number: "SALE-001"
    }
  ]
}
```

## Benefits

1. **Better Balance Tracking**: Shows how opening balance changes through each voucher transaction
2. **Clear Debit/Credit Separation**: Explicitly tracks which amounts are debits vs credits
3. **Automatic Calculation**: Closing balance is automatically calculated from opening + credit - debit
4. **Ledger Sync**: Opening balance comes directly from the ledger's opening_balance field
5. **Audit Trail**: Easier to audit and reconcile accounts with clear balance progression

## Console Logging

The backend now logs detailed information during voucher creation/update:

```
[CREATE VOUCHER] ✅ Auto-created billallocation for ledger Customer A:
bill_ref=SALE-001,
openingBalance=50000,
credit=5000,
debit=0,
closingBalance=55000,
type=invoice
```

## Testing Notes

1. When creating a sale voucher for a billwise customer with opening balance ₹50,000 and amount ₹5,000:

   - openingBalance = 50000
   - credit = 5000 (for debit balance type)
   - debit = 0
   - closingBalance = 55000

2. When creating a purchase voucher for a billwise supplier with opening balance ₹100,000 and amount ₹10,000:

   - openingBalance = 100000
   - debit = 10000 (for credit balance type)
   - credit = 0
   - closingBalance = 90000

3. Payment/Receipt vouchers also auto-create billallocations with the same structure for tracking purposes

## Files Modified

1. [backend/services/voucherService.js](backend/services/voucherService.js) - Lines 820-890, 1110-1180
2. [src/components/BillwiseAllocationDialog.tsx](src/components/BillwiseAllocationDialog.tsx) - Lines 15-24
