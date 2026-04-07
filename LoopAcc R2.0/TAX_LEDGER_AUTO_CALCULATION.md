# Tax Ledger Auto-Calculation Guide

## Overview

The system now automatically calculates and populates IGST, CGST, SGST, and VAT amounts in Additional Ledgers (Duties & Taxes) section when you:

1. Select a tax ledger from the Duties & Taxes group
2. Add or modify items
3. Remove items

The system respects manual edits - if you manually change a tax amount, subsequent auto-calculations will preserve that override.

## How It Works

### Step 1: Item-Wise Tax Calculation

Each item's tax is calculated as:

```
Tax Amount = (Quantity × Rate - Discount) × Tax Rate / 100
```

**Example:**

- Item: Qty=10, Rate=100, Tax=18%
- Amount = 10 × 100 = ₹1,000
- Tax = 1,000 × 18% = ₹180

### Step 2: Tax Ledger Amount Calculation

When you select a Duties & Taxes ledger with a tax type, the system calculates:

#### For GST Companies:

```
CGST Amount = Total Item Tax ÷ 2
SGST Amount = Total Item Tax ÷ 2
IGST Amount = Total Item Tax (100%)
```

#### For VAT Companies:

```
VAT Amount = Total Item Tax (100%)
```

#### For Other Tax Types:

- Amount defaults to 0 (manual entry required)

### Step 3: Auto-Calculation Tracking

The system tracks each tax ledger entry with a flag:

- **isAutoCalculated: true** = Auto-populated, will update when items change
- **isAutoCalculated: false** = Manually edited, will NOT be overwritten by auto-calculation

## Usage Examples

### Example 1: GST Company with CGST & SGST

**Step 1: Add Items**

```
Item A: Qty=10, Rate=100, Tax=18% → Tax = ₹180
Item B: Qty=5, Rate=200, Tax=18% → Tax = ₹180
Total Item Tax = ₹360
```

**Step 2: Select CGST Ledger**

- System detects: GST Company + CGST
- Auto-populates: ₹360 ÷ 2 = ₹180
- Status: isAutoCalculated = true

**Step 3: Select SGST Ledger**

- System detects: GST Company + SGST
- Auto-populates: ₹360 ÷ 2 = ₹180
- Status: isAutoCalculated = true

**Step 4: Modify Item A Quantity to 20**

- New Item Tax: 2,000 × 18% = ₹360
- Total Item Tax: ₹360 + ₹180 = ₹540
- CGST Auto-updates: ₹540 ÷ 2 = ₹270 ✓
- SGST Auto-updates: ₹540 ÷ 2 = ₹270 ✓

### Example 2: Manual Override Workflow

**Step 1: Auto-Calculated Ledger**

```
CGST: ₹180 (auto-calculated, isAutoCalculated = true)
```

**Step 2: User Manually Changes CGST to ₹200**

```
CGST: ₹200 (manual edit, isAutoCalculated = false)
```

**Step 3: Item Quantity Changes**

```
New total tax: ₹540
CGST: ₹200 (UNCHANGED - respects manual override) ✓
```

**To re-enable auto-calculation:**

- Delete and re-add the ledger, or
- Contact support to reset the flag

### Example 3: IGST Only Company

**Setup:**

- Company Tax Type: GST (IGST mode)
- Item Tax: ₹360

**Selection:**

- Select "IGST 18%" ledger
- Auto-populates: ₹360 (100% of tax)
- Status: isAutoCalculated = true

### Example 4: VAT Company

**Setup:**

- Company Tax Type: VAT
- Item Tax: ₹150

**Selection:**

- Select "VAT 15%" ledger
- Auto-populates: ₹150 (100% of tax)
- Status: isAutoCalculated = true

## Automatic Update Triggers

✅ **Auto-Calculation Updates When:**

