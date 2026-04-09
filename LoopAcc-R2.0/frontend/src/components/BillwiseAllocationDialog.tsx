import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";

type BillType = 'ON ACCOUNTS' | 'Against Ref' | 'New Ref' | 'Opening' | 'Advance';

interface BillAllocationEntry {
  id?: string;
  bill_reference: string;
  amount: number;
  allocated_amount?: number;
  balance_type?: 'debit' | 'credit';
  bill_date?: string;
  bill_type?: BillType;
}

interface BillwiseAllocationDialogProps {
  open: boolean;
  onClose: () => void;
  ledgerId: string;
  ledgerName: string;
  openingBalance: number;
  companyId: string;
  balanceType?: 'debit' | 'credit';
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
}

interface BillAllocationApiItem {
  id?: string;
  bill_reference?: string;
  amount?: number;
  allocated_amount?: number;
  balance_type?: string;
  bill_date?: string;
  bill_type?: unknown;
}

const normalizeBillType = (value: unknown, fallback: BillType = 'New Ref'): BillType => {
  const normalized = String(value || '').trim().toLowerCase();

  if (['against ref', 'against-ref', 'againstref', 'agst ref', 'againts ref'].includes(normalized)) {
    return 'Against Ref';
  }

  if (['new ref', 'new-ref', 'newref'].includes(normalized)) {
    return 'New Ref';
  }

  if (['on accounts', 'on account', 'on-account', 'onaccounts'].includes(normalized)) {
    return 'ON ACCOUNTS';
  }

  if (['opening', 'open'].includes(normalized)) {
    return 'Opening';
  }

  if (['advance', 'adv', 'advc'].includes(normalized)) {
    return 'Advance';
  }

  return fallback;
};

const toSignedAmount = (amount: number, type: 'debit' | 'credit'): number => {
  const normalized = Math.abs(Number(amount) || 0);
  return type === 'debit' ? -normalized : normalized;
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const err = error as { message?: string };
    if (err.message) {
      return err.message;
    }
  }

  return fallback;
};

