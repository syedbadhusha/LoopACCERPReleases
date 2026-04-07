import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus } from "lucide-react";

interface Batch {
  id: string;
  batch_number: string;
  opening_qty: number;
  opening_rate: number;
  opening_value: number;
  inward_qty: number;
  inward_rate: number;
  inward_value: number;
  outward_qty: number;
  outward_rate: number;
  outward_value: number;
  closing_qty: number;
  closing_rate: number;
  closing_value: number;
  created_at?: string;
  updated_at?: string;
}

interface BatchSelectionDialogProps {
  open: boolean;
  onClose: () => void;
  itemId: string;
  itemName: string;
  requiredQuantity: number;
  companyId: string;
  onBatchSelect: (batchId: string | null, allocationMethod?: 'fifo' | 'lifo', qty?: number) => void;
}

export const BatchSelectionDialog = ({
  open,
  onClose,
  itemId,
  itemName,
  requiredQuantity,
  companyId,
  onBatchSelect,
}: BatchSelectionDialogProps) => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>("");
  const [allocationMethod, setAllocationMethod] = useState<'manual' | 'fifo' | 'lifo'>('manual');
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [batchQty, setBatchQty] = useState<number>(requiredQuantity); // Qty for batch allocation
  const [newBatch, setNewBatch] = useState({
    batch_number: '',
    manufacturing_date: '',
    expiry_date: '',
    quantity: 0
  });

  useEffect(() => {
    if (open && itemId) {
      fetchBatches();
    }
  }, [open, itemId]);

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const url = `http://localhost:5000/api/batch-allocations?itemId=${itemId}&companyId=${companyId}`;
      console.log(`[BatchSelectionDialog] Fetching batches from: ${url}`);
      console.log(`[BatchSelectionDialog] itemId=${itemId}, companyId=${companyId}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check if response is actually JSON FIRST before reading body
      const contentType = response.headers.get('content-type');
      console.log(`[BatchSelectionDialog] Response content-type: ${contentType}`);
      
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.log(`[BatchSelectionDialog] Got non-JSON response: ${text.substring(0, 200)}`);
        throw new Error(`Invalid response format. Expected JSON but got: ${text.substring(0, 100)}`);
      }

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        const text = await response.text();
        console.log(`[BatchSelectionDialog] JSON parse error. Raw response: ${text.substring(0, 200)}`);
        throw new Error(`Failed to parse JSON: ${parseError}. Response was: ${text.substring(0, 100)}`);
      }
      console.log(`[BatchSelectionDialog] Response:`, data);

      // Handle both response formats and filter batches with available quantity
      const batchList = data.data || data.batches || [];
      const batchesWithQty = batchList.filter((b: any) => (b.inward_qty - b.outward_qty) > 0);
      console.log(`[BatchSelectionDialog] Found ${batchList.length} batches, ${batchesWithQty.length} with available quantity`);
      setBatches(batchesWithQty);
      
      if (batchesWithQty.length === 0) {
        toast.error("No batches with available quantity found");
      }
    } catch (error: any) {
      console.error("[BatchSelectionDialog] Error:", error);
      toast.error(`Error fetching batches: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getFIFOBatch = () => {
    // Sort by created date (oldest first) - FIFO method
    const sorted = [...batches].sort((a, b) => {
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    });
    return sorted[0];
  };

  const getLIFOBatch = () => {
    // Sort by created date (newest first) - LIFO method
    const sorted = [...batches].sort((a, b) => {
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
    return sorted[0];
  };

  const handleApply = () => {
    if (batchQty <= 0) {
      toast.error("Batch quantity must be greater than 0");
      return;
    }

    if (allocationMethod === 'fifo') {
      const batch = getFIFOBatch();
      if (batch) {
        onBatchSelect(batch.id, 'fifo', batchQty);
        toast.success(`FIFO: Selected batch ${batch.batch_number} with qty ${batchQty}`);
      } else {
        toast.error("No batches available");
        return;
      }
    } else if (allocationMethod === 'lifo') {
      const batch = getLIFOBatch();
      if (batch) {
        onBatchSelect(batch.id, 'lifo', batchQty);
        toast.success(`LIFO: Selected batch ${batch.batch_number} with qty ${batchQty}`);
      } else {
        toast.error("No batches available");
        return;
      }
    } else if (allocationMethod === 'manual') {
      if (!selectedBatch) {
        toast.error("Please select a batch");
        return;
      }
      onBatchSelect(selectedBatch, undefined, batchQty);
    }
    onClose();
  };

  const handleSkip = () => {
    onBatchSelect(null);
    onClose();
  };

  const handleCreateBatch = async () => {
    if (!newBatch.batch_number.trim()) {
      toast.error("Batch number is required");
      return;
    }

    if (newBatch.quantity <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('http://localhost:5000/api/batch-allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          companyId,
          batch_number: newBatch.batch_number.trim(),
          opening_qty: newBatch.quantity,
          opening_rate: 0,
          opening_value: 0
        })
      });
      const json = await response.json();

      if (!json.success) {
        throw new Error(json.message || 'Failed to create batch');
      }

      const createdBatch = json.data;
      toast.success("Batch created successfully");
      setShowCreateForm(false);
      setNewBatch({
        batch_number: '',
        manufacturing_date: '',
        expiry_date: '',
        quantity: 0
      });
      fetchBatches();
      
      // Auto-select the newly created batch
      setSelectedBatch(createdBatch.id);
      setAllocationMethod('manual');
    } catch (error: any) {
      toast.error(`Error creating batch: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select Batch - {itemName}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Required Quantity: {requiredQuantity}
          </p>
        </DialogHeader>

        <div className="space-y-6">
          {/* Create New Batch Section */}
          {!showCreateForm ? (
            <div className="flex justify-between items-center p-4 bg-accent/30 rounded-lg">
              <Label className="text-base font-semibold">Create New Batch</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Batch
              </Button>
            </div>
          ) : (
            <div className="space-y-4 p-4 border rounded-lg bg-accent/10">
              <div className="flex justify-between items-center">
                <Label className="text-base font-semibold">Create New Batch</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Batch Number *</Label>
                  <Input
                    value={newBatch.batch_number}
                    onChange={(e) => setNewBatch({ ...newBatch, batch_number: e.target.value })}
                    placeholder="Enter batch number"
                    maxLength={50}
                  />
                </div>
                <div>
                  <Label>Quantity *</Label>
                  <Input
                    type="number"
                    value={newBatch.quantity || ''}
                    onChange={(e) => setNewBatch({ ...newBatch, quantity: parseFloat(e.target.value) || 0 })}
                    placeholder="Enter quantity"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <Label>Manufacturing Date</Label>
                  <Input
                    type="date"
                    value={newBatch.manufacturing_date}
                    onChange={(e) => setNewBatch({ ...newBatch, manufacturing_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Expiry Date</Label>
                  <Input
                    type="date"
                    value={newBatch.expiry_date}
                    onChange={(e) => setNewBatch({ ...newBatch, expiry_date: e.target.value })}
                  />
                </div>
              </div>
              
              <Button 
                type="button" 
                onClick={handleCreateBatch} 
                disabled={loading || !newBatch.batch_number.trim() || newBatch.quantity <= 0}
                className="w-full"
              >
                {loading ? 'Creating...' : 'Create Batch'}
              </Button>
            </div>
          )}

          {/* Batch Allocation Quantity */}
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <Label className="text-base font-semibold mb-2 block">Batch Allocation Quantity</Label>
            <p className="text-sm text-muted-foreground mb-3">
              Enter the quantity to allocate from the selected batch (Required Qty: {requiredQuantity})
            </p>
            <Input
              type="number"
              value={batchQty}
              onChange={(e) => setBatchQty(parseFloat(e.target.value) || 0)}
              placeholder="Enter quantity for this batch allocation"
              min="0"
              step="0.01"
              className="font-medium"
            />
          </div>

          {/* Allocation Method Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Allocation Method</Label>
            <RadioGroup value={allocationMethod} onValueChange={(v) => setAllocationMethod(v as any)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="fifo" id="fifo" />
                <Label htmlFor="fifo" className="font-normal cursor-pointer">
                  FIFO (First In, First Out) - Use oldest batch first
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="lifo" id="lifo" />
                <Label htmlFor="lifo" className="font-normal cursor-pointer">
                  LIFO (Last In, First Out) - Use newest batch first
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="manual" id="manual" />
                <Label htmlFor="manual" className="font-normal cursor-pointer">
                  Manual Selection
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Manual Batch Selection */}
          {allocationMethod === 'manual' && (
            <div className="space-y-3">
              <Label className="text-base font-semibold">Available Batches</Label>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading batches...</div>
              ) : batches.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No batches available for this item
                </div>
              ) : (
                <RadioGroup value={selectedBatch} onValueChange={setSelectedBatch}>
                  {batches.map((batch) => (
                    <div
                      key={batch.id}
                      className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <RadioGroupItem value={batch.id} id={batch.id} className="mt-1" />
                      <Label htmlFor={batch.id} className="flex-1 cursor-pointer">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="font-medium">{batch.batch_number}</p>
                            <p className="text-sm text-muted-foreground">
                              Available Balance: {batch.closing_qty}
                            </p>
                          </div>
                          <div className="text-sm">
                            <p className="text-muted-foreground">
                              Rate: {batch.closing_rate}
                            </p>
                            <p className="text-muted-foreground">
                              Value: {batch.closing_value}
                            </p>
                          </div>
                        </div>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
            </div>
          )}

          {/* FIFO/LIFO Preview */}
          {(allocationMethod === 'fifo' || allocationMethod === 'lifo') && batches.length > 0 && (
            <div className="p-4 bg-accent/30 rounded-lg">
              <Label className="text-sm font-semibold mb-2 block">
                {allocationMethod === 'fifo' ? 'FIFO' : 'LIFO'} Will Select:
              </Label>
              {(() => {
                const batch = allocationMethod === 'fifo' ? getFIFOBatch() : getLIFOBatch();
                return batch ? (
                  <div className="space-y-1">
                    <p className="font-medium">{batch.batch_number}</p>
                    <p className="text-sm text-muted-foreground">
                      Available Balance: {batch.closing_qty}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Rate: {batch.closing_rate}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Value: {batch.closing_value}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No batches available</p>
                );
              })()}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={handleSkip}>
              Skip (No Batch)
            </Button>
            <Button onClick={handleApply} disabled={loading || (allocationMethod === 'manual' && !selectedBatch)}>
              Apply Selection
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
