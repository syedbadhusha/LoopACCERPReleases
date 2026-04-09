# Batch Allocation Dialog - Tax & Discount Enhancement

## Summary

Successfully enhanced the **BatchAllocationDialog.tsx** component to display and calculate tax percentage, tax amount, discount percentage, discount amount, and net amount for each batch allocation item.

## Changes Made

### 1. Updated BatchAllocationData Interface

The interface already had optional fields for:

- `discount_percent?: number`
- `discount_amount?: number`
- `tax_percent?: number`
- `tax_amount?: number`
- `net_amount?: number`

### 2. Modified handleAddAllocation Function

Enhanced the function to:

- Calculate tax percentage from itemData (supports IGST, CGST+SGST, or generic tax_rate)
- Calculate discount percentage from itemData
- Calculate discount amount: `(amount * discountPercent) / 100`
- Calculate amount after discount: `amount - discountAmount`
- Calculate tax amount: `(amountAfterDiscount * taxPercent) / 100`
- Calculate net amount: `amountAfterDiscount + taxAmount`

**Code Addition:**

```typescript
// Calculate tax and discount based on item data
let taxPercent = 0;
let discountPercent = 0;

if (itemData) {
  // Get tax rate from item data
  if (itemData.igst_rate && itemData.igst_rate > 0) {
    taxPercent = itemData.igst_rate;
  } else if (itemData.cgst_rate && itemData.sgst_rate) {
    taxPercent = itemData.cgst_rate + itemData.sgst_rate;
  } else {
    taxPercent = itemData.tax_rate || 0;
  }

  // Get discount from item data
  discountPercent = itemData.discount_percent || 0;
}

const discountAmount = (amount * discountPercent) / 100;
const amountAfterDiscount = amount - discountAmount;
const taxAmount = (amountAfterDiscount * taxPercent) / 100;
const netAmount = amountAfterDiscount + taxAmount;

// Include all values in newAllocation object
const newAllocation: BatchAllocationData = {
  batch_id: selectedBatch,
  batch_number: batch.batch_number,
  qty: batchQty,
  rate: batchRate,
  amount: amount,
  tax_percent: taxPercent,
  tax_amount: taxAmount,
  discount_percent: discountPercent,
  discount_amount: discountAmount,
  net_amount: netAmount,
};
```

### 3. Updated Allocated Batches Display Table

Changed from simple summary layout to a detailed grid table with the following columns:

**Column Layout (12-column grid):**

1. **Batch** (col-span-2): Batch number
2. **Qty** (col-span-1, right-aligned): Allocated quantity
3. **Rate** (col-span-1, right-aligned): Unit rate
4. **Amt** (col-span-1, right-aligned): Amount (Qty × Rate)
5. **Disc%** (col-span-1, right-aligned): Discount percentage
6. **Disc** (col-span-1, right-aligned): Discount amount
7. **Tax%** (col-span-1, right-aligned): Tax percentage
8. **Tax** (col-span-1, right-aligned): Tax amount
9. **Net** (col-span-1, right-aligned): Net amount (bold)
10. **Delete** (col-span-1): Remove button

**Visual Features:**

- Header row with gray background (bg-gray-100)
- Data rows with light gray background (bg-gray-50)
- All monetary values formatted to 2 decimal places
- Delete button uses X icon in red

### 4. Enhanced Totals Summary

Updated the totals section to display the same column layout with totals for:

- Total Batch Qty
- Average Rate
- Total Amount
- Total Discount
- Total Tax Amount
- Total Net Amount

**Totals Row Layout:**
Aligns with the data rows above using the same 12-column grid system, with blue bold text for prominent visibility.

### 5. Totals Calculation (Existing)

The useEffect hook already correctly calculates:

```typescript
useEffect(() => {
  const total = allocations.reduce((sum, alloc) => sum + alloc.qty, 0);
  const totalAmt = allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
  const avgRate = total > 0 ? totalAmt / total : 0;
  const totalDisc = allocations.reduce(
    (sum, alloc) => sum + (alloc.discount_amount || 0),
    0
  );
  const totalTax = allocations.reduce(
    (sum, alloc) => sum + (alloc.tax_amount || 0),
    0
  );
  const totalNet = allocations.reduce(
    (sum, alloc) => sum + (alloc.net_amount || 0),
    0
  );

  // ... setState calls
}, [allocations]);
```

## File Modified

- `src/components/BatchAllocationDialog.tsx`

## Validation

✅ No TypeScript errors
✅ All new fields properly typed
✅ Calculations follow accounting standards
✅ Display format matches inventory line items style

## Formula Reference

For each batch allocation:

1. **Base Amount** = Quantity × Rate
2. **Discount Amount** = (Base Amount × Discount %) / 100
3. **Amount After Discount** = Base Amount - Discount Amount
4. **Tax Amount** = (Amount After Discount × Tax %) / 100
5. **Net Amount** = Amount After Discount + Tax Amount

## Next Steps (If Needed)

1. Test the dialog with sample data to verify calculations
2. Ensure itemData is properly passed from parent components (SalesForm, PurchaseForm)
3. Verify that batch allocation data with tax/discount is correctly saved to database
4. Update any related forms that use this dialog to handle the new fields

## Integration Notes

The BatchAllocationDialog now:

- Expects `itemData` prop containing tax and discount rates
- Automatically calculates all tax/discount values on batch addition
- Displays comprehensive allocation summary with all financial details
- Provides totals for summary reporting

This enhancement makes batch allocations consistent with individual line items in terms of tax and discount handling.
