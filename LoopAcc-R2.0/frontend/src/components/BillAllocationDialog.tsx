import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';

interface PendingBill {
  id: string;
  bill_reference: string;
  bill_date: string;
  opening_amount: number;
  allocated_amount: number;
  pending_amount: number;
}

interface BillAllocation {
  invoice_voucher_id: string;
  voucher_number: string;
  allocated_amount: number;
}

interface BillAllocationDialogProps {
  open: boolean;
  onClose: () => void;
  ledgerId: string;
  ledgerName: string;
  maxAmount: number;
  voucherType: 'payment' | 'receipt';
  existingAllocations: BillAllocation[];
  onSave: (allocations: BillAllocation[]) => void;
}

const BillAllocationDialog = ({
  open,
  onClose,
  ledgerId,
  ledgerName,
  maxAmount,
  voucherType,
  existingAllocations,
  onSave,
}: BillAllocationDialogProps) => {
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const [pendingBills, setPendingBills] = useState<PendingBill[]>([]);
  const [allocations, setAllocations] = useState<BillAllocation[]>(existingAllocations);
  const [loading, setLoading] = useState(false);

  const totalPendingAmount = pendingBills.reduce((sum, bill) => sum + Number(bill.pending_amount || 0), 0);
  const effectiveMaxAmount = maxAmount > 0 ? maxAmount : totalPendingAmount;

  useEffect(() => {
    if (open && ledgerId) {
      fetchPendingBills();
    }
  }, [open, ledgerId]);

  const fetchPendingBills = async () => {
    if (!selectedCompany) return;

    try {
      setLoading(true);

      // Read from bills collection and derive allocation rows from opening/closing.
      const billsRes = await fetch(
        `http://localhost:5000/api/bills?companyId=${selectedCompany.id}`
      );
      const billsJson = await billsRes.json();
      const allBills = billsJson.success ? billsJson.data || [] : [];

      const ledgerBills = allBills.filter((bill: any) => {
        if (bill.ledger_id !== ledgerId) return false;
        const closing = Number(bill.closing || 0);
        // Receipt allocates against receivables (negative closing),
        // Payment allocates against payables (positive closing).
        return voucherType === 'receipt' ? closing < 0 : closing > 0;
      });

      const bills: PendingBill[] = ledgerBills
        .map((bill: any) => {
          const openingSigned = Number(bill.opening || 0);
          const closingSigned = Number(bill.closing || 0);
          const openingAmount = Math.abs(openingSigned);
          const pendingAmount = Math.abs(closingSigned);
          const allocatedAmount = Math.max(openingAmount - pendingAmount, 0);

          return {
            id: bill.id,
            bill_reference: String(bill.bill_reference || bill.id || ''),
            bill_date: bill.bill_date || bill.created_at || '',
            opening_amount: openingAmount,
            allocated_amount: allocatedAmount,
            pending_amount: pendingAmount,
          };
        })
        .filter((bill: PendingBill) => bill.pending_amount > 0);

      console.log('[BILL DIALOG] Pending bills:', bills.length, bills);
      setPendingBills(bills);
    } catch (error) {
      console.error('Error fetching pending bills:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch pending bills',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAllocationChange = (billId: string, billReference: string, amount: number) => {
    setAllocations(prev => {
      const existing = prev.find(a => a.invoice_voucher_id === billId);
      if (existing) {
        if (amount <= 0) {
          return prev.filter(a => a.invoice_voucher_id !== billId);
        }
        return prev.map(a => 
          a.invoice_voucher_id === billId 
            ? { ...a, allocated_amount: amount }
            : a
        );
      }
      if (amount > 0) {
        return [...prev, { invoice_voucher_id: billId, voucher_number: billReference, allocated_amount: amount }];
      }
      return prev;
    });
  };

  const handleSelectAll = () => {
    let remaining = effectiveMaxAmount;
    const newAllocations: BillAllocation[] = [];

    for (const bill of pendingBills) {
      if (remaining <= 0) break;
      const allocAmount = Math.min(bill.pending_amount, remaining);
      newAllocations.push({
        invoice_voucher_id: bill.id,
        voucher_number: bill.bill_reference,
        allocated_amount: allocAmount,
      });
      remaining -= allocAmount;
    }

    setAllocations(newAllocations);
  };

  const handleClearAll = () => {
    setAllocations([]);
  };

  const handleSave = () => {
    const totalAllocated = allocations.reduce((sum, a) => sum + a.allocated_amount, 0);
    if (totalAllocated > effectiveMaxAmount) {
      toast({
        title: 'Error',
        description: `Total allocated amount (${totalAllocated.toFixed(2)}) exceeds ledger amount (${effectiveMaxAmount.toFixed(2)})`,
        variant: 'destructive',
      });
      return;
    }

    onSave(allocations);
    onClose();
  };

  const totalAllocated = allocations.reduce((sum, a) => sum + a.allocated_amount, 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bill Allocation - {ledgerName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
            <div>
              <div className="text-sm text-muted-foreground">Ledger Amount</div>
              <div className="text-lg font-semibold">₹{effectiveMaxAmount.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Allocated</div>
              <div className="text-lg font-semibold">₹{totalAllocated.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Remaining</div>
              <div className="text-lg font-semibold">₹{(effectiveMaxAmount - totalAllocated).toFixed(2)}</div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSelectAll} variant="outline" size="sm">
              Auto Allocate
            </Button>
            <Button onClick={handleClearAll} variant="outline" size="sm">
              Clear All
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-8">Loading pending bills...</div>
          ) : pendingBills.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No pending bills found for this ledger
            </div>
          ) : (
            <div className="space-y-2">
              {pendingBills.map(bill => {
                const allocation = allocations.find(
                  (a) =>
                    a.invoice_voucher_id === bill.id ||
                    String(a.voucher_number || '').trim().toLowerCase() ===
                      String(bill.bill_reference || '').trim().toLowerCase()
                );
                const allocatedAmount = allocation?.allocated_amount || 0;

                return (
                  <div key={bill.id} className="flex items-center gap-4 p-3 border rounded-lg">
                    <Checkbox
                      checked={allocatedAmount > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          const amount = Math.min(bill.pending_amount, effectiveMaxAmount - totalAllocated + allocatedAmount);
                          handleAllocationChange(bill.id, bill.bill_reference, amount);
                        } else {
                          handleAllocationChange(bill.id, bill.bill_reference, 0);
                        }
                      }}
                    />
                    <div className="flex-1 grid grid-cols-4 gap-4 items-center">
                      <div>
                        <div className="text-sm font-medium">{bill.bill_reference}</div>
                        <div className="text-xs text-muted-foreground">{bill.bill_date}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Bill Amount</div>
                        <div className="font-medium">₹{bill.opening_amount.toFixed(2)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Pending</div>
                        <div className="font-medium">₹{bill.pending_amount.toFixed(2)}</div>
                      </div>
                      <div>
                        <Label className="text-xs">Allocate Amount</Label>
                        <Input
                          type="number"
                          value={allocatedAmount || ''}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value) || 0;
                            handleAllocationChange(bill.id, bill.bill_reference, Math.min(value, bill.pending_amount));
                          }}
                          max={bill.pending_amount}
                          min={0}
                          step="0.01"
                          className="h-8"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Allocation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BillAllocationDialog;
