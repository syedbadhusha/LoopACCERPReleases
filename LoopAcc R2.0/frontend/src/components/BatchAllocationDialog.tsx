import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Batch {
  id: string;
  batch_number: string;
  opening_qty: number;
  opening_rate: number;
  opening_value: number;
  inward_qty: number;
  outward_qty: number;
  closing_qty: number;
  closing_rate: number;
  created_at?: string;
  updated_at?: string;
}

interface BatchAllocationData {
  batch_id: string;
  batch_number: string;
  qty: number;
  rate: number;
  amount: number;
  discount_percent?: number;
  discount_amount?: number;
  tax_percent?: number;
  tax_amount?: number;
  net_amount?: number;
}

interface BatchAllocationSummary {
  allocations: BatchAllocationData[];
  totalBatchQty: number;
  averageRate: number;
  totalAmount: number;
  totalDiscount?: number;
  totalTaxAmount?: number;
  totalNetAmount?: number;
}

interface BatchAllocationDialogProps {
  open: boolean;
  onClose: () => void;
  itemId: string;
  itemName: string;
  requiredQuantity: number;
  companyId: string;
  onBatchAllocationsSelect: (summary: BatchAllocationSummary) => void;
  batchesEnabled: boolean;
  initialAllocations?: BatchAllocationData[]; // For editing existing allocations
  itemData?: any; // Item data for tax rate
  companySettings?: any; // Company settings for discount enabled
}

