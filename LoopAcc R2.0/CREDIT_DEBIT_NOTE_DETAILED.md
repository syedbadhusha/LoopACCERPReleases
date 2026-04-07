# Credit Note and Debit Note - Complete Implementation Details

## Overview

Two new voucher types have been added to support inventory returns:

| Feature                   | Credit Note                | Debit Note                  |
| ------------------------- | -------------------------- | --------------------------- |
| **Purpose**               | Sales returns              | Purchase returns            |
| **Voucher Type**          | `credit-note`              | `debit-note`                |
| **Linked Ledger**         | Customer (Sundry Debtors)  | Supplier (Sundry Creditors) |
| **Effect on Receivables** | Reduces                    | N/A                         |
| **Effect on Payables**    | N/A                        | Reduces                     |
| **Inventory**             | Decreases                  | Decreases                   |
| **isDeemedPositive**      | "no" (for customer ledger) | "yes" (for supplier ledger) |

## File Changes

### Modified Files

1. **backend/services/voucherService.js**
   - Function: `determineDeemedPositive()` - Added voucherType parameter
   - Function: `transformVoucherPayload()` - Pass voucherType to determineDeemedPositive
   - Function: `getSalesRegister()` - Include "credit-note" in voucher_type filter
   - Function: `getPurchaseRegister()` - Include "debit-note" in voucher_type filter
   - Function: `getOutstandingReceivables()` - Include "credit-note" in filters (2 locations)
   - Function: `getOutstandingPayables()` - Include "debit-note" in filter

### New Documentation Files

1. **CREDIT_DEBIT_NOTE_IMPLEMENTATION.md** - Detailed implementation overview
2. **CREDIT_DEBIT_NOTE_QUICK_REFERENCE.md** - Quick reference with examples

## Detailed Changes

### 1. determineDeemedPositive Function (Line 166-191)

**Before:**

```javascript
async function determineDeemedPositive(ledgerId, debitAmount, creditAmount, db)
```

**After:**

```javascript
async function determineDeemedPositive(ledgerId, debitAmount, creditAmount, db, voucherType)
```

**Why:** Allows future enhancements to consider voucher type when determining deemed positive status. Currently, the function still uses debit/credit amounts, but the parameter is available for context.

---

### 2. transformVoucherPayload Function (Line 289 & 315)

**Updated Calls:**
Both calls to `determineDeemedPositive()` now include `payload.voucher_type` as the last parameter:

```javascript
const isDeemedPositive = await determineDeemedPositive(
  detail.ledger_id,
  detail.debit_amount || 0,
  detail.credit_amount || 0,
  db,
  payload.voucher_type // ← Added
);
```

**Impact:** Ensures the function has context about the voucher type being created.

---

### 3. getSalesRegister Function (Line 1128)

**Before:**

```javascript
voucher_type: "sales";
```

**After:**

```javascript
voucher_type: {
  $in: ["sales", "credit-note"];
}
```

**Impact:**

- Sales Register now includes both invoices and credit notes
- Credit notes show as negative amounts (returns)
- Customer can see both sales and returns in register

---

### 4. getPurchaseRegister Function (Line 1160)

**Before:**

```javascript
voucher_type: "purchase";
```

**After:**

```javascript
voucher_type: {
  $in: ["purchase", "debit-note"];
}
```

**Impact:**

- Purchase Register now includes both invoices and debit notes
- Debit notes show as negative amounts (returns)
- Supplier can see both purchases and returns in register

---

### 5. getOutstandingReceivables Function - Main Query (Line 1297)

**Before:**

```javascript
voucher_type: "sales";
```

**After:**

```javascript
voucher_type: {
  $in: ["sales", "credit-note"];
}
```

**Impact:**

- Outstanding Receivables now includes both sales invoices and credit notes
- Credit notes reduce the outstanding balance
- Proper net calculation: Total Sales - Total Credit Notes = Outstanding

---

### 6. getOutstandingReceivables Function - Fallback Query (Line 1425)

