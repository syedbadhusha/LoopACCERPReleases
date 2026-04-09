import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import SearchableDropdown from '@/components/ui/searchable-dropdown';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Plus, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { getCompanyTaxType, isCompanyTaxEnabled, isCompanyBillsEnabled } from '@/lib/companyTax';
import BillwiseAllocationDialog from '@/components/BillwiseAllocationDialog';

type BillType = 'ON ACCOUNTS' | 'Against Ref' | 'New Ref' | 'Opening' | 'Advance';

interface LedgerBillAllocation {
  id?: string;
  bill_reference: string;
  amount: number;
  allocated_amount?: number;
  balance_type?: 'debit' | 'credit';
  bill_date?: string;
  bill_type?: BillType;
}

interface LedgerGroup {
  id: string;
  name: string;
  nature?: string;
  parent_id?: string;
  group_index?: number;
}

interface LedgerGroupsRef {
  name?: string;
}

interface LedgerRecord {
  id: string;
  name: string;
  alias?: string;
  opening_balance: number;
  balance_type: 'debit' | 'credit';
  group_id?: string;
  ledger_group_id?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  pan?: string;
  address?: string;
  tax_type?: string;
  is_billwise?: boolean;
  bill_allocations?: LedgerBillAllocation[];
  ledger_groups?: LedgerGroupsRef;
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
}

interface ErrorLike {
  code?: string;
  message?: string;
  details?: string;
}