const BillwiseAllocationDialog = ({
  open,
  onClose,
  ledgerId,
  ledgerName,
  openingBalance,
  companyId,
  balanceType = 'debit',
}: BillwiseAllocationDialogProps) => {
  const { toast } = useToast();
  const [allocations, setAllocations] = useState<BillAllocationEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const deriveBillType = (allocation: BillAllocationEntry): BillType => {
    const hasReference = String(allocation.bill_reference || '').trim().length > 0;
    if (hasReference) {
      return 'Opening';
    }
    return normalizeBillType(allocation.bill_type, 'Opening');
  };

  const fetchAllocations = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch existing bill allocations from opening balance entry
      const response = await fetch(
        `http://localhost:5000/api/ledgers/${ledgerId}/bill-allocations?companyId=${companyId}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch allocations");
      }

      const data = await response.json() as ApiResponse<BillAllocationApiItem[]>;

      if (data.success && data.data) {
        const allocs = data.data.map((entry) => ({
          id: entry.id,
          bill_reference: entry.bill_reference,
          amount: Number(entry.amount ?? entry.allocated_amount ?? 0),
          bill_date: entry.bill_date || '',
          bill_type: normalizeBillType(entry.bill_type, 'Opening'),
        }));
        setAllocations(allocs);
      } else {
        setAllocations([]);
      }
    } catch (error: unknown) {
      console.error("Error fetching allocations:", error);
      // Don't show error if no allocations exist yet
      setAllocations([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, ledgerId]);

  useEffect(() => {
    if (open && ledgerId) {
      void fetchAllocations();
    }
  }, [fetchAllocations, ledgerId, open]);

  const addNewAllocation = () => {
    setAllocations([
      ...allocations,
      {
        bill_reference: "",
        amount: 0,
        bill_type: 'Opening',
      },
    ]);
  };

  const removeAllocation = async (index: number) => {
    const allocation = allocations[index];
    if (allocation.id) {
      try {
        const response = await fetch(
          `http://localhost:5000/api/ledgers/${ledgerId}/bill-allocations/${allocation.id}?companyId=${companyId}`,
          { method: "DELETE" }
        );

        if (!response.ok) {
          throw new Error("Failed to delete allocation");
        }

        toast({ title: "Success", description: "Allocation deleted successfully" });
      } catch (error: unknown) {
        toast({
          title: "Error",
          description: getErrorMessage(error, 'Failed to delete allocation'),
          variant: "destructive",
        });
        return;
      }
    }

    setAllocations(allocations.filter((_, i) => i !== index));
  };

  const updateAllocation = (
    index: number,
    field: keyof BillAllocationEntry,
    value: unknown
  ) => {
    const updatedAllocations = [...allocations];
    const nextAllocation = {
      ...updatedAllocations[index],
      [field]: value,
    };

    if (!nextAllocation.bill_type) {
      nextAllocation.bill_type = 'Opening';
    }

    updatedAllocations[index] = nextAllocation;
    setAllocations(updatedAllocations);
  };

  const handleSave = async () => {
    // Validate allocations
    for (const allocation of allocations) {
      if (!allocation.bill_reference.trim()) {
        toast({
          title: "Validation Error",
          description: "Bill reference is required for all allocations",
          variant: "destructive",
        });
        return;
      }
      if (allocation.amount <= 0) {
        toast({
          title: "Validation Error",
          description: "Allocated amount must be greater than 0",
          variant: "destructive",
        });
        return;
      }
    }

    const openingSigned = toSignedAmount(openingBalance, balanceType);
    const totalAllocatedSigned = allocations.reduce(
      (sum, a) => sum + (Number(a.amount) || 0),
      0
    );

    if (Math.abs(totalAllocatedSigned - openingSigned) > 0.01) {
      toast({
        title: "Validation Error",
        description: `Signed allocations (${totalAllocatedSigned.toFixed(2)}) must equal signed opening (${openingSigned.toFixed(2)}).`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const allocationData = allocations.map((a) => ({
        id: a.id,
        bill_reference: a.bill_reference.trim(),
        amount: a.amount,
        bill_type: deriveBillType(a),
        bill_date: a.bill_date || '',
      }));

      const response = await fetch(
        `http://localhost:5000/api/ledgers/${ledgerId}/bill-allocations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId,
            allocations: allocationData,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save allocations");
      }

      toast({
        title: "Success",
        description: "Bill allocations saved successfully",
      });
      onClose();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(error, 'Failed to save allocations'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openingSigned = toSignedAmount(openingBalance, balanceType);
  const totalAllocatedSigned = allocations.reduce(
    (sum, a) => sum + (Number(a.amount) || 0),
    0
  );
  const remainingSigned = openingSigned - totalAllocatedSigned;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bill-Wise Allocations - {ledgerName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
            <div>
              <div className="text-sm text-muted-foreground">Opening Balance</div>
              <div className="text-lg font-semibold">
                ₹{openingSigned.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Amount</div>
              <div className="text-lg font-semibold">₹{totalAllocatedSigned.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Remaining</div>
              <div className={`text-lg font-semibold ${Math.abs(remainingSigned) < 0.01 ? "text-green-600" : "text-red-600"}`}>
                ₹{remainingSigned.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Define bill-wise allocations for the opening balance. Each bill can have a reference number and amount.
            </p>
            <Button onClick={addNewAllocation} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Allocation
            </Button>
          </div>

          {/* Allocations List */}
          {loading && allocations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading allocations...
            </div>
          ) : allocations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No allocations added yet. Click "Add Allocation" to create one.
            </div>
          ) : (
            <div className="space-y-3">
              {allocations.map((allocation, index) => (
                <div
                  key={index}
                  className="p-4 border rounded-lg grid grid-cols-12 gap-3 items-end"
                >
                  <div className="col-span-3">
                    <Label className="text-sm font-medium">Bill Reference</Label>
                    <Input
                      value={allocation.bill_reference}
                      onChange={(e) =>
                        updateAllocation(
                          index,
                          "bill_reference",
                          e.target.value
                        )
                      }
                      placeholder="e.g., INV-001, PO-123, etc."
                      className="mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-sm font-medium">Bill Type</Label>
                    <Input
                      value={deriveBillType(allocation)}
                      readOnly
                      className="mt-1 bg-muted"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-sm font-medium">Bill Date</Label>
                    <Input
                      type="date"
                      value={allocation.bill_date || ""}
                      onChange={(e) =>
                        updateAllocation(
                          index,
                          "bill_date",
                          e.target.value
                        )
                      }
                      className="mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-sm font-medium">Amount</Label>
                    <Input
                      type="number"
                      value={Math.abs(Number(allocation.amount) || 0) || ""}
                      onChange={(e) =>
                        {
                          const absolute = Math.abs(parseFloat(e.target.value) || 0);
                          const currentType = (Number(allocation.amount) || 0) < 0 ? 'debit' : 'credit';
                          const signed = currentType === 'debit' ? -absolute : absolute;
                          updateAllocation(
                            index,
                            "amount",
                            signed
                          );
                        }
                      }
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      className="mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-sm font-medium">Type</Label>
                    <Input
                      value={(Number(allocation.amount) || 0) < 0 ? 'DR' : (Number(allocation.amount) || 0) > 0 ? 'CR' : '-'}
                      readOnly
                      className="mt-1 bg-muted"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAllocation(index)}
                    className="col-span-1"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Info Box */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900">
              💡 <strong>Tip:</strong> Bill-wise tracking allows you to allocate the opening balance across multiple bills or invoices. This is similar to batch tracking in items.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save Allocations"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BillwiseAllocationDialog;
