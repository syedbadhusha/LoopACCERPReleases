# Bill Allocation Sync Architecture

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    LEDGER MASTER COMPONENT                      │
│  (src/pages/masters/LedgerMaster.tsx)                          │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                    User creates billwise ledger
                    with bill allocations
                              │
                              ▼
                    ┌─────────────────────┐
                    │ POST /api/ledgers   │  Save ledger metadata
                    │ (Create/Update)     │  to ledgers collection
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ ledgers collection  │
                    │ is_billwise: true   │
                    │ opening_balance: X  │
                    └─────────────────────┘
                               │
                    ┌──────────▼──────────────────────┐
                    │ Opening Balance Entry Created   │
                    │ in ledger_entries collection    │
                    │ voucher_number: OPENING-ON-ACCT │
                    │ billallocation: [...]            │
                    └────────────┬─────────────────────┘
                                 │
                                 │ After ledger saved,
                                 │ if is_billwise=true
                                 │ and bill_allocations exist
                                 │
                    ┌────────────▼──────────────────────┐
                    │ POST /api/ledgers/{id}/           │
                    │ bill-allocations                  │
                    │ saveBillAllocations()             │
                    └────────────┬──────────────────────┘
                                 │
                    ┌────────────▼──────────────────────┐
                    │ createBillsFromLedgerAllocations()│
                    │ billService.js                    │
                    └────────────┬──────────────────────┘
                                 │
                    ┌────────────▼──────────────────────┐
                    │ For each allocation:              │
                    │ 1. Create bill object             │
                    │    source: "ledger-opening"       │
                    │    ledger_id: X                   │
                    │ 2. Insert to bill_allocation      │
                    │    collection                     │
                    └────────────┬──────────────────────┘
                                 │
                    ┌────────────▼──────────────────────┐
                    │ bill_allocation collection        │
                    │ Contains individual bills with:   │
                    │ - source: "ledger-opening"        │
                    │ - bill_reference: "INV-001"       │
                    │ - allocated_amount: 10000         │
                    │ - balance_type: "debit"/"credit"  │
                    │ - isDeemedPositive: "yes"/"no"    │
                    │ - ledger_id: X                    │
                    └────────────┬──────────────────────┘
                                 │
                    ┌────────────▼──────────────────────┐
                    │ Outstanding Reports Query         │
                    │ (OutstandingReceivableReport)    │
                    │ (OutstandingPayableReport)       │
                    │ Filter:                          │
                    │ isDeemedPositive = "yes" = REC   │
                    │ isDeemedPositive = "no" = PAY    │
                    └────────────┬──────────────────────┘
                                 │
                    ┌────────────▼──────────────────────┐
                    │ Bills appear in reports           │
                    │ showing:                          │
                    │ - Invoice Amount                  │
                    │ - Allocated Amount                │
                    │ - Pending Amount (if any)         │
                    └────────────────────────────────────┘
```

---

## Two Ways to Create Billwise Bills

### Method 1: Direct in Ledger Master Form

**User Steps:**

1. Open Ledger Master
2. Create new ledger with `is_billwise = true`
3. Click "Add Bill" button
4. Fill in bill_reference, amount, balance_type
5. Click "Save"

**Code Path:**

- LedgerMaster.tsx → POST /api/ledgers → saveLedger() → ledgers.js
- After ledger created → POST /api/ledgers/{id}/bill-allocations → ledgers.js
- ledgers.js → ledgerService.saveBillAllocations()
- ledgerService.saveBillAllocations() → billService.createBillsFromLedgerAllocations()
- Bills inserted into bill_allocation collection

### Method 2: Bill-Wise Allocation Dialog

**User Steps:**

1. Open Ledger Master
2. Find existing billwise ledger
3. Click "Bills" button
4. Dialog opens with allocations management
5. Add/edit allocations
6. Click "Save Allocations"

**Code Path:**

- BillwiseAllocationDialog.tsx → POST /api/ledgers/{id}/bill-allocations
- ledgers.js → ledgerService.saveBillAllocations()
- ledgerService.saveBillAllocations() → billService.createBillsFromLedgerAllocations()
- Bills inserted into bill_allocation collection

---

## Data Structures

### Bill Allocation Entry (in ledger_entries.billallocation array)

```javascript
{
  id: "uuid-xxx",
  bill_reference: "INV-001",
  allocated_amount: 10000,
  balance_type: "debit" | "credit",
  isDeemedPositive: "yes" | "no",
  invoice_voucher_id: null,
  invoice_voucher_number: "INV-001",
  bill_date: "2025-01-15",
  due_date: "2025-02-15" | null,
  narration: "Opening invoice"
}
```

### Bill Document (in bill_allocation collection)

```javascript
{
  id: "uuid-xxx",
  company_id: "company-123",
  ledger_id: "ledger-456",
  bill_reference: "INV-001",
  allocated_amount: 10000,
  balance_type: "debit" | "credit",
  isDeemedPositive: "yes" | "no",
  bill_date: "2025-01-15",
  due_date: "2025-02-15" | null,
  narration: "Opening invoice",
  invoice_voucher_id: null,
  invoice_voucher_number: null,
  payment_voucher_id: null,
  payment_voucher_number: null,
  source: "ledger-opening",  // Important identifier
  created_at: ISODate,
  updated_at: ISODate
}
```

---

## Logging Guide

### Expected Log Sequence When Saving Billwise Ledger with Allocations:

```
[BILL ALLOCATIONS API] Received POST request for ledger {ledgerId}
[BILL ALLOCATIONS API] Calling saveBillAllocations...