interface LedgerAllocationApiItem {
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

const toSignedAmount = (amount: number, balanceType: 'debit' | 'credit'): number => {
  const normalized = Math.abs(Number(amount) || 0);
  return balanceType === 'debit' ? -normalized : normalized;
};

const isNearZero = (value: number, epsilon = 0.01): boolean => Math.abs(Number(value) || 0) <= epsilon;

const normalizeBillReference = (value: unknown): string =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

const formatSignedAmountWithDrCr = (signedAmount: number): string => {
  const numeric = Number(signedAmount) || 0;
  const absoluteAmount = Math.abs(numeric).toFixed(2);

  if (numeric < 0) {
    return `₹${absoluteAmount} DR`;
  }

  if (numeric > 0) {
    return `₹${absoluteAmount} CR`;
  }

  return `₹${absoluteAmount}`;
};

const LedgerMaster = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo;
  const action = location.state?.action || location.search.includes('action=create');
  const type = location.state?.type || new URLSearchParams(location.search).get('type');
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const isTaxEnabled = isCompanyTaxEnabled(selectedCompany);
  const companyTaxType = getCompanyTaxType(selectedCompany);
  const [loading, setLoading] = useState(false);
  const [ledgers, setLedgers] = useState<LedgerRecord[]>([]);
  const [ledgerGroups, setLedgerGroups] = useState<LedgerGroup[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingLedger, setEditingLedger] = useState<LedgerRecord | null>(null);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupSubmitting, setGroupSubmitting] = useState(false);
  const [quickGroup, setQuickGroup] = useState({ name: '', nature: '', parent_id: '' });
  const GROUP_NATURES = ['Asset', 'Liability', 'Income', 'Expense'];

  const handleCreateQuickGroup = async () => {
    if (!quickGroup.name.trim() || !selectedCompany) return;
    setGroupSubmitting(true);
    try {
      const resp = await fetch('http://localhost:5000/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: quickGroup.name.trim(),
          nature: quickGroup.nature || null,
          parent_id: quickGroup.parent_id || null,
          is_system: false,
          company_id: selectedCompany.id,
        }),
      });
      const json = await resp.json();
      if (!json.success) throw new Error(json.message || 'Failed to create group');
      toast({ title: 'Success', description: `Group "${quickGroup.name.trim()}" created!` });
      await fetchData();
      setFormData(prev => ({ ...prev, ledger_group_id: json.data.id }));
      setGroupDialogOpen(false);
      setQuickGroup({ name: '', nature: '', parent_id: '' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to create group', variant: 'destructive' });
    } finally {
      setGroupSubmitting(false);
    }
  };
  const [billAllocationDialog, setBillAllocationDialog] = useState({
    open: false,
    ledgerId: '',
    ledgerName: '',
    openingBalance: 0,
    balanceType: 'debit' as 'debit' | 'credit',
  });
  
  const [formData, setFormData] = useState({
    ledger_group_id: '',
    name: '',
    alias: '',
    opening_balance: 0,
    balance_type: 'debit',
    phone: '',
    email: '',
    gstin: '',
    pan: '',
    address: '',
    tax_type: '',
    is_billwise: false,
    bill_allocations: [] as LedgerBillAllocation[]
  });

  const deriveBillType = (allocation: Partial<LedgerBillAllocation>): BillType => {
    const hasReference = String(allocation.bill_reference || '').trim().length > 0;
    if (formData.is_billwise && hasReference) {
      return 'Opening';
    }
    return normalizeBillType(allocation.bill_type, 'Opening');
  };

  const selectedLedgerGroup = ledgerGroups.find((g) => g.id === formData.ledger_group_id);
  /** Groups where bill-wise must be disabled: Bank Accounts(1005), Cash-in-Hand(1006), Fixed Assets(1017), Bank OD A/c(1022) */
  const BILLWISE_DISABLED_INDEXES = new Set([1005, 1006, 1017, 1022]);
  const isBillwiseDisabledGroup = BILLWISE_DISABLED_INDEXES.has(Number(selectedLedgerGroup?.group_index));
  const billsEnabled = isCompanyBillsEnabled(selectedCompany);

  useEffect(() => {
    if (isBillwiseDisabledGroup && formData.is_billwise) {
      setFormData((prev) => ({
        ...prev,
        is_billwise: false,
      }));
    }
  }, [isBillwiseDisabledGroup, formData.is_billwise]);

  const getErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'object' && error !== null) {
      const err = error as ErrorLike;
      if (err.code === '23505') {
        return 'A ledger with this name already exists in this company.';
      }
      if (err.message) {
        return err.message;
      }
      if (err.details) {
        return err.details;
      }
    }

    return fallback;
  };

  const fetchData = useCallback(async () => {
    if (!selectedCompany) return;
    try {
      const [ledgersRes, groupsRes] = await Promise.all([
        fetch(`http://localhost:5000/api/ledgers?companyId=${selectedCompany.id}`).then(r => r.json() as Promise<ApiResponse<LedgerRecord[]>>),
        fetch(`http://localhost:5000/api/groups?companyId=${selectedCompany.id}`).then(r => r.json() as Promise<ApiResponse<LedgerGroup[]>>)
      ]);

      if (ledgersRes?.success) {
        setLedgers(Array.isArray(ledgersRes.data) ? ledgersRes.data : []);
      }

      if (groupsRes?.success) {
        setLedgerGroups(Array.isArray(groupsRes.data) ? groupsRes.data : []);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    }
  }, [selectedCompany]);

  useEffect(() => {
    if (selectedCompany) {
      void fetchData();
    }
  }, [fetchData, selectedCompany]);

  useEffect(() => {
    // Check for auto-open form from state or URL parameters
    if (action || location.search.includes('action=create')) {
      setShowForm(true);
      if (type === 'customer' || type === 'supplier') {
        // Pre-select appropriate group based on type
        const defaultGroup = ledgerGroups.find(g =>
          type === 'customer' ? g.name === 'Sundry Debtors' : g.name === 'Sundry Creditors'
        );
        if (defaultGroup) {
          setFormData(prev => ({ ...prev, ledger_group_id: defaultGroup.id }));
        }
      }
    }
  }, [action, ledgerGroups, location.search, type]);

  const resetForm = () => {
    setFormData({
      ledger_group_id: '',
      name: '',
      alias: '',
      opening_balance: 0,
      balance_type: 'debit',
      phone: '',
      email: '',
      gstin: '',
      pan: '',
      address: '',
      tax_type: '',
      is_billwise: false,
      bill_allocations: []
    });
    setEditingLedger(null);
    setShowForm(false);
  };

  const handleEdit = async (ledger: LedgerRecord) => {
    const defaultBillType: BillType = ledger.is_billwise ? 'Opening' : 'ON ACCOUNTS';

    const fallbackAllocations: LedgerBillAllocation[] = Array.isArray(ledger.bill_allocations)
      ? ledger.bill_allocations.map((alloc) => ({
          id: alloc.id,
          bill_reference: alloc.bill_reference || '',
          amount: Number(alloc.amount ?? alloc.allocated_amount ?? 0) || 0,
          bill_date: alloc.bill_date || '',
          bill_type: normalizeBillType(alloc.bill_type, defaultBillType),
        }))
      : [];

    let loadedBillAllocations = fallbackAllocations;

    if (selectedCompany?.id && ledger?.id) {
      try {
        const response = await fetch(
          `http://localhost:5000/api/ledgers/${ledger.id}/bill-allocations?companyId=${selectedCompany.id}`
        );
        const json = await response.json() as ApiResponse<LedgerAllocationApiItem[]>;

        if (json?.success && Array.isArray(json.data)) {
          loadedBillAllocations = json.data.map((alloc) => ({
            id: alloc.id,
            bill_reference: alloc.bill_reference || '',
            amount: Number(alloc.amount ?? alloc.allocated_amount ?? 0) || 0,
            bill_date: alloc.bill_date || '',
            bill_type: normalizeBillType(alloc.bill_type, defaultBillType),
          }));
        }
      } catch (error) {
        console.error('[LEDGER MASTER] Failed to load existing bill allocations:', error);
      }
    }

    setFormData({
      ledger_group_id: ledger.group_id || ledger.ledger_group_id || '',
      name: ledger.name,
      alias: ledger.alias || '',
      opening_balance: ledger.opening_balance,
      balance_type: ledger.balance_type,
      phone: ledger.phone || '',
      email: ledger.email || '',
      gstin: ledger.gstin || '',
      pan: ledger.pan || '',
      address: ledger.address || '',
      tax_type: ledger.tax_type || '',
      is_billwise:
        BILLWISE_DISABLED_INDEXES.has(
          Number(ledgerGroups.find((g) => g.id === (ledger.group_id || ledger.ledger_group_id || ''))?.group_index),
        )
          ? false
          : ledger.is_billwise || false,
      bill_allocations: loadedBillAllocations
    });
    setEditingLedger(ledger);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    setLoading(true);

    try {
      // Basic validation
      if (!formData.ledger_group_id) {
        toast({ title: "Validation", description: "Please select a ledger group.", variant: "destructive" });
        setLoading(false);
        return;
      }

      // Client-side duplicate check for ledger name (case-insensitive)
      const dupCheck = ledgers.find(l => l.name?.toLowerCase() === formData.name.trim().toLowerCase());

      if (dupCheck && (!editingLedger || dupCheck.id !== editingLedger.id)) {
        toast({
          title: "Duplicate name",
          description: "A ledger with this name already exists in this company.",
          variant: "destructive"
        });
        return;
      }

      // Validate billwise allocations if enabled
      let effectiveBalanceType: 'debit' | 'credit' = formData.balance_type === 'credit' ? 'credit' : 'debit';
      let effectiveOpeningSigned = toSignedAmount(formData.opening_balance, effectiveBalanceType);

      if (formData.is_billwise && !isBillwiseDisabledGroup) {
        const hasOpeningBalance = !isNearZero(effectiveOpeningSigned);

        if (hasOpeningBalance && formData.bill_allocations.length === 0) {
          toast({
            title: 'Validation Error',
            description: 'Bill-wise allocation is required when opening balance is entered for a billwise ledger.',
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }

        if (formData.bill_allocations.length > 0) {
        // Bill reference must be unique within this ledger
        const referenceCounts = new Map<string, number>();
        for (const alloc of formData.bill_allocations) {
          const normalizedReference = normalizeBillReference(alloc.bill_reference);
          if (!normalizedReference) continue;
          referenceCounts.set(
            normalizedReference,
            (referenceCounts.get(normalizedReference) || 0) + 1,
          );
        }

        const duplicateReferences = Array.from(referenceCounts.entries()).filter(([, count]) => count > 1);
        if (duplicateReferences.length > 0) {
          toast({
            title: "Validation Error",
            description: "Bill reference must be unique for this ledger.",
            variant: "destructive"
          });
          setLoading(false);
          return;
        }

        // Bill reference is mandatory when amount is entered
        const missingReferences = formData.bill_allocations.filter((alloc) => {
          const hasAmount = Math.abs(Number(alloc.amount) || 0) > 0.01;
          const hasReference = String(alloc.bill_reference || '').trim().length > 0;
          return hasAmount && !hasReference;
        });

        if (missingReferences.length > 0) {
          toast({
            title: "Validation Error",
            description: `Bill reference is required for ${missingReferences.length} allocation(s) with amount.`,
            variant: "destructive"
          });
          setLoading(false);
          return;
        }

        // Check that allocations WITH a bill reference have bill_date filled
        const missingDates = formData.bill_allocations.filter(alloc => {
          const hasReference = String(alloc.bill_reference || '').trim().length > 0;
          return hasReference && !alloc.bill_date;
        });
        if (missingDates.length > 0) {
          toast({
            title: "Validation Error",
            description: `All bill allocations must have a bill date. Missing date in ${missingDates.length} allocation(s)`,
            variant: "destructive"
          });
          setLoading(false);
          return;
        }

        const totalAllocatedSigned = formData.bill_allocations.reduce(
          (sum, alloc) => sum + (Number(alloc.amount) || 0),
          0,
        );

        // If opening is zero and user entered bill allocations, derive opening from allocations.
        // If opening is provided, enforce strict equality with allocations.
        if (isNearZero(effectiveOpeningSigned)) {
          effectiveOpeningSigned = totalAllocatedSigned;
          effectiveBalanceType = effectiveOpeningSigned < 0 ? 'debit' : 'credit';
        } else if (Math.abs(totalAllocatedSigned - effectiveOpeningSigned) > 0.01) {
          toast({
            title: "Validation Error",
            description: `Bill allocations (${formatSignedAmountWithDrCr(totalAllocatedSigned)}) must match opening balance (${formatSignedAmountWithDrCr(effectiveOpeningSigned)}).`,
            variant: "destructive"
          });
          setLoading(false);
          return;
        }

        // Validate that bill dates are less than company booking date (only for rows with a reference)
        const invalidDates = formData.bill_allocations.filter(alloc => {
          const hasReference = String(alloc.bill_reference || '').trim().length > 0;
          return hasReference && alloc.bill_date && selectedCompany?.books_beginning &&
            new Date(alloc.bill_date) >= new Date(selectedCompany.books_beginning);
        });
        if (invalidDates.length > 0) {
          toast({
            title: "Validation Error",
            description: `Bill date must be less than company booking date (${new Date(selectedCompany.books_beginning).toLocaleDateString()})`,
            variant: "destructive"
          });
          setLoading(false);
          return;
        }
        }
      }
      // Ensure balance_type is valid for DB constraint and normalize numeric fields
      const validBalance = effectiveBalanceType;
      const dataToSave = {
        ...formData,
        balance_type: validBalance,
        is_billwise: formData.is_billwise === true && !isBillwiseDisabledGroup,
        bill_allocations:
          formData.is_billwise === true && !isBillwiseDisabledGroup
            ? formData.bill_allocations
            : [],
        opening_balance: Math.abs(Number(effectiveOpeningSigned) || 0),
        company_id: selectedCompany.id
      };

      // Log payload for debugging
      console.debug('Saving ledger payload:', dataToSave);

      let createdLedgerId: string;
      if (editingLedger) {
        const resp = await fetch(`http://localhost:5000/api/ledgers/${editingLedger.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSave)
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'Update failed');
        createdLedgerId = editingLedger.id;
        toast({ title: 'Success', description: 'Ledger updated successfully!' });
      } else {
        const resp = await fetch(`http://localhost:5000/api/ledgers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSave)
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'Insert failed');
        createdLedgerId = json.data.id;
        toast({ title: 'Success', description: 'Ledger created successfully!' });
      }

      // For billwise ledgers, always sync opening allocations to keep bills collection aligned.
      if (formData.is_billwise && !isBillwiseDisabledGroup && createdLedgerId) {
        try {
          console.log('[LEDGER MASTER] Saving bill allocations for ledger', createdLedgerId);
          const allocationsToSave = formData.bill_allocations.map((alloc) => ({
            id: alloc.id,
            bill_reference: alloc.bill_reference,
            amount: alloc.amount,
            bill_type: formData.is_billwise && String(alloc.bill_reference || '').trim() ? 'Opening' : deriveBillType(alloc),
            bill_date: alloc.bill_date || '',
          }));

          const billAllocRes = await fetch(
            `http://localhost:5000/api/ledgers/${createdLedgerId}/bill-allocations`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                companyId: selectedCompany.id,
                allocations: allocationsToSave,
              }),
            }
          );

          const billAllocData = await billAllocRes.json() as ApiResponse<unknown>;
          if (!billAllocData.success) {
            console.error('Failed to save bill allocations:', billAllocData);
            toast({
              title: 'Warning',
              description: 'Ledger saved but bill allocations could not be created',
              variant: 'destructive',
            });
          } else {
            console.log('[LEDGER MASTER] ✅ Bill allocations saved successfully', billAllocData.data);
          }
        } catch (error: unknown) {
          console.error('Error saving bill allocations:', error);
          toast({
            title: 'Warning',
            description: getErrorMessage(error, 'Ledger saved but bill allocations could not be created'),
            variant: 'destructive',
          });
        }
      }
      
      fetchData();
      resetForm();
      
      // If there's a return path, navigate back after a short delay
      if (returnTo) {
        setTimeout(() => {
          navigate(returnTo);
        }, 1000);
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Failed to save ledger');
      console.error('Error saving ledger:', error);
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const addBillAllocation = () => {
    setFormData(prev => {
      const currentBalanceType = prev.balance_type === 'credit' ? 'credit' : 'debit';
      const openingSigned = toSignedAmount(prev.opening_balance, currentBalanceType);
      const totalAllocatedSigned = prev.bill_allocations.reduce(
        (sum, alloc) => sum + (Number(alloc.amount) || 0),
        0,
      );

      // Prefill the next bill with the remaining opening amount so users can split quickly.
      const remainingSigned = openingSigned - totalAllocatedSigned;
      const prefilledAmount = isNearZero(openingSigned) ? 0 : remainingSigned;

      return {
        ...prev,
        bill_allocations: [
          ...prev.bill_allocations,
          {
            bill_reference: '',
            amount: prefilledAmount,
            bill_date: (() => {
              if (!selectedCompany?.books_beginning) return '';
              // Default to one day before the company books beginning date
              const d = new Date(selectedCompany.books_beginning);
              d.setDate(d.getDate() - 1);
              return d.toISOString().split('T')[0];
            })(),
            bill_type: 'Opening',
          },
        ],
      };
    });
  };

  const removeBillAllocation = (index: number) => {
    setFormData(prev => ({
      ...prev,
      bill_allocations: prev.bill_allocations.filter((_, i) => i !== index)
    }));
  };

  const updateBillAllocation = (
    index: number,
    field: keyof LedgerBillAllocation,
    value: unknown,
  ) => {
    setFormData(prev => {
      const updated = [...prev.bill_allocations];

      const nextAllocation = { ...updated[index], [field]: value };

      if (!nextAllocation.bill_type) {
        nextAllocation.bill_type = 'Opening';
      }

      updated[index] = nextAllocation;
      return { ...prev, bill_allocations: updated };
    });
  };


  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this ledger?')) return;

    try {
      const resp = await fetch(`http://localhost:5000/api/ledgers/${id}`, { method: 'DELETE' });
      const json = await resp.json();
      if (!json.success) throw new Error(json.message || 'Delete failed');
      toast({ title: 'Success', description: 'Ledger deleted successfully!' });
      await fetchData();
    } catch (error: unknown) {
      console.error('Error deleting ledger:', error);
      toast({
        title: "Error",
        description: getErrorMessage(error, 'Failed to delete ledger'),
        variant: "destructive"
      });
    }
  };

  return (
    <div className="bg-background h-screen flex flex-col overflow-hidden">
      <div className="flex-shrink-0 bg-background border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={() => {
                if (window.history.length > 1) {
                  navigate(-1);
                  return;
                }

                if (returnTo) {
                  navigate(returnTo);
                } else {
                  navigate('/dashboard');
                }
              }}
              className="mr-4"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Ledger Master</h1>
              <p className="text-sm text-muted-foreground">{selectedCompany?.name}</p>
            </div>
          </div>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Ledger
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">

        <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
          <DialogContent className="max-w-4xl overflow-y-auto max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>{editingLedger ? 'Edit Ledger' : 'Add New Ledger'}</DialogTitle>
            </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Company</Label>
                    <Input value={selectedCompany?.name || ''} readOnly className="bg-muted" />
                  </div>
                  
                  <div>
                    <Label>Ledger Group</Label>
                    <div className="flex gap-2">
                      <SearchableDropdown
                        value={formData.ledger_group_id}
                        onValueChange={(value) => setFormData({ ...formData, ledger_group_id: value })}
                        placeholder="Select Group"
                        options={ledgerGroups.map((group) => ({ value: group.id, label: group.name }))}
                      />
                      <Button type="button" variant="outline" size="icon" onClick={() => setGroupDialogOpen(true)} title="Create new group">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div>
                    <Label>Ledger Name</Label>
                    <Input 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="Enter ledger name"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label>Alias</Label>
                    <Input 
                      value={formData.alias}
                      onChange={(e) => setFormData({...formData, alias: e.target.value})}
                      placeholder="Enter alias"
                    />
                  </div>
                  
                  <div>
                    <Label>Phone</Label>
                    <Input 
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      placeholder="Enter phone number"
                    />
                  </div>
                  
                  <div>
                    <Label>Email</Label>
                    <Input 
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      placeholder="Enter email"
                    />
                  </div>
                  
                  {/* GSTIN - Only show when tax is enabled */}
                  {isTaxEnabled && (
                    <div>
                      <Label>GSTIN</Label>
                      <Input 
                        value={formData.gstin}
                        onChange={(e) => setFormData({...formData, gstin: e.target.value})}
                        placeholder="Enter GSTIN"
                      />
                    </div>
                  )}
                  
                  {/* PAN - Only show when tax is enabled */}
                  {isTaxEnabled && (
                    <div>
                      <Label>PAN</Label>
                      <Input 
                        value={formData.pan}
                        onChange={(e) => setFormData({...formData, pan: e.target.value})}
                        placeholder="Enter PAN"
                      />
                    </div>
                  )}
                  
                  {/* Tax Type - Only show for Duties & Taxes group and when tax is enabled */}
                  {isTaxEnabled && (() => {
                    const selectedGroup = ledgerGroups.find(g => g.id === formData.ledger_group_id);
                    if (selectedGroup?.name === 'Duties & Taxes') {
                      // Get tax types based on company tax type
                      const getTaxTypes = () => {
                        const taxType = companyTaxType;
                        if (taxType === 'GST') {
                          return ['IGST', 'CGST', 'SGST'];
                        } else if (taxType === 'VAT') {
                          return ['VAT', 'CESS'];
                        } else {
                          return [taxType];
                        }
                      };
                      
                      return (
                        <div>
                          <Label>Tax Type</Label>
                          <SearchableDropdown
                            value={formData.tax_type}
                            onValueChange={(value) => setFormData({ ...formData, tax_type: value })}
                            placeholder="Select Tax Type"
                            options={getTaxTypes().map((type) => ({ value: type, label: type }))}
                          />
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
                
                <div>
                  <Label>Address</Label>
                  <Textarea 
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    placeholder="Enter address"
                    rows={3}
                  />
                </div>
                  {billsEnabled && (
                    <>
                      <div className="flex items-center space-x-2 pt-6">
                        <input 
                          type="checkbox"
                          id="is_billwise"
                          checked={formData.is_billwise}
                          disabled={isBillwiseDisabledGroup}
                          onChange={async (e) => {
                            const newVal = e.target.checked;
                            if (!newVal && editingLedger?.id && selectedCompany) {
                              const resp = await fetch(`http://localhost:5000/api/bills/ledger/${editingLedger.id}?companyId=${selectedCompany.id}`);
                              const json = await resp.json();
                              if (json.data && json.data.length > 0) {
                                toast({ title: 'Cannot disable', description: `This ledger has ${json.data.length} existing bill(s). Delete them before disabling bill-wise.`, variant: 'destructive' });
                                return;
                              }
                            }
                            setFormData({...formData, is_billwise: newVal});
                          }}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                        <Label htmlFor="is_billwise" className="cursor-pointer">Enable Bill-Wise Opening Balance</Label>
                      </div>
                      
                      <div className="col-span-full">
                        <p className="text-xs text-gray-500">
                          {isBillwiseDisabledGroup
                            ? 'Bill-wise opening is disabled for Bank Accounts, Cash-in-Hand, Fixed Assets and Bank OD A/c.'
                            : 'When enabled, opening balance is tracked under "ON ACCOUNTS" allowing bill-by-bill allocation in payments instead of a single opening balance.'}
                        </p>
                      </div>
                    </>
                  )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Opening Balance</Label>
                    <Input 
                      type="number"
                      value={formData.opening_balance}
                      onChange={(e) => setFormData({...formData, opening_balance: parseFloat(e.target.value) || 0})}
                      step="0.01"
                    />
                  </div>
                  
                  <div>
                    <Label>Balance (DR/CR)</Label>
                    <SearchableDropdown
                      value={formData.balance_type}
                      onValueChange={(value) => setFormData({ ...formData, balance_type: value })}
                      placeholder="Select balance type"
                      options={[
                        { value: 'debit', label: 'DR' },
                        { value: 'credit', label: 'CR' },
                      ]}
                    />
                  </div>
                </div>

                {/* Bill-Wise Allocations Section - Only show when billwise is enabled */}
                {formData.is_billwise && (
                  <div className="space-y-4 mt-6 p-4 border rounded-lg bg-blue-50">
                    <div className="flex justify-between items-center">
                      <h3 className="font-semibold text-lg">Bill-Wise Allocations</h3>
                      <Button type="button" size="sm" onClick={addBillAllocation}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Bill
                      </Button>
                    </div>

                    {formData.bill_allocations.length === 0 ? (
                      <p className="text-sm text-gray-600">No bill allocations added. Click "Add Bill" to add one.</p>
                    ) : (
                      <div className="space-y-3">
                        {formData.bill_allocations.map((alloc, index) => {
                          const isInvalidDate = alloc.bill_date && selectedCompany?.books_beginning && new Date(alloc.bill_date) >= new Date(selectedCompany.books_beginning);
                          const hasAmount = Math.abs(Number(alloc.amount) || 0) > 0.01;
                          const hasReference = String(alloc.bill_reference || '').trim().length > 0;
                          const showMissingReference = hasAmount && !hasReference;
                          const normalizedCurrentReference = normalizeBillReference(alloc.bill_reference);
                          const duplicateReferenceCount = normalizedCurrentReference
                            ? formData.bill_allocations.filter((row) => normalizeBillReference(row.bill_reference) === normalizedCurrentReference).length
                            : 0;
                          const hasDuplicateReference = duplicateReferenceCount > 1;
                          return (
                          <div key={index} className="flex gap-3 items-end p-3 bg-white border rounded-lg">
                            <div className="flex-1">
                              <Label className="text-sm">
                                Bill Reference {hasAmount && <span className="text-red-500">*</span>}
                              </Label>
                              <Input
                                value={alloc.bill_reference}
                                onChange={(e) => updateBillAllocation(index, 'bill_reference', e.target.value)}
                                placeholder="e.g., INV-001, PO-123"
                                className={`mt-1 ${showMissingReference ? 'border-orange-400' : ''} ${hasDuplicateReference ? 'border-red-500' : ''}`}
                              />
                              {showMissingReference && (
                                <p className="text-xs text-orange-500 mt-1">Bill reference is required when amount is entered</p>
                              )}
                              {hasDuplicateReference && (
                                <p className="text-xs text-red-500 mt-1">Bill reference must be unique for this ledger</p>
                              )}
                            </div>
                            <div className="w-32">
                              <Label className="text-sm">Bill Type</Label>
                              <Input
                                value={deriveBillType(alloc)}
                                readOnly
                                className="mt-1 bg-muted"
                              />
                            </div>
                            <div className="w-40">
                              <Label className="text-sm">
                                Bill Date <span className="text-red-500">*</span>
                              </Label>
                              <Input
                                type="date"
                                value={alloc.bill_date || ''}
                                onChange={(e) => updateBillAllocation(index, 'bill_date', e.target.value)}
                                max={selectedCompany?.books_beginning}
                                className={`mt-1 ${isInvalidDate ? 'border-red-500' : ''} ${!alloc.bill_date ? 'border-orange-400' : ''}`}
                                required
                              />
                              {isInvalidDate && (
                                <p className="text-xs text-red-500 mt-1">Must be &lt; {new Date(selectedCompany.books_beginning).toLocaleDateString()}</p>
                              )}
                              {!alloc.bill_date && (
                                <p className="text-xs text-orange-500 mt-1">Bill date is required</p>
                              )}
                            </div>
                            <div className="w-32">
                              <Label className="text-sm">Amount</Label>
                              <Input
                                type="number"
                                value={Math.abs(Number(alloc.amount) || 0) || ''}
                                onChange={(e) => {
                                  const absolute = Math.abs(parseFloat(e.target.value) || 0);
                                  const currentType = (Number(alloc.amount) || 0) < 0 ? 'debit' : 'credit';
                                  const signed = currentType === 'debit' ? -absolute : absolute;
                                  updateBillAllocation(index, 'amount', signed);
                                }}
                                placeholder="0.00"
                                step="0.01"
                                className="mt-1"
                              />
                            </div>
                            <div className="w-32">
                              <Label className="text-sm">Type</Label>
                              <SearchableDropdown
                                value={(Number(alloc.amount) || 0) < 0 ? 'debit' : 'credit'}
                                onValueChange={(value) => {
                                  const absolute = Math.abs(Number(alloc.amount) || 0);
                                  const signed = value === 'debit' ? -absolute : absolute;
                                  updateBillAllocation(index, 'amount', signed);
                                }}
                                placeholder="Select type"
                                className="mt-1"
                                options={[
                                  { value: 'debit', label: 'DR' },
                                  { value: 'credit', label: 'CR' },
                                ]}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeBillAllocation(index)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        );
                        })}
                      </div>
                    )}

                    {formData.bill_allocations.length > 0 && (
                      <div className="pt-3 border-t mt-3">
                        {(() => {
                          const currentBalanceType = formData.balance_type === 'credit' ? 'credit' : 'debit';
                          const openingSigned = toSignedAmount(formData.opening_balance, currentBalanceType);
                          const totalAllocatedSigned = formData.bill_allocations.reduce(
                            (sum, a) => sum + (Number(a.amount) || 0),
                            0,
                          );
                          const effectiveOpeningSigned = isNearZero(openingSigned)
                            ? totalAllocatedSigned
                            : openingSigned;
                          const difference = effectiveOpeningSigned - totalAllocatedSigned;
                          const isMatched = Math.abs(difference) <= 0.01;

                          return (
                            <>
                        <div className="flex justify-between items-center">
                          <span className="font-medium">Total Amount:</span>
                          <span className="font-semibold">{formatSignedAmountWithDrCr(totalAllocatedSigned)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm text-gray-600 mt-1">
                          <span>Opening Balance:</span>
                          <span>{formatSignedAmountWithDrCr(effectiveOpeningSigned)}</span>
                        </div>
                            <div className={`mt-2 text-sm font-medium ${isMatched ? 'text-green-600' : 'text-red-600'}`}>
                              {isMatched ? '✓ Signed allocations match opening balance' : `✗ Difference: ₹${difference.toFixed(2)}`}
                            </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : (editingLedger ? 'Update' : 'Save')}
                  </Button>
                </DialogFooter>
              </form>
          </DialogContent>
        </Dialog>

        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Opening Balance</TableHead>
                  <TableHead>Bill-Wise</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledgers.map((ledger) => (
                  <TableRow key={ledger.id}>
                    <TableCell className="font-medium">{ledger.name}</TableCell>
                    <TableCell>{selectedCompany?.name}</TableCell>
                    <TableCell>{ledger.ledger_groups?.name}</TableCell>
                    <TableCell>
                      {formatSignedAmountWithDrCr(
                        toSignedAmount(
                          ledger.opening_balance || 0,
                          ledger.balance_type === 'credit' ? 'credit' : 'debit',
                        ),
                      )}
                    </TableCell>
                    <TableCell>{ledger.is_billwise ? '✓ Yes' : 'No'}</TableCell>
                    <TableCell>{ledger.phone}</TableCell>
                    <TableCell>{ledger.email}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2 flex-wrap">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(ledger)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDelete(ledger.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Quick Create Group Dialog */}
        <Dialog open={groupDialogOpen} onOpenChange={(o) => { if (!o) { setGroupDialogOpen(false); setQuickGroup({ name: '', nature: '', parent_id: '' }); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Create New Group</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Group Name *</Label>
                <Input
                  value={quickGroup.name}
                  onChange={(e) => setQuickGroup(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter group name"
                  autoFocus
                />
              </div>
              <div>
                <Label>Parent Group</Label>
                <SearchableDropdown
                  value={quickGroup.parent_id}
                  onValueChange={(v) => {
                    const parentGrp = ledgerGroups.find(g => g.id === v);
                    setQuickGroup(prev => ({ ...prev, parent_id: v, nature: parentGrp?.nature || prev.nature }));
                  }}
                  placeholder="None (top-level)"
                  options={ledgerGroups.map(g => ({ value: g.id, label: g.name }))}
                />
              </div>
              <div>
                <Label>Nature</Label>
                {quickGroup.parent_id && quickGroup.nature ? (
                  <div className="w-full px-3 py-2 border border-input rounded-md bg-muted text-sm font-medium flex items-center">
                    {quickGroup.nature}
                    <span className="ml-2 text-xs text-muted-foreground">✓ (Inherited)</span>
                  </div>
                ) : (
                  <SearchableDropdown
                    value={quickGroup.nature}
                    onValueChange={(v) => setQuickGroup(prev => ({ ...prev, nature: v }))}
                    placeholder="Select nature"
                    options={GROUP_NATURES.map(n => ({ value: n, label: n }))}
                  />
                )}
              </div>
              <div>
                <Label>Grandparent Group</Label>
                <div className="w-full px-3 py-2 border border-input rounded-md bg-muted text-sm text-muted-foreground flex items-center">
                  {(() => {
                    if (!quickGroup.parent_id) return <span className="italic">Select a parent group first</span>;
                    const parentGrp = ledgerGroups.find(g => g.id === quickGroup.parent_id);
                    const grandparent = parentGrp?.parent_id ? ledgerGroups.find(g => g.id === parentGrp.parent_id) : null;
                    return grandparent
                      ? <><span>{grandparent.name}</span><span className="ml-2 text-xs">✓ (Auto)</span></>
                      : <span className="italic">-- No Grandparent --</span>;
                  })()}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setGroupDialogOpen(false); setQuickGroup({ name: '', nature: '', parent_id: '' }); }}>Cancel</Button>
              <Button type="button" onClick={handleCreateQuickGroup} disabled={groupSubmitting || !quickGroup.name.trim()}>
                {groupSubmitting ? 'Creating...' : 'Create Group'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bill-Wise Allocation Dialog */}
        <BillwiseAllocationDialog
          open={billAllocationDialog.open}
          onClose={() => setBillAllocationDialog({ ...billAllocationDialog, open: false })}
          ledgerId={billAllocationDialog.ledgerId}
          ledgerName={billAllocationDialog.ledgerName}
          openingBalance={billAllocationDialog.openingBalance}
          companyId={selectedCompany?.id || ''}
          balanceType={billAllocationDialog.balanceType}
        />
        </div>
      </div>
    </div>
  );
};

export default LedgerMaster;