**Before:**

```javascript
voucher_type: "opening";
```

**After:**

```javascript
voucher_type: {
  $in: ["opening", "sales", "credit-note"];
}
```

**Why:** The fallback query handles vouchers stored as ledger_entries with nested billallocation data. It now includes credit notes to ensure they're properly recognized even if not in the bill_allocation collection.

**Impact:**

- Credit notes created via ledger_entries are now included
- Fallback mechanism catches all return types

---

### 7. getOutstandingPayables Function (Line 1556)

**Before:**

```javascript
voucher_type: "purchase";
```

**After:**

```javascript
voucher_type: {
  $in: ["purchase", "debit-note"];
}
```

**Impact:**

- Outstanding Payables now includes both purchase invoices and debit notes
- Debit notes reduce the outstanding balance
- Proper net calculation: Total Purchases - Total Debit Notes = Outstanding

---

## Data Flow

### Creating a Credit Note

```
Frontend
   ↓
POST /api/vouchers/create
   ↓
createVoucherWithDetails()
   ↓
transformVoucherPayload()
   ├─ Receives: voucher_type = "credit-note"
   ├─ Calls: determineDeemedPositive(..., "credit-note")
   └─ Result: isDeemedPositive = "no" for customer ledger
   ↓
Insert to vouchers collection
   ├─ voucher_type: "credit-note"
   ├─ ledger_entries: [{ isDeemedPositive: "no" }, ...]
   └─ inventory: [items with negative quantities]
   ↓
Insert to ledger_entries collection
   ├─ voucher_type: "credit-note"
   └─ isDeemedPositive: "no"
   ↓
Optional: Insert to bill_allocation collection
   └─ isDeemedPositive: "no" (for linking to original invoice)
```

### Creating a Debit Note

```
Frontend
   ↓
POST /api/vouchers/create
   ↓
createVoucherWithDetails()
   ↓
transformVoucherPayload()
   ├─ Receives: voucher_type = "debit-note"
   ├─ Calls: determineDeemedPositive(..., "debit-note")
   └─ Result: isDeemedPositive = "yes" for supplier ledger
   ↓
Insert to vouchers collection
   ├─ voucher_type: "debit-note"
   ├─ ledger_entries: [{ isDeemedPositive: "yes" }, ...]
   └─ inventory: [items with negative quantities]
   ↓
Insert to ledger_entries collection
   ├─ voucher_type: "debit-note"
   └─ isDeemedPositive: "yes"
   ↓
Optional: Insert to bill_allocation collection
   └─ isDeemedPositive: "yes" (for linking to original invoice)
```

### Viewing Returns in Reports

```
Frontend Request: GET /api/vouchers/report/sales-register?...
   ↓
getSalesRegister()
   ├─ Query: voucher_type: { $in: ["sales", "credit-note"] }
   ├─ Fetch: Sales invoices AND Credit Notes
   └─ Return: Combined list
   ↓
Frontend displays:
   ├─ Type: "sales" → Green (Income)
   ├─ Type: "credit-note" → Red (Return/Reduction)
   └─ Total shows net sales after returns
```

## isDeemedPositive Logic

### Current Implementation (Based on Debit/Credit)

```
Debit > 0 && Credit = 0  → isDeemedPositive = "yes"
Credit > 0 && Debit = 0  → isDeemedPositive = "no"
Both 0 or Both > 0       → isDeemedPositive = "no" (default)
```

### How It Works for Returns

**Credit Note (Sales Return):**

```
Original Sales Invoice:
  Customer Ledger: Debit ₹5,000 (isDeemedPositive = "yes")

Credit Note:
  Customer Ledger: Credit ₹5,000 (isDeemedPositive = "no")

Result: Customer balance = 5000 - 5000 = 0 (fully returned)
```

**Debit Note (Purchase Return):**