[SAVE BILL ALLOCATIONS] Starting for ledger {ledgerId}
[SAVE BILL ALLOCATIONS] Found existing entry: false/true
[SAVE BILL ALLOCATIONS] Creating new ledger entry... | Updating existing ledger entry...
[SAVE BILL ALLOCATIONS] Ledger entry created/updated successfully

[SAVE BILL ALLOCATIONS] Deleting existing bills from bill_allocation...
[SAVE BILL ALLOCATIONS] Deleted {count} existing bills

[SAVE BILL ALLOCATIONS] Creating new bills from allocations...

[CREATE BILLS FROM LEDGER] Starting for ledger {ledgerId}
[CREATE BILLS FROM LEDGER] Processing allocation 1/{total}:
  - bill_reference: INV-001
  - allocated_amount: 10000
  - balance_type: debit

[CREATE BILLS FROM LEDGER] Inserting bill with ID: uuid-xxx
[CREATE BILLS FROM LEDGER] ✅ Bill inserted successfully:
  - insertedId: ObjectId(...)
  - bill_reference: INV-001

[CREATE BILLS FROM LEDGER] Processing allocation 2/{total}:
  ... (repeats for each allocation)

[CREATE BILLS FROM LEDGER] ✅ Successfully created {total} bills

[SAVE BILL ALLOCATIONS] ✅ Created {total} bills in bill_allocation collection for ledger {ledgerId}

[BILL ALLOCATIONS API] ✅ saveBillAllocations completed successfully
```

---

## Troubleshooting

### Bills Not Appearing in Collection

**Check 1: Verify API Request Received**

- Look for `[BILL ALLOCATIONS API] Received POST request` log
- If not present: API endpoint not being called

**Check 2: Verify Function Execution**

- Look for `[SAVE BILL ALLOCATIONS] Starting for ledger` log
- If not present: saveBillAllocations not executing

**Check 3: Verify Bill Creation**

- Look for `[CREATE BILLS FROM LEDGER] Starting for ledger` log
- If not present: createBillsFromLedgerAllocations not being called

**Check 4: Verify Database Insert**

- Look for `[CREATE BILLS FROM LEDGER] ✅ Bill inserted successfully` log
- If not present: MongoDB insert is failing

**Check 5: Query Collection Directly**

```bash
node check-bill-allocation-collection.js
```

### Common Issues

**Issue: "Ledger not found or is not billwise enabled"**

- Verify the ledger exists in ledgers collection
- Verify is_billwise = true

**Issue: Bills inserted but not appearing in reports**

- Check isDeemedPositive values match the expected logic
- Verify balance_type is "debit" or "credit"
- Check outstanding reports are querying correct filter

**Issue: Database connection error**

- Verify MongoDB is running
- Check MONGO_URI environment variable
- Verify connection string is correct

---

## API Endpoints

### Create/Update Bill Allocations

```
POST /api/ledgers/{ledgerId}/bill-allocations
Headers: Content-Type: application/json
Body: {
  companyId: string,
  allocations: [
    {
      bill_reference: string,
      allocated_amount: number,
      balance_type: "debit" | "credit",
      isDeemedPositive: "yes" | "no"
    }
  ]
}
Response: {
  success: true,
  data: {
    id: string,
    billallocation: [...],
    createdBills: [...]
  }
}
```

### Get Bill Allocations

```
GET /api/ledgers/{ledgerId}/bill-allocations?companyId={companyId}
Response: {
  success: true,
  data: [
    {
      id: string,
      bill_reference: string,
      allocated_amount: number,
      balance_type: "debit" | "credit",
      isDeemedPositive: "yes" | "no"
    }
  ]
}
```

### Query Bills

```
GET /api/bills?companyId={companyId}&source=ledger-opening
Response: {
  success: true,
  data: [
    {
      id: string,
      bill_reference: string,
      allocated_amount: number,
      ledger_id: string,
      source: "ledger-opening",
      ...
    }
  ]
}
```

---

## Integration Points

### Frontend Components Involved:

- `src/pages/masters/LedgerMaster.tsx` - Creates ledgers with allocations
- `src/components/BillwiseAllocationDialog.tsx` - Manages allocations in dialog
- `src/pages/reports/OutstandingReceivableReport.tsx` - Displays receivables
- `src/pages/reports/OutstandingPayableReport.tsx` - Displays payables

### Backend Services Involved:

- `backend/services/ledgerService.js` - saveBillAllocations()
- `backend/services/billService.js` - createBillsFromLedgerAllocations()
- `backend/routes/ledgers.js` - API endpoints for bill allocations
- `backend/routes/bills.js` - API endpoints for bills
- `backend/db.js` - MongoDB connection

### Collections Involved:

- `ledgers` - Ledger metadata
- `ledger_entries` - Ledger entries including opening balance
- `bill_allocation` - Individual bills created from allocations

---

## Future Enhancements

1. **Bill Reconciliation**: Track which bills are paid/allocated
2. **Batch Allocations**: Create multiple bills from a single batch
3. **Edit Bills**: Allow editing individual bills after creation
4. **Delete Bills**: Implement proper deletion with audit trail
5. **Bill History**: Track changes to bill allocations
6. **Advanced Filtering**: Filter bills by date range, amount, etc.