export const BatchAllocationDialog = ({
  open,
  onClose,
  itemId,
  itemName,
  requiredQuantity,
  companyId,
  onBatchAllocationsSelect,
  batchesEnabled,
  initialAllocations,
  itemData,
  companySettings,
}: BatchAllocationDialogProps) => {
  const CREATE_NEW_BATCH_VALUE = "__create_new_batch__";
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>("");
  const [batchQty, setBatchQty] = useState<number>(0);
  const [batchRate, setBatchRate] = useState<number>(0);
  const [batchDiscountPercent, setBatchDiscountPercent] = useState<number>(0);
  const [showCreateBatchForm, setShowCreateBatchForm] = useState(false);
  const [newBatchNumber, setNewBatchNumber] = useState("");
  const [newBatchOpeningQty, setNewBatchOpeningQty] = useState<number>(0);
  const [newBatchOpeningRate, setNewBatchOpeningRate] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [allocations, setAllocations] = useState<BatchAllocationData[]>([]);
  const [totalAllocatedQty, setTotalAllocatedQty] = useState<number>(0);
  const [totalBatchQty, setTotalBatchQty] = useState<number>(0);
  const [averageRate, setAverageRate] = useState<number>(0);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [totalDiscount, setTotalDiscount] = useState<number>(0);
  const [totalTaxAmount, setTotalTaxAmount] = useState<number>(0);
  const [totalNetAmount, setTotalNetAmount] = useState<number>(0);
  
  // Check if discount is enabled in company settings
  // Settings are stored as strings in MongoDB, so check for string "true"
  const isDiscountEnabled = companySettings?.settings?.show_discount_column === "true";

  // Load batches when dialog opens
  useEffect(() => {
    if (open && itemId) {
      loadBatches();
    }
  }, [open, itemId]);

  // Load initial allocations when provided (for editing existing allocations)
  useEffect(() => {
    if (open && initialAllocations && initialAllocations.length > 0) {
      setAllocations(initialAllocations);
    } else if (open && (!initialAllocations || initialAllocations.length === 0)) {
      // Only clear allocations if dialog is opening without initial allocations
      setAllocations([]);
    }
  }, [initialAllocations, open]);

  // Calculate total allocated qty and average rate/amount with tax and discount
  useEffect(() => {
    const total = allocations.reduce((sum, alloc) => sum + alloc.qty, 0);
    const totalAmt = allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
    const avgRate = total > 0 ? totalAmt / total : 0;
    const totalDisc = allocations.reduce((sum, alloc) => sum + (alloc.discount_amount || 0), 0);
    const totalTax = allocations.reduce((sum, alloc) => sum + (alloc.tax_amount || 0), 0);
    const totalNet = allocations.reduce((sum, alloc) => sum + (alloc.net_amount || 0), 0);
    
    setTotalAllocatedQty(total);
    setTotalBatchQty(total);
    setTotalAmount(totalAmt);
    setAverageRate(avgRate);
    setTotalDiscount(totalDisc);
    setTotalTaxAmount(totalTax);
    setTotalNetAmount(totalNet);
  }, [allocations]);

  const loadBatches = async () => {
    try {
      setLoading(true);
      const url = `http://localhost:5000/api/batch-allocations?itemId=${itemId}&companyId=${companyId}`;
      console.log(`[BatchAllocationDialog] Fetching batches from: ${url}`);
      console.log(`[BatchAllocationDialog] itemId=${itemId}, companyId=${companyId}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Check if response is actually JSON FIRST before reading body
      const contentType = response.headers.get('content-type');
      console.log(`[BatchAllocationDialog] Response content-type: ${contentType}`);
      
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.log(`[BatchAllocationDialog] Got non-JSON response: ${text.substring(0, 200)}`);
        throw new Error(`Invalid response format. Expected JSON but got: ${text.substring(0, 100)}`);
      }
      
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        const text = await response.text();
        console.log(`[BatchAllocationDialog] JSON parse error. Raw response: ${text.substring(0, 200)}`);
        throw new Error(`Failed to parse JSON: ${parseError}. Response was: ${text.substring(0, 100)}`);
      }
      console.log(`[BatchAllocationDialog] Response:`, data);
      
      // Handle both response formats
      const batchList = data.data || data.batches || [];
      console.log(`[BatchAllocationDialog] Loaded ${batchList.length} batches`);
      setBatches(batchList);
      
      if (batchList.length === 0) {
        toast.error("No batches found for this item. Use Create New Batch to add one.");
      }
    } catch (error) {
      console.error("[BatchAllocationDialog] Error loading batches:", error);
      toast.error(`Failed to load batches: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Calculate preview values for display while entering data
  const getPreviewCalculation = () => {
    const amount = batchQty * batchRate;
    let taxPercent = 0;
    let discountPercent = batchDiscountPercent; // Use manually entered discount
    
    if (itemData) {
      if (itemData.igst_rate && itemData.igst_rate > 0) {
        taxPercent = itemData.igst_rate;
      } else if (itemData.cgst_rate && itemData.sgst_rate) {
        taxPercent = itemData.cgst_rate + itemData.sgst_rate;
      } else {
        taxPercent = itemData.tax_rate || 0;
      }
      // If no manual discount entered, use item's default discount
      if (discountPercent === 0) {
        discountPercent = itemData.discount_percent || 0;
      }
    }

    const discountAmount = (amount * discountPercent) / 100;
    const amountAfterDiscount = amount - discountAmount;
    const taxAmount = (amountAfterDiscount * taxPercent) / 100;
    const netAmount = amountAfterDiscount + taxAmount;

    return {
      amount,
      discountPercent,
      discountAmount,
      taxPercent,
      taxAmount,
      netAmount,
    };
  };

  const handleAddAllocation = () => {
    if (!selectedBatch) {
      toast.error("Please select a batch");
      return;
    }

    if (batchQty <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }

    if (batchRate < 0) {
      toast.error("Rate cannot be negative");
      return;
    }

    // Find selected batch details
    const batch = batches.find((b) => b.id === selectedBatch);
    if (!batch) {
      toast.error("Batch not found");
      return;
    }

    // Check available quantity
    // const availableQty =
    //   batch.closing_qty;//inward_qty - batch.outward_qty; // 
    // if (batchQty > availableQty) {
    //   toast.error(`Available quantity in batch: ${availableQty}`);
    //   return;
    // }

    // Check if batch already allocated
    const existingIndex = allocations.findIndex(
      (a) => a.batch_id === selectedBatch
    );

    if (existingIndex >= 0) {
      toast.error("Batch already allocated. Remove first to reallocate.");
      return;
    }

    const amount = batchQty * batchRate;

    // Calculate tax and discount based on item data
    let taxPercent = 0;
    let discountPercent = batchDiscountPercent; // Use manually entered discount
    
    if (itemData) {
      // Get tax rate from item data
      if (itemData.igst_rate && itemData.igst_rate > 0) {
        taxPercent = itemData.igst_rate;
      } else if (itemData.cgst_rate && itemData.sgst_rate) {
        taxPercent = itemData.cgst_rate + itemData.sgst_rate;
      } else {
        taxPercent = itemData.tax_rate || 0;
      }
      
      // Get discount from item data if no manual discount entered
      if (discountPercent === 0) {
        discountPercent = itemData.discount_percent || 0;
      }
    }

    const discountAmount = (amount * discountPercent) / 100;
    const amountAfterDiscount = amount - discountAmount;
    const taxAmount = (amountAfterDiscount * taxPercent) / 100;
    const netAmount = amountAfterDiscount + taxAmount;

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

    setAllocations([...allocations, newAllocation]);
    setSelectedBatch("");
    setBatchQty(0);
    setBatchRate(0);
    setBatchDiscountPercent(0);
    toast.success(`Batch ${batch.batch_number} allocated`);
  };

  const handleBatchSelectionChange = (value: string) => {
    if (value === CREATE_NEW_BATCH_VALUE) {
      setSelectedBatch("");
      setShowCreateBatchForm(true);
      return;
    }

    setSelectedBatch(value);
  };

  const handleCreateBatch = async () => {
    const normalizedBatchNumber = newBatchNumber.trim();
    if (!normalizedBatchNumber) {
      toast.error("Batch number is required");
      return;
    }

    if (newBatchOpeningQty < 0) {
      toast.error("Opening quantity cannot be negative");
      return;
    }

    if (newBatchOpeningRate < 0) {
      toast.error("Opening rate cannot be negative");
      return;
    }

    const duplicateBatch = batches.some(
      (batch) => batch.batch_number.trim().toLowerCase() === normalizedBatchNumber.toLowerCase()
    );
    if (duplicateBatch) {
      toast.error("Batch number already exists");
      return;
    }

    try {
      setLoading(true);
      const openingValue = newBatchOpeningQty * newBatchOpeningRate;
      const response = await fetch("http://localhost:5000/api/batch-allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          companyId,
          batch_number: normalizedBatchNumber,
          opening_qty: newBatchOpeningQty,
          opening_rate: newBatchOpeningRate,
          opening_value: openingValue,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to create batch");
      }

      const createdBatch = result.data as Batch;
      setBatches((prev) => [...prev, createdBatch]);
      setSelectedBatch(createdBatch.id);
      setShowCreateBatchForm(false);
      setNewBatchNumber("");
      setNewBatchOpeningQty(0);
      setNewBatchOpeningRate(0);
      toast.success(`Batch ${createdBatch.batch_number} created`);
    } catch (error) {
      toast.error(`Failed to create batch: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAllocation = (batchId: string) => {
    setAllocations(allocations.filter((a) => a.batch_id !== batchId));
    toast.success("Allocation removed");
  };

  const handleApply = () => {
    if (allocations.length === 0) {
      toast.error("Please add at least one batch allocation");
      return;
    }

    onBatchAllocationsSelect({
      allocations,
      totalBatchQty,
      averageRate,
      totalAmount,
      totalDiscount,
      totalTaxAmount,
      totalNetAmount,
    });
    handleClose();
  };

  const handleClose = () => {
    setSelectedBatch("");
    setBatchQty(0);
    setBatchRate(0);
    setBatchDiscountPercent(0);
    setShowCreateBatchForm(false);
    setNewBatchNumber("");
    setNewBatchOpeningQty(0);
    setNewBatchOpeningRate(0);
    setAllocations([]);
    onClose();
  };

  const selectedBatchData = batches.find((b) => b.id === selectedBatch);
  const availableQty = selectedBatchData ? selectedBatchData.closing_qty : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Batch Allocation - {itemName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 overflow-y-auto flex-1 pr-4">
          {/* Required vs Allocated */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-sm font-medium text-gray-600">
                  Required Qty
                </Label>
                <p className="text-lg font-bold text-blue-600">
                  {requiredQuantity}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-600">
                  Allocated Qty
                </Label>
                <p className="text-lg font-bold text-green-600">
                  {totalAllocatedQty}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-600">
                  Remaining
                </Label>
                <p
                  className={`text-lg font-bold ${
                    requiredQuantity - totalAllocatedQty === 0
                      ? "text-green-600"
                      : "text-orange-600"
                  }`}
                >
                  {requiredQuantity - totalAllocatedQty}
                </p>
              </div>
            </div>
          </div>

          {/* Batch Selection Form */}
          {batchesEnabled && (
            <div className="border rounded-lg p-4 bg-gray-50">
              <h3 className="font-semibold mb-3">Add Batch Allocation</h3>

              <div className="space-y-3">
                {/* Batch Select - Single Row */}
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <Label htmlFor="batch-select" className="text-sm mb-1 block">
                      Batch Number
                    </Label>
                    <Select
                      value={selectedBatch}
                      onValueChange={handleBatchSelectionChange}
                    >
                      <SelectTrigger id="batch-select" className="h-9">
                        <SelectValue placeholder="Select batch..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={CREATE_NEW_BATCH_VALUE}>+ Create New Batch</SelectItem>
                        {loading ? (
                          <div className="p-2 text-sm text-gray-600">Loading batches...</div>
                        ) : batches.length === 0 ? (
                          <div className="p-2 text-sm text-red-600">No batches found for this item</div>
                        ) : (
                          batches.map((batch) => {
                            return (
                              <SelectItem key={batch.id} value={batch.id}>
                                {batch.batch_number} (Avl: {batch.closing_qty.toFixed(2)})
                              </SelectItem>
                            );
                          })
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-2">
                    <Label htmlFor="batch-qty" className="text-sm mb-1 block">
                      Qty
                    </Label>
                    <Input
                      id="batch-qty"
                      type="number"
                      value={batchQty || ""}
                      onChange={(e) => setBatchQty(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      max={availableQty}
                      className="h-9"
                    />
                  </div>

                  <div className="col-span-2">
                    <Label htmlFor="batch-rate" className="text-sm mb-1 block">
                      Rate
                    </Label>
                    <Input
                      id="batch-rate"
                      type="number"
                      value={batchRate || ""}
                      onChange={(e) => setBatchRate(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="h-9"
                    />
                  </div>

                  <div className="col-span-2">
                    <Label htmlFor="batch-amount" className="text-sm mb-1 block">
                      Amount
                    </Label>
                    <Input
                      id="batch-amount"
                      type="number"
                      value={(batchQty * batchRate).toFixed(2)}
                      readOnly
                      className="bg-gray-200 h-9"
                    />
                  </div>

                  {isDiscountEnabled && (
                    <div className="col-span-2">
                      <Label htmlFor="batch-discount" className="text-sm mb-1 block">
                        Discount %
                      </Label>
                      <Input
                        id="batch-discount"
                        type="number"
                        value={batchDiscountPercent || ""}
                        onChange={(e) => setBatchDiscountPercent(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        min="0"
                        max="100"
                        step="0.01"
                        className="h-9"
                      />
                    </div>
                  )}

                  <div className={isDiscountEnabled ? "col-span-1" : "col-span-2"}>
                    <Button
                      onClick={handleAddAllocation}
                      size="sm"
                      disabled={
                        !selectedBatch ||
                        batchQty <= 0 ||
                        //batchQty > availableQty ||
                        loading
                      }
                      className="w-full h-9"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add
                    </Button>
                  </div>
                </div>

                {showCreateBatchForm && (
                  <div className="grid grid-cols-12 gap-2 p-3 border border-blue-200 rounded bg-blue-50">
                    <div className="col-span-4">
                      <Label htmlFor="new-batch-number" className="text-sm mb-1 block">
                        New Batch No.
                      </Label>
                      <Input
                        id="new-batch-number"
                        value={newBatchNumber}
                        onChange={(e) => setNewBatchNumber(e.target.value)}
                        placeholder="Batch number"
                        maxLength={50}
                        className="h-9 bg-white"
                      />
                    </div>
                    <div className="col-span-3">
                      <Label htmlFor="new-batch-opening-qty" className="text-sm mb-1 block">
                        Opening Qty
                      </Label>
                      <Input
                        id="new-batch-opening-qty"
                        type="number"
                        value={newBatchOpeningQty || ""}
                        onChange={(e) => setNewBatchOpeningQty(parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                        className="h-9 bg-white"
                      />
                    </div>
                    <div className="col-span-3">
                      <Label htmlFor="new-batch-opening-rate" className="text-sm mb-1 block">
                        Opening Rate
                      </Label>
                      <Input
                        id="new-batch-opening-rate"
                        type="number"
                        value={newBatchOpeningRate || ""}
                        onChange={(e) => setNewBatchOpeningRate(parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                        className="h-9 bg-white"
                      />
                    </div>
                    <div className="col-span-2 flex items-end">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleCreateBatch}
                        disabled={loading || !newBatchNumber.trim()}
                        className="w-full h-9"
                      >
                        Create
                      </Button>
                    </div>
                  </div>
                )}

                {selectedBatchData && batchQty > 0 && (
                  <div className="space-y-2">
                    {/* Batch Info */}
                    <div className="text-xs text-gray-600 bg-white p-2 rounded border border-gray-200">
                      Rate: {selectedBatchData.closing_rate.toFixed(2)} | Available: {availableQty.toFixed(2)} | Max Qty: {(availableQty).toFixed(2)}
                    </div>
                    
                    {/* Tax & Discount Preview */}
                    {batchRate > 0 && (
                      <div className="text-xs bg-blue-50 p-2 rounded border border-blue-200 grid grid-cols-12 gap-1">
                        <div className="col-span-3">
                          <span className="text-gray-600">Amt:</span>
                          <span className="font-semibold text-blue-600 ml-1">{(batchQty * batchRate).toFixed(2)}</span>
                        </div>
                        {isDiscountEnabled && (
                          <div className="col-span-3">
                            <span className="text-gray-600">Disc ({getPreviewCalculation().discountPercent.toFixed(2)}%):</span>
                            <span className="font-semibold text-blue-600 ml-1">{getPreviewCalculation().discountAmount.toFixed(2)}</span>
                          </div>
                        )}
                        <div className={isDiscountEnabled ? 'col-span-3' : 'col-span-4'}>
                          <span className="text-gray-600">Tax ({getPreviewCalculation().taxPercent.toFixed(2)}%):</span>
                          <span className="font-semibold text-blue-600 ml-1">{getPreviewCalculation().taxAmount.toFixed(2)}</span>
                        </div>
                        <div className={`font-semibold text-blue-700 ${isDiscountEnabled ? 'col-span-3' : 'col-span-4'}`}>
                          <span className="text-gray-600">Net:</span>
                          <span className="ml-1">{getPreviewCalculation().netAmount.toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Allocated Batches Summary */}
          {allocations.length > 0 && (
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Allocated Batches</h3>
              
              {/* Table Header */}
              <div className="mb-2">
                <div className={`grid gap-1 text-xs font-semibold bg-gray-100 p-2 rounded ${isDiscountEnabled ? 'grid-cols-12' : 'grid-cols-10'}`}>
                  <div className="col-span-2">Batch</div>
                  <div className="col-span-1 text-right">Qty</div>
                  <div className="col-span-1 text-right">Rate</div>
                  <div className="col-span-1 text-right">Amt</div>
                  {isDiscountEnabled && (
                    <>
                      <div className="col-span-1 text-right">Disc%</div>
                      <div className="col-span-1 text-right">Disc</div>
                    </>
                  )}
                  <div className="col-span-1 text-right">Tax%</div>
                  <div className="col-span-1 text-right">Tax</div>
                  <div className="col-span-1 text-right">Net</div>
                  <div className="col-span-1"></div>
                </div>
              </div>
              
              {/* Allocation Rows */}
              <div className="space-y-1 mb-4">
                {allocations.map((alloc) => (
                  <div
                    key={alloc.batch_id}
                    className={`grid gap-1 bg-gray-50 p-2 rounded border text-xs items-center ${isDiscountEnabled ? 'grid-cols-12' : 'grid-cols-10'}`}
                  >
                    <div className="col-span-2 font-medium">{alloc.batch_number}</div>
                    <div className="col-span-1 text-right">{alloc.qty.toFixed(2)}</div>
                    <div className="col-span-1 text-right">{alloc.rate.toFixed(2)}</div>
                    <div className="col-span-1 text-right">{alloc.amount.toFixed(2)}</div>
                    {isDiscountEnabled && (
                      <>
                        <div className="col-span-1 text-right">{(alloc.discount_percent || 0).toFixed(2)}%</div>
                        <div className="col-span-1 text-right">{(alloc.discount_amount || 0).toFixed(2)}</div>
                      </>
                    )}
                    <div className="col-span-1 text-right">{(alloc.tax_percent || 0).toFixed(2)}%</div>
                    <div className="col-span-1 text-right">{(alloc.tax_amount || 0).toFixed(2)}</div>
                    <div className="col-span-1 text-right font-semibold">{(alloc.net_amount || 0).toFixed(2)}</div>
                    <div className="col-span-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveAllocation(alloc.batch_id)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="w-3 h-3 text-red-600" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Totals Summary */}
              <div className="bg-blue-50 p-3 rounded border border-blue-200">
                <div className={`grid gap-1 text-xs ${isDiscountEnabled ? 'grid-cols-12' : 'grid-cols-10'}`}>
                  <div className="col-span-2 font-semibold text-gray-700">Totals:</div>
                  <div className="col-span-1 text-right font-bold text-blue-600">{totalBatchQty.toFixed(2)}</div>
                  <div className="col-span-1 text-right font-bold text-blue-600">{averageRate.toFixed(2)}</div>
                  <div className="col-span-1 text-right font-bold text-blue-600">{totalAmount.toFixed(2)}</div>
                  {isDiscountEnabled && (
                    <>
                      <div className="col-span-1"></div>
                      <div className="col-span-1 text-right font-bold text-blue-600">{totalDiscount.toFixed(2)}</div>
                    </>
                  )}
                  <div className="col-span-1"></div>
                  <div className="col-span-1 text-right font-bold text-blue-600">{totalTaxAmount.toFixed(2)}</div>
                  <div className="col-span-1 text-right font-bold text-blue-600">{totalNetAmount.toFixed(2)}</div>
                  <div className="col-span-1"></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Fixed button section at bottom outside scrollable area */}
        <div className="flex gap-2 justify-end border-t pt-4">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={allocations.length === 0}
          >
            Apply Allocations
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BatchAllocationDialog;
