# Auto Tax Calculation in Vouchers

## Overview

The system now automatically calculates and populates Duties & Taxes ledger amounts based on item-wise tax calculations. This works for both Purchase and Sales vouchers.

## How It Works

### 1. Company Tax Type Detection

The system first identifies the company's configured tax type:

- **GST**: CGST/SGST (Central and State GST) or IGST (Integrated GST)
- **VAT**: Value Added Tax
- **Other**: Any other tax type

### 2. Item-Wise Tax Calculation

When items are added to a voucher:

- Each item has a `tax_rate` (from Item Master)
- Tax amount = (Quantity × Rate - Discount) × Tax Rate / 100
- Total item tax = Sum of all item tax amounts

### 3. Automatic Duties & Taxes Ledger Population

When you select a **Duties & Taxes** ledger with a tax type (IGST, CGST, SGST, or VAT):

#### For GST Companies:

- **IGST Ledger**: Full item tax amount
- **CGST Ledger**: Item tax amount ÷ 2 (50%)
- **SGST Ledger**: Item tax amount ÷ 2 (50%)

Example: If total item tax = ₹100

- IGST: ₹100
- CGST: ₹50
- SGST: ₹50

#### For VAT Companies:

- **VAT Ledger**: Full item tax amount

### 4. Real-Time Updates

When you modify items:

- Change quantity, rate, or discount
- Add or remove items
- The tax ledgers automatically recalculate

## Features

✅ **Automatic Population**: Tax amounts auto-fill when Duties & Taxes ledger is selected
✅ **Company-Aware**: Calculations respect company's configured tax type
✅ **Real-Time Sync**: Updates instantly when items change
✅ **Manual Override**: You can still manually edit tax amounts if needed

## Usage Example

### Scenario: GST Company Creating a Purchase Voucher

1. **Add Items**:

   - Item 1: Qty=10, Rate=100, Tax=18% → Tax Amount = 180
   - Item 2: Qty=5, Rate=200, Tax=18% → Tax Amount = 180
   - **Total Item Tax = 360**

2. **Add Additional Ledgers**:

   - Select "CGST 9%" ledger → Auto-populates 180 (360 ÷ 2)
   - Select "SGST 9%" ledger → Auto-populates 180 (360 ÷ 2)
   - Total Tax Amount = 360 ✓

3. **Modify Items**:
   - Change Item 1 quantity to 20 → New tax = 360
   - CGST and SGST automatically update to 180 each

## Implementation Details

### Functions Added:

#### `getCompanyTaxType()`

Returns the company's configured tax type (GST, VAT, etc.)

#### `getItemTaxByType(itemsTaxTotal, taxType)`

Calculates the appropriate tax amount for a given tax type:

- For GST + CGST/SGST: Returns 50% of total
- For IGST/VAT: Returns full amount

#### `updateTaxLedgersAutomatically(items)`

Recalculates all Duties & Taxes ledger entries whenever items change:

- Triggered when items are added, modified, or removed
- Updates only ledgers with recognized tax types (IGST, CGST, SGST, VAT)

## Files Modified

- `src/pages/forms/PurchaseForm.tsx`
- `src/pages/forms/SalesForm.tsx`

## Backend Requirements

Ensure ledgers have the `tax_type` field populated with values like:

- IGST
- CGST
- SGST
- VAT

This allows the system to automatically identify which ledgers should be auto-populated with tax amounts.
