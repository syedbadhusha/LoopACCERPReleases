# Ledger Master Updates - Bills Column Removal & Amount Sync Fix

## Changes Made

### 1. Removed "Bills" Column from Ledger List Actions

**File:** `src/pages/masters/LedgerMaster.tsx`

**What Changed:**

- Removed the "Bills" button that appeared in the ledger list actions
- Bills are now managed exclusively through the Ledger Master edit/create page via the BillwiseAllocationDialog
- Users must edit/create a ledger to manage its bill allocations instead of using a separate Bills button

**Before:**

```tsx
{ledger.is_billwise && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => setBillAllocationDialog({...})}
    title="Manage bill allocations for this ledger"
  >
    Bills
  </Button>
)}
<Button variant="outline" size="sm" onClick={() => handleEdit(ledger)}>
  <Edit className="h-4 w-4" />
</Button>
```

**After:**

```tsx
<Button variant="outline" size="sm" onClick={() => handleEdit(ledger)}>
  <Edit className="h-4 w-4" />
</Button>
```

**Impact:**

- Cleaner UI with fewer action buttons
- All ledger operations (including bills) flow through a single edit dialog
- Users must now use the Edit button to manage bill allocations

---

### 2. Fixed Amount Field Not Updating in bill_allocation Collection

**Files:**

- `backend/services/ledgerService.js` (line 277)
- `backend/services/billService.js` (line 221)

**Problem:**
When editing a ledger's bill allocations through the Ledger Master form, the amounts were not being saved correctly to the `bill_allocation` collection. The frontend was sending `allocated_amount` but the backend was looking for `amount` field.

**Root Cause:**

- Frontend sends: `allocated_amount`
- Backend expected: `amount`
- Mismatch caused amounts to default to `undefined` or `0`

**Solution:**
Updated both ledgerService.js and billService.js to accept either field name with proper fallback:

```javascript
// ledgerService.js line 277
amount: alloc.amount || alloc.allocated_amount,

// billService.js line 221
amount: allocation.amount || allocation.allocated_amount || 0,
```

**Data Flow:**

```
Frontend (LedgerMaster.tsx line 231)
  ↓
allocationsToSave = {
  bill_reference: ...,
  allocated_amount: ...,  ← Frontend sends this field
  balance_type: ...,
  bill_date: ...,
  isDeemedPositive: ...
}
  ↓
POST /api/ledgers/:id/bill-allocations
  ↓
ledgerService.saveBillAllocations()
  ↓
Creates billallocations array with:
  amount: alloc.amount || alloc.allocated_amount  ← Now properly mapped
  ↓
createBillsFromLedgerAllocations()
  ↓
Creates bills in bill_allocation collection with correct amount
```

---

## Testing Checklist

### Bills Column Removal

- [ ] Open Ledger Master list
- [ ] Verify "Bills" button is not visible in ledger actions
- [ ] Only "Edit" and "Delete" buttons should be visible
- [ ] Click Edit on a billwise ledger and verify BillwiseAllocationDialog opens
- [ ] Verify bill allocations can be managed through the edit dialog

### Amount Field Sync

- [ ] Create a billwise ledger with opening balance of 1000
- [ ] Add bill allocations totaling 1000 (e.g., Bill1: 600, Bill2: 400)
- [ ] Save the ledger
- [ ] Query `bill_allocation` collection for the ledger's bills
- [ ] Verify amounts are correctly saved (600 and 400, not 0 or undefined)
- [ ] Edit the ledger and change bill amounts to 700 and 300
- [ ] Save the changes
- [ ] Query `bill_allocation` collection again
- [ ] Verify amounts are updated (700 and 300)
- [ ] Verify in Outstanding Reports that amounts are correct

---

## Files Modified

1. `src/pages/masters/LedgerMaster.tsx` - Removed Bills button from ledger list actions
2. `backend/services/ledgerService.js` - Fixed amount field mapping in saveBillAllocations()
3. `backend/services/billService.js` - Fixed amount field mapping in createBillsFromLedgerAllocations()

---

## Deployment Notes

- No database migration required
- Changes are backward compatible
- Both `amount` and `allocated_amount` field names are now supported
- Existing bill allocations can be updated by re-editing the ledger through the Ledger Master form
- All changes compiled without errors

---

## User Experience Improvements

1. **Cleaner UI**: Fewer action buttons in the ledger list
2. **Consistent Workflow**: All ledger modifications flow through the edit dialog
3. **Fixed Data Sync**: Bill amounts are now correctly stored and updated in bill_allocation collection
4. **Better Outstanding Reports**: Correct amounts will display in Outstanding Receivables/Payables