1. Item is added → Tax ledgers recalculate
2. Item quantity changes → Tax ledgers recalculate
3. Item rate changes → Tax ledgers recalculate
4. Item discount changes → Tax ledgers recalculate
5. Item tax rate changes → Tax ledgers recalculate
6. Item is removed → Tax ledgers recalculate
7. New tax ledger is selected → Amount auto-fills

✅ **Manual Override Respected When:**

- You manually edit a tax ledger amount
- isAutoCalculated flag changes to false
- Future item changes will NOT overwrite the manual value

❌ **Auto-Calculation Does NOT Happen When:**

- You select a non-tax ledger (uses manual entry)
- A ledger amount was manually edited (until ledger is re-selected)
- Tax ledger has zero item tax (uses 0 automatically)

## Field Configuration

### Ledger Requirements

Ensure your ledgers in the accounting setup have:

```
Group: "Duties & Taxes"
Tax Type: "IGST", "CGST", "SGST", or "VAT"
```

**Example Ledger Setup:**

```
Ledger: CGST 9%
  - Group: Duties & Taxes
  - Tax Type: CGST

Ledger: SGST 9%
  - Group: Duties & Taxes
  - Tax Type: SGST

Ledger: IGST 18%
  - Group: Duties & Taxes
  - Tax Type: IGST

Ledger: VAT 15%
  - Group: Duties & Taxes
  - Tax Type: VAT
```

## Voucher Total Calculation

The system calculates final totals as:

```
Sub Total = Sum of all item amounts (before tax)
Other Ledgers = Sum of non-tax ledger amounts
Tax Amount = Sum of Duties & Taxes ledger amounts with tax types
Total Amount = Sub Total + Other Ledgers
Net Amount = Total Amount + Tax Amount
```

**Example:**

```
Items:
  - Item A: ₹1,000 amount + ₹180 tax
  - Item B: ₹1,000 amount + ₹180 tax

Sub Total: ₹2,000
Other Ledgers: ₹0
Tax Ledgers:
  - CGST: ₹180
  - SGST: ₹180
  - Total Tax: ₹360

Total Amount: ₹2,000
Net Amount: ₹2,360
```

## Troubleshooting

### Issue: Tax Ledger Not Auto-Populating

**Solution:**

1. Check if ledger is in "Duties & Taxes" group
2. Check if ledger has tax_type field (IGST, CGST, SGST, or VAT)
3. Verify at least one item is added with tax
4. Re-select the ledger

### Issue: Manual Edit Not Preserved

**Solution:**

1. The system respects manual edits if isAutoCalculated = false
2. If edit was overwritten, it means ledger was re-selected or recalculated
3. Avoid selecting the same ledger twice - it resets auto-calculation

### Issue: Tax Amount Shows 0

**Possible Causes:**

1. No items added yet
2. All items have 0 tax percent
3. Company tax type doesn't match ledger tax type
4. Ledger is not in "Duties & Taxes" group

### Issue: CGST & SGST Not Equal

**Possible Causes:**

1. You manually edited one of them
2. Manual edit is being preserved (as designed)
3. Item tax total is odd number (e.g., ₹181 → CGST=90.5, SGST=90.5)

## Best Practices

✅ **DO:**

- Let system auto-populate tax amounts when possible
- Only manually edit if you need adjustments
- Use correct company tax type configuration
- Ensure all ledgers have proper tax_type field

❌ **DON'T:**

- Manually edit taxes if you plan to modify items (edit will be lost)
- Create duplicate tax ledgers with different names
- Mix GST (CGST/SGST) with IGST in same voucher
- Use tax ledgers without "Duties & Taxes" group

## Files Updated

- `src/pages/forms/PurchaseForm.tsx`
- `src/pages/forms/SalesForm.tsx`

## API/Backend Requirements

Ledgers collection should include:

```javascript
{
  _id: ObjectId,
  id: string,
  name: string,
  group_name: string,
  tax_type: string, // "IGST", "CGST", "SGST", "VAT", or null
  company_id: string,
  created_at: Date,
  updated_at: Date
}
```
