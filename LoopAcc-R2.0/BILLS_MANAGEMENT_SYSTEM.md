# Bills Management System

## Overview

This feature allows creating standalone bills directly in the ledger master that will automatically appear in outstanding receivables/payables reports based on their balance type (debit = receivable, credit = payable).

## Key Components

### 1. Bill Service (`backend/services/billService.js`)

Provides functions for managing standalone bills:

- **`createStandaloneBill(billData)`** - Create a new bill

  - Input: `{ company_id, ledger_id, amount, bill_reference, bill_date, balance_type, narration }`
  - Returns: Bill document with auto-calculated `isDeemedPositive`
  - Automatically stored in `bill_allocation` collection with `source: "standalone"`

- **`updateStandaloneBill(billId, companyId, billData)`** - Update a bill

  - Updates bill details and recalculates `isDeemedPositive` if balance_type changes

- **`deleteStandaloneBill(billId, companyId)`** - Delete a bill

  - Removes bill from `bill_allocation` collection

- **`getStandaloneBillsForLedger(ledgerId, companyId)`** - Get all bills for a ledger

  - Returns array of bills created for that specific ledger

- **`getOutstandingStandaloneBills(companyId, type)`** - Get all outstanding bills

  - Parameters:
    - `type`: "all", "receivable", or "payable"
  - Returns bills where `invoice_voucher_id` and `payment_voucher_id` are null

- **`createBillsFromLedgerAllocations(ledgerId, companyId, billAllocations)`** - Create bills from ledger opening balance allocations
  - Called when ledger master saves billwise allocations
  - Creates bills with `source: "ledger-opening"`

### 2. Bills Router (`backend/routes/bills.js`)

REST API endpoints for bill management:

```
POST   /api/bills                          - Create new bill
PUT    /api/bills/:id                      - Update bill
DELETE /api/bills/:id?companyId=X          - Delete bill
GET    /api/bills/ledger/:ledgerId         - Get bills for ledger
GET    /api/bills/outstanding              - Get all outstanding bills
```

### 3. Outstanding Reports Integration

Modified `getOutstandingReceivables()` and `getOutstandingPayables()` in `voucherService.js` to include standalone bills:

#### Outstanding Receivables (Debit Bills)

- **Debit bills** are receivable (isDeemedPositive = "yes")
- Shows customer amounts owed to the company
- Includes:
  - Sales vouchers (existing)
  - Standalone bills with balance_type="debit" (new)
  - Ledger opening balance bills with isDeemedPositive="yes" (new)

#### Outstanding Payables (Credit Bills)

- **Credit bills** are payable (isDeemedPositive = "no")
- Shows supplier amounts owed by the company
- Includes:
  - Purchase vouchers (existing)
  - Standalone bills with balance_type="credit" (new)
  - Ledger opening balance bills with isDeemedPositive="no" (new)

## Data Structure

### Bill Document in `bill_allocation` Collection

```javascript
{
  id: "uuid",
  company_id: "company-uuid",
  ledger_id: "ledger-uuid",
  bill_reference: "BILL-REF-001",
  allocated_amount: 5000,
  balance_type: "debit",  // "debit" or "credit"
  isDeemedPositive: "yes", // auto: "yes" for debit, "no" for credit
  bill_date: "2024-12-20",
  due_date: "2025-01-20",
  narration: "Opening balance bill",
  source: "standalone", // "standalone", "ledger-opening", or other

  // Not yet linked to vouchers
  invoice_voucher_id: null,
  invoice_voucher_number: null,
  payment_voucher_id: null,
  payment_voucher_number: null,

  created_at: timestamp,
  updated_at: timestamp
}
```

## Balance Type Mapping

| Balance Type | isDeemedPositive | Outstanding Type | Meaning          |
| ------------ | ---------------- | ---------------- | ---------------- |
| debit        | "yes"            | Receivable       | Customer owes us |
| credit       | "no"             | Payable          | We owe supplier  |

## API Usage Examples

### Create a Bill

```bash
POST /api/bills
{
  "company_id": "comp-123",
  "ledger_id": "customer-xyz",
  "amount": 10000,
  "bill_reference": "INV-2024-001",
  "balance_type": "debit",  # Customer owes us
  "bill_date": "2024-12-20",
  "narration": "Invoice for services"
}
```

### Create Payable Bill

```bash
POST /api/bills
{
  "company_id": "comp-123",
  "ledger_id": "supplier-abc",
  "amount": 5000,
  "bill_reference": "BILL-2024-001",
  "balance_type": "credit",  # We owe supplier
  "bill_date": "2024-12-20",
  "narration": "Purchase invoice"
}
```

### Get Outstanding Receivables (Including Bills)

```bash
GET /api/vouchers/report/outstanding-receivables?companyId=comp-123
```

Response includes:

- Sales vouchers with pending amounts
- Debit bills (customer owes us)

### Get Outstanding Payables (Including Bills)

```bash
GET /api/vouchers/report/outstanding-payables?companyId=comp-123
```

Response includes:

- Purchase vouchers with pending amounts
- Credit bills (we owe supplier)

## Ledger Master Integration

When marking a ledger as "billwise" in the ledger master:

1. User can add bill allocations to opening balance
2. Calling `saveBillAllocations()` in ledgerService will:
   - Store allocations in ledger_entries collection
   - Call `createBillsFromLedgerAllocations()` to create actual bills
   - Bills appear in outstanding reports with `source: "ledger-opening"`

## Implementation Details

### isDeemedPositive Calculation

- **Debit entries (customer receivables)**: `isDeemedPositive = "yes"`
- **Credit entries (supplier payables)**: `isDeemedPositive = "no"`
- Determined automatically from `balance_type` parameter

### Query Filtering

Outstanding reports filter bills by:

```javascript
{
  source: { $in: ["standalone", "ledger-opening"] },
  isDeemedPositive: "yes" or "no", // Depends on receivable/payable
  invoice_voucher_id: null,  // Not allocated to invoice
  payment_voucher_id: null,  // Not yet paid
  ledger_id: { $in: ledgerIds } // Only matching group ledgers
}
```

## Files Modified/Created

### New Files

- `backend/services/billService.js` - Bill management service
- `backend/routes/bills.js` - Bill API routes

### Modified Files

- `backend/server.js` - Registered bills router
- `backend/services/voucherService.js` - Updated outstanding functions to include bills

## Status Tracking

Bills are tracked with different statuses in the outstanding reports:

- **pending** - Bill created, not yet allocated or paid
- **partial** - Bill partially allocated (future enhancement)
- **paid** - Bill fully allocated (when linked to payment/invoice vouchers)

## Future Enhancements

1. **Bill Reconciliation**: Mark bills as paid when linked to payment vouchers
2. **Multi-Allocation**: Split bill amounts across multiple payment vouchers
3. **Auto-Matching**: Automatically match bills to payment vouchers by amount
4. **Aging Report**: Show bill aging (days pending)
5. **Bulk Import**: Import bills from CSV/Excel

---

**Created**: December 20, 2024
**Version**: 1.0