```
Original Purchase Invoice:
  Supplier Ledger: Credit ₹5,000 (isDeemedPositive = "no")

Debit Note:
  Supplier Ledger: Debit ₹5,000 (isDeemedPositive = "yes")

Result: Supplier balance = 5000 - 5000 = 0 (fully returned)
```

## Outstanding Calculations

### Outstanding Receivables (Before and After)

```
Sales Invoices:
  INV001: ₹10,000 (isDeemedPositive = "yes")
  INV002: ₹5,000 (isDeemedPositive = "yes")

Credit Notes:
  CN001: ₹2,000 (isDeemedPositive = "no")

Query Filter:
  voucher_type: { $in: ["sales", "credit-note"] }
  isDeemedPositive: "yes" (for invoices)
  isDeemedPositive: "no" (for returns, counted as reduction)

Outstanding = (10,000 + 5,000) - 2,000 = ₹13,000
```

### Outstanding Payables (Before and After)

```
Purchase Invoices:
  PO001: ₹8,000 (isDeemedPositive = "no")
  PO002: ₹7,000 (isDeemedPositive = "no")

Debit Notes:
  DN001: ₹3,000 (isDeemedPositive = "yes")

Query Filter:
  voucher_type: { $in: ["purchase", "debit-note"] }
  isDeemedPositive: "no" (for invoices)
  isDeemedPositive: "yes" (for returns, counted as reduction)

Outstanding = (8,000 + 7,000) - 3,000 = ₹12,000
```

## Validation Rules Enforced

1. **Double-Entry Accounting**: Debits must equal credits
2. **Inventory Tracking**: Items must be available for return
3. **Batch Allocations**: Each item return properly allocated to batch
4. **Balance Type**: Maintained from original ledger configuration
5. **Bill Allocations**: Optionally linked to original invoice

## Backward Compatibility

✅ **Fully Backward Compatible**

- All existing "sales" vouchers continue to work unchanged
- All existing "purchase" vouchers continue to work unchanged
- New "credit-note" and "debit-note" types are additive
- Existing reports automatically include new types (via $in operators)
- No data migration needed

## Testing Scenarios

### Scenario 1: Simple Credit Note

```
1. Create sales invoice INV001 for ₹5,000
2. Create credit note CN001 for ₹2,000 (partial return)
3. Verify Outstanding Receivables shows ₹3,000
4. Verify inventory decreases for returned items
```

### Scenario 2: Full Return with Debit Note

```
1. Create purchase invoice PO001 for ₹10,000
2. Create debit note DN001 for ₹10,000 (full return)
3. Verify Outstanding Payables shows ₹0
4. Verify inventory returns to previous level
```

### Scenario 3: Multiple Returns

```
1. Create invoice INV001 for ₹10,000
2. Create credit note CN001 for ₹3,000
3. Create credit note CN002 for ₹2,000
4. Verify Outstanding shows ₹5,000 (10,000 - 3,000 - 2,000)
5. Verify both returns appear in Sales Register
```

### Scenario 4: Linked Returns

```
1. Create invoice INV001 for ₹5,000
2. Create credit note CN001 for ₹2,000 with bill_allocation to INV001
3. Verify bill_allocation links the return to original invoice
4. Verify balance tracking is correct
```

## Migration Notes

No migration needed. New voucher types can be created immediately after deployment:

1. Deploy code changes
2. Restart backend server
3. Start creating credit notes and debit notes
4. Existing reports automatically include them

## Performance Considerations

- Query performance: Minimal impact (using $in operator for indexed fields)
- Index on `voucher_type`: Recommend ensuring this field is indexed
- Report generation: Slightly increased data volume per report (now includes returns)

## Future Enhancements

Potential improvements for future releases:

1. **Return Reason Tracking**: Add field to track return reason
2. **Auto-Link Returns**: Automatically suggest linking to original invoice
3. **Return Status**: Track return workflow (received, inspected, credited)
4. **Partial Returns**: Better UI for creating partial returns
5. **Return Dashboards**: Dedicated return analytics and reports
6. **Return Policies**: Configure return period and conditions by customer
