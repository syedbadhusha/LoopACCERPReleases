# Duties and Taxes Ledger Auto-Calculation Enhancement

## Overview

Enhanced the auto-calculation feature for "Duties and Taxes" ledger amounts to properly use Item Master tax percentages.

## Changes Made

### File: `src/pages/forms/SalesForm.tsx`

#### 1. Enhanced `updateTaxLedgersAutomatically()` function

- **Location**: Lines 481-515
- **Change**: Added detailed comments and improved logic to ensure duties and taxes ledger amounts are recalculated based on item master tax percentages
- **Key Feature**:
  - Builds `itemTaxBreakdown` to track each item's tax percentage and amount
  - Ensures auto-calculated tax ledgers use the total item tax amount (which already incorporates item master tax percentages)
  - Only updates ledgers marked as auto-calculated, preserving manual edits

#### 2. Enhanced `handleAdditionalLedgerChange()` function

- **Location**: Lines 444-476
- **Change**: Added detailed comments explaining that calculations use item master tax percentages
- **Key Feature**:
  - Calculates total tax from all items (each using their master tax percentage)
  - Distributes tax to appropriate tax ledger based on tax type (CGST/SGST/IGST/VAT)
  - Auto-populates amount when Duties & Taxes ledger is selected
  - Marks as auto-calculated for future sync with item changes

### File: `TAX_LEDGER_IMPLEMENTATION.md`

- **Change**: Updated documentation to clearly state that all calculations use "Item Master Tax Percentage"
- **Enhancement**: Added section explaining how item master tax percentages flow through the entire calculation chain

## How It Works

### Flow Diagram

```
Item Selected
    ↓
Load tax_rate from Item Master
    ↓
Auto-populate tax_percent field
    ↓
Calculate tax: (Qty × Rate - Discount) × tax_percent ÷ 100
    ↓
When Duties & Taxes ledger added:
    ├─ Sum all item tax amounts (from master percentages)
    ├─ Distribute based on company tax type (GST, VAT, etc.)
    └─ Auto-populate ledger amount
    ↓
On any item change:
    └─ Recalculate all Duties & Taxes ledgers (if auto-calculated)
```

## Example Scenario

### Scenario: Sales Invoice with Multiple Items (GST Company)

**Items:**

- Item 1: Qty=10, Rate=100, Tax%=18% (from item master)
- Item 2: Qty=5, Rate=200, Tax%=5% (from item master)

**Calculation:**

1. Item 1 Tax: (10 × 100) × 18% = ₹180
2. Item 2 Tax: (5 × 200) × 5% = ₹50
3. **Total Item Tax: ₹230**

**Auto-Calculated Duties & Taxes (GST):**

- CGST: ₹230 ÷ 2 = ₹115
- SGST: ₹230 ÷ 2 = ₹115
- IGST: ₹230 (if applicable)

**When Items Change:**

- Add Item 3 with 12% tax → Total tax increases → All auto-calculated tax ledgers update
- Edit Item 1 qty → Recalculated tax → Tax ledgers sync automatically
- Manually edit CGST amount → Marked as manual, won't change on item updates

## Benefits

✅ **Accurate Tax Calculation**: Uses actual item master tax percentages, not fixed rates
✅ **Automatic Sync**: Duties & Taxes amounts always match item tax changes
✅ **Respects User Intent**: Manual edits are preserved, not overwritten
✅ **Multi-Tax Support**: Handles CGST, SGST, IGST, VAT appropriately
✅ **Company-Aware**: Distributes tax based on company's tax configuration

## Testing

### Test Case 1: Basic Auto-Calculation

1. Create sales invoice with 2 items (different tax rates from item master)
2. Add "CGST" ledger under Duties & Taxes
3. Verify: CGST amount = sum of all items' tax ÷ 2

### Test Case 2: Item Change Sync

1. Create invoice with CGST ledger auto-populated
2. Add another item with different tax percentage
3. Verify: CGST amount recalculates automatically

### Test Case 3: Manual Override

1. Create invoice with auto-calculated CGST
2. Manually edit CGST amount to a different value
3. Add/remove items
4. Verify: Manual CGST amount is preserved (not recalculated)

### Test Case 4: Multiple Tax Types (GST)

1. Create GST invoice with items having various tax percentages
2. Add both CGST and SGST ledgers
3. Verify: Both get auto-populated with equal amounts (50% split)
4. Add IGST ledger
5. Verify: IGST gets 100% of item tax amount

## Notes

- The enhancement maintains backward compatibility
- Existing vouchers continue to work as before
- Only new ledger entries or manually edited forms use the enhanced logic
- All calculations happen in real-time as user modifies the form
