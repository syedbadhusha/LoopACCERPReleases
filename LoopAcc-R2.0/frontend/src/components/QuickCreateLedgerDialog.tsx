import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
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
import { Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { API_BASE_URL } from '@/config/runtime';
import { getCompanyTaxType, isCompanyTaxEnabled } from '@/lib/companyTax';

const API_HOST_URL = API_BASE_URL.replace(/\/api$/, '');

type BillType = 'ON ACCOUNTS' | 'Against Ref' | 'New Ref' | 'Opening' | 'Advance';

interface LedgerBillAllocation {
  bill_reference: string;
  amount: number;
  bill_date?: string;
  bill_type?: BillType;
}

interface LedgerGroup {
  id: string;
  name: string;
  group_index?: number;
  nature?: string;
  parent_id?: string;
}

interface QuickCreateLedgerDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (ledger: { id: string; name: string; group_name: string; tax_type?: string }) => void;
  defaultGroupName?: string;
}

const BILLWISE_DISABLED_INDEXES = new Set([1005, 1006, 1017, 1022]);

const toSignedAmount = (amount: number, balanceType: 'debit' | 'credit'): number => {
  const normalized = Math.abs(Number(amount) || 0);
  return balanceType === 'debit' ? -normalized : normalized;
};

const isNearZero = (value: number, epsilon = 0.01): boolean => Math.abs(Number(value) || 0) <= epsilon;

const normalizeBillReference = (value: unknown): string =>
  String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();

const formatSignedAmountWithDrCr = (signedAmount: number): string => {
  const numeric = Number(signedAmount) || 0;
  const abs = Math.abs(numeric).toFixed(2);
  if (numeric < 0) return `₹${abs} DR`;
  if (numeric > 0) return `₹${abs} CR`;
  return `₹${abs}`;
};

const normalizeBillType = (value: unknown, fallback: BillType = 'New Ref'): BillType => {
  const n = String(value || '').trim().toLowerCase();
  if (['against ref', 'against-ref', 'againstref'].includes(n)) return 'Against Ref';
  if (['new ref', 'new-ref', 'newref'].includes(n)) return 'New Ref';
  if (['on accounts', 'on account'].includes(n)) return 'ON ACCOUNTS';
  if (['opening', 'open'].includes(n)) return 'Opening';
  if (['advance', 'adv'].includes(n)) return 'Advance';
  return fallback;
};

const QuickCreateLedgerDialog = ({
  open,
  onClose,
  onCreated,
  defaultGroupName,
}: QuickCreateLedgerDialogProps) => {
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const isTaxEnabled = isCompanyTaxEnabled(selectedCompany);
  const companyTaxType = getCompanyTaxType(selectedCompany);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<LedgerGroup[]>([]);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupSubmitting, setGroupSubmitting] = useState(false);
  const [quickGroup, setQuickGroup] = useState({ name: '', nature: '', parent_id: '' });

  const [formData, setFormData] = useState({
    name: '',
    ledger_group_id: '',
    alias: '',
    phone: '',
    email: '',
    gstin: '',
    pan: '',
    address: '',
    tax_type: '',
    opening_balance: 0,
    balance_type: 'debit',
    is_billwise: false,
    bill_allocations: [] as LedgerBillAllocation[],
  });

  const selectedGroup = groups.find(g => g.id === formData.ledger_group_id);
  const isBillwiseDisabledGroup = BILLWISE_DISABLED_INDEXES.has(Number(selectedGroup?.group_index));

  useEffect(() => {
    if (isBillwiseDisabledGroup && formData.is_billwise) {
      setFormData(prev => ({ ...prev, is_billwise: false }));
    }
  }, [isBillwiseDisabledGroup]);

  useEffect(() => {
    if (open && selectedCompany) fetchGroups();
  }, [open, selectedCompany]);

  useEffect(() => {
    if (defaultGroupName && groups.length > 0) {
      const match = groups.find(g => g.name.toLowerCase() === defaultGroupName.toLowerCase());
      if (match) setFormData(prev => ({ ...prev, ledger_group_id: match.id }));
    }
  }, [defaultGroupName, groups]);

  const fetchGroups = async () => {
    if (!selectedCompany) return;
    try {
      const res = await fetch(`${API_BASE_URL}/groups?companyId=${selectedCompany.id}`);
      const json = await res.json();
      if (json.success) setGroups(json.data || []);
    } catch (err) {
      console.error('Failed to fetch ledger groups:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '', ledger_group_id: '', alias: '', phone: '', email: '',
      gstin: '', pan: '', address: '', tax_type: '',
      opening_balance: 0, balance_type: 'debit', is_billwise: false, bill_allocations: [],
    });
  };

  const handleClose = () => { resetForm(); setGroupDialogOpen(false); setQuickGroup({ name: '', nature: '', parent_id: '' }); onClose(); };

  const GROUP_NATURES = ['Asset', 'Liability', 'Income', 'Expense'];

  const handleCreateQuickGroup = async () => {
    if (!quickGroup.name.trim() || !selectedCompany) return;
    setGroupSubmitting(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/groups`, {
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
      await fetchGroups();
      setFormData(prev => ({ ...prev, ledger_group_id: json.data.id }));
      setGroupDialogOpen(false);
      setQuickGroup({ name: '', nature: '', parent_id: '' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to create group', variant: 'destructive' });
    } finally {
      setGroupSubmitting(false);
    }
  };

  // Bill allocation helpers
  const deriveBillType = (): BillType => (formData.is_billwise ? 'Opening' : 'ON ACCOUNTS');

  const addBillAllocation = () => {
    setFormData(prev => {
      const currentBalanceType = prev.balance_type === 'credit' ? 'credit' : 'debit';
      const openingSigned = toSignedAmount(prev.opening_balance, currentBalanceType);
      const totalAllocated = prev.bill_allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
      const remaining = openingSigned - totalAllocated;
      const prefilledAmount = isNearZero(openingSigned) ? 0 : remaining;
      const defaultDate = (() => {
        if (!selectedCompany?.books_beginning) return '';
        const d = new Date(selectedCompany.books_beginning);
        d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
      })();
      return {
        ...prev,
        bill_allocations: [...prev.bill_allocations, { bill_reference: '', amount: prefilledAmount, bill_date: defaultDate, bill_type: 'Opening' }],
      };
    });
  };

  const removeBillAllocation = (index: number) => {
    setFormData(prev => ({ ...prev, bill_allocations: prev.bill_allocations.filter((_, i) => i !== index) }));
  };

  const updateBillAllocation = (index: number, field: keyof LedgerBillAllocation, value: unknown) => {
    setFormData(prev => {
      const updated = [...prev.bill_allocations];
      updated[index] = { ...updated[index], [field]: value };
      if (!updated[index].bill_type) updated[index].bill_type = 'Opening';
      return { ...prev, bill_allocations: updated };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    if (!formData.ledger_group_id) {
      toast({ title: 'Validation', description: 'Please select a ledger group.', variant: 'destructive' });
      return;
    }

    let effectiveBalanceType: 'debit' | 'credit' = formData.balance_type === 'credit' ? 'credit' : 'debit';
    let effectiveOpeningSigned = toSignedAmount(formData.opening_balance, effectiveBalanceType);

    if (formData.is_billwise && !isBillwiseDisabledGroup) {
      if (formData.bill_allocations.length > 0) {
        // Duplicate reference check
        const refCounts = new Map<string, number>();
        for (const a of formData.bill_allocations) {
          const ref = normalizeBillReference(a.bill_reference);
          if (!ref) continue;
          refCounts.set(ref, (refCounts.get(ref) || 0) + 1);
        }
        if (Array.from(refCounts.values()).some(c => c > 1)) {
          toast({ title: 'Validation Error', description: 'Bill reference must be unique for this ledger.', variant: 'destructive' });
          return;
        }
        // Missing references
        const missingRef = formData.bill_allocations.filter(a => Math.abs(Number(a.amount) || 0) > 0.01 && !String(a.bill_reference || '').trim());
        if (missingRef.length > 0) {
          toast({ title: 'Validation Error', description: `Bill reference required for ${missingRef.length} allocation(s).`, variant: 'destructive' });
          return;
        }
        // Missing dates
        const missingDates = formData.bill_allocations.filter(a => String(a.bill_reference || '').trim() && !a.bill_date);
        if (missingDates.length > 0) {
          toast({ title: 'Validation Error', description: `All bill allocations must have a bill date.`, variant: 'destructive' });
          return;
        }
        const totalAllocated = formData.bill_allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
        if (isNearZero(effectiveOpeningSigned)) {
          effectiveOpeningSigned = totalAllocated;
          effectiveBalanceType = effectiveOpeningSigned < 0 ? 'debit' : 'credit';
        } else if (Math.abs(totalAllocated - effectiveOpeningSigned) > 0.01) {
          toast({ title: 'Validation Error', description: `Allocations (${formatSignedAmountWithDrCr(totalAllocated)}) must match opening balance (${formatSignedAmountWithDrCr(effectiveOpeningSigned)}).`, variant: 'destructive' });
          return;
        }
      }
    }

    setLoading(true);
    try {
      const payload = {
        name: formData.name.trim(),
        ledger_group_id: formData.ledger_group_id,
        alias: formData.alias,
        phone: formData.phone,
        email: formData.email,
        gstin: formData.gstin,
        pan: formData.pan,
        address: formData.address,
        tax_type: formData.tax_type,
        opening_balance: Math.abs(Number(effectiveOpeningSigned) || 0),
        balance_type: effectiveBalanceType,
        is_billwise: formData.is_billwise && !isBillwiseDisabledGroup,
        company_id: selectedCompany.id,
      };

      const resp = await fetch(`${API_HOST_URL}/api/ledgers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await resp.json();
      if (!json.success) throw new Error(json.message || 'Failed to create ledger');
      const newLedgerId: string = json.data.id;

      // Save bill allocations if billwise
      if (formData.is_billwise && !isBillwiseDisabledGroup && formData.bill_allocations.length > 0) {
        const allocationsToSave = formData.bill_allocations.map(a => ({
          bill_reference: a.bill_reference,
          amount: a.amount,
          bill_type: 'Opening',
          bill_date: a.bill_date || '',
        }));
        await fetch(`${API_HOST_URL}/api/ledgers/${newLedgerId}/bill-allocations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId: selectedCompany.id, allocations: allocationsToSave }),
        });
      }

      const groupName = groups.find(g => g.id === formData.ledger_group_id)?.name || '';
      toast({ title: 'Success', description: `Ledger "${formData.name}" created successfully!` });
      onCreated({ id: newLedgerId, name: formData.name.trim(), group_name: groupName, tax_type: formData.tax_type || '' });
      handleClose();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to create ledger', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const getTaxTypes = () => {
    if (companyTaxType === 'GST') return ['IGST', 'CGST', 'SGST'];
    if (companyTaxType === 'VAT') return ['VAT', 'CESS'];
    return [companyTaxType];
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-4xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Create New Ledger</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Ledger Group *</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <SearchableDropdown
                    value={formData.ledger_group_id}
                    onValueChange={(v) => setFormData({ ...formData, ledger_group_id: v })}
                    placeholder="Select Group"
                        options={groups.map(g => ({ value: g.id, label: g.name }))}
                  />
                </div>
                <Button type="button" variant="outline" size="icon" onClick={() => setGroupDialogOpen(true)} title="Create new group">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>Ledger Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter ledger name"
                required
                autoFocus
              />
            </div>
            <div>
              <Label>Alias</Label>
              <Input
                value={formData.alias}
                onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                placeholder="Enter alias"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="Enter phone number"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Enter email"
              />
            </div>
            {isTaxEnabled && (
              <div>
                <Label>GSTIN</Label>
                <Input
                  value={formData.gstin}
                  onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                  placeholder="Enter GSTIN"
                />
              </div>
            )}
            {isTaxEnabled && (
              <div>
                <Label>PAN</Label>
                <Input
                  value={formData.pan}
                  onChange={(e) => setFormData({ ...formData, pan: e.target.value })}
                  placeholder="Enter PAN"
                />
              </div>
            )}
            {isTaxEnabled && selectedGroup?.name === 'Duties & Taxes' && (
              <div>
                <Label>Tax Type</Label>
                <SearchableDropdown
                  value={formData.tax_type}
                  onValueChange={(v) => setFormData({ ...formData, tax_type: v })}
                  placeholder="Select Tax Type"
                  options={getTaxTypes().map(t => ({ value: t, label: t }))}
                />
              </div>
            )}
          </div>

          <div>
            <Label>Address</Label>
            <Textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Enter address"
              rows={3}
            />
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <input
              type="checkbox"
              id="qc_is_billwise"
              checked={formData.is_billwise}
              disabled={isBillwiseDisabledGroup}
              onChange={(e) => setFormData({ ...formData, is_billwise: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300"
            />
            <Label htmlFor="qc_is_billwise" className="cursor-pointer">Enable Bill-Wise Opening Balance</Label>
          </div>
          <p className="text-xs text-gray-500">
            {isBillwiseDisabledGroup
              ? 'Bill-wise opening is disabled for Bank Accounts, Cash-in-Hand, Fixed Assets and Bank OD A/c.'
              : 'When enabled, opening balance is tracked bill-by-bill.'}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Opening Balance</Label>
              <Input
                type="number"
                value={formData.opening_balance}
                onChange={(e) => setFormData({ ...formData, opening_balance: parseFloat(e.target.value) || 0 })}
                step="0.01"
              />
            </div>
            <div>
              <Label>Balance (DR/CR)</Label>
              <SearchableDropdown
                value={formData.balance_type}
                onValueChange={(v) => setFormData({ ...formData, balance_type: v })}
                placeholder="Select balance type"
                options={[{ value: 'debit', label: 'DR' }, { value: 'credit', label: 'CR' }]}
              />
            </div>
          </div>

          {/* Bill-Wise Allocations */}
          {formData.is_billwise && (
            <div className="space-y-4 mt-4 p-4 border rounded-lg bg-blue-50">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-lg">Bill-Wise Allocations</h3>
                <Button type="button" size="sm" onClick={addBillAllocation}>
                  <Plus className="w-4 h-4 mr-2" />Add Bill
                </Button>
              </div>
              {formData.bill_allocations.length === 0 ? (
                <p className="text-sm text-gray-600">No bill allocations added. Click "Add Bill" to add one.</p>
              ) : (
                <div className="space-y-3">
                  {formData.bill_allocations.map((alloc, index) => {
                    const isInvalidDate = alloc.bill_date && selectedCompany?.books_beginning &&
                      new Date(alloc.bill_date) >= new Date(selectedCompany.books_beginning);
                    const hasAmount = Math.abs(Number(alloc.amount) || 0) > 0.01;
                    const hasReference = String(alloc.bill_reference || '').trim().length > 0;
                    const normRef = normalizeBillReference(alloc.bill_reference);
                    const dupCount = normRef ? formData.bill_allocations.filter(r => normalizeBillReference(r.bill_reference) === normRef).length : 0;
                    return (
                      <div key={index} className="flex gap-3 items-end p-3 bg-white border rounded-lg flex-wrap">
                        <div className="flex-1 min-w-32">
                          <Label className="text-sm">Bill Reference {hasAmount && <span className="text-red-500">*</span>}</Label>
                          <Input
                            value={alloc.bill_reference}
                            onChange={(e) => updateBillAllocation(index, 'bill_reference', e.target.value)}
                            placeholder="e.g., INV-001"
                            className={`mt-1 ${hasAmount && !hasReference ? 'border-orange-400' : ''} ${dupCount > 1 ? 'border-red-500' : ''}`}
                          />
                          {dupCount > 1 && <p className="text-xs text-red-500 mt-1">Must be unique</p>}
                        </div>
                        <div className="w-28">
                          <Label className="text-sm">Bill Type</Label>
                          <Input value={deriveBillType()} readOnly className="mt-1 bg-muted" />
                        </div>
                        <div className="w-36">
                          <Label className="text-sm">Bill Date <span className="text-red-500">*</span></Label>
                          <Input
                            type="date"
                            value={alloc.bill_date || ''}
                            onChange={(e) => updateBillAllocation(index, 'bill_date', e.target.value)}
                            max={selectedCompany?.books_beginning}
                            className={`mt-1 ${isInvalidDate ? 'border-red-500' : ''}`}
                          />
                        </div>
                        <div className="w-28">
                          <Label className="text-sm">Amount</Label>
                          <Input
                            type="number"
                            value={Math.abs(Number(alloc.amount) || 0) || ''}
                            onChange={(e) => {
                              const abs = Math.abs(parseFloat(e.target.value) || 0);
                              const type = (Number(alloc.amount) || 0) < 0 ? 'debit' : 'credit';
                              updateBillAllocation(index, 'amount', type === 'debit' ? -abs : abs);
                            }}
                            placeholder="0.00"
                            step="0.01"
                            className="mt-1"
                          />
                        </div>
                        <div className="w-24">
                          <Label className="text-sm">Type</Label>
                          <SearchableDropdown
                            value={(Number(alloc.amount) || 0) < 0 ? 'debit' : 'credit'}
                            onValueChange={(v) => {
                              const abs = Math.abs(Number(alloc.amount) || 0);
                              updateBillAllocation(index, 'amount', v === 'debit' ? -abs : abs);
                            }}
                            placeholder="DR/CR"
                            className="mt-1"
                            options={[{ value: 'debit', label: 'DR' }, { value: 'credit', label: 'CR' }]}
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
              {formData.bill_allocations.length > 0 && (() => {
                const bt = formData.balance_type === 'credit' ? 'credit' : 'debit';
                const opening = toSignedAmount(formData.opening_balance, bt);
                const total = formData.bill_allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
                const effective = isNearZero(opening) ? total : opening;
                const diff = effective - total;
                const matched = Math.abs(diff) <= 0.01;
                return (
                  <div className="pt-3 border-t mt-3">
                    <div className="flex justify-between"><span className="font-medium">Total:</span><span>{formatSignedAmountWithDrCr(total)}</span></div>
                    <div className="flex justify-between text-sm text-gray-600 mt-1"><span>Opening:</span><span>{formatSignedAmountWithDrCr(effective)}</span></div>
                    <div className={`mt-2 text-sm font-medium ${matched ? 'text-green-600' : 'text-red-600'}`}>
                      {matched ? '✓ Matched' : `✗ Difference: ₹${diff.toFixed(2)}`}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Ledger'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>

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
                  const parentGrp = groups.find(g => g.id === v);
                  const inheritedNature = parentGrp?.nature || '';
                  setQuickGroup(prev => ({ ...prev, parent_id: v, nature: inheritedNature }));
                }}
                placeholder="None (top-level)"
                options={groups.map(g => ({ value: g.id, label: g.name }))}
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
                  const parentGrp = groups.find(g => g.id === quickGroup.parent_id);
                  const grandparent = parentGrp?.parent_id ? groups.find(g => g.id === parentGrp.parent_id) : null;
                  return grandparent
                    ? <><span>{grandparent.name}</span><span className="ml-2 text-xs">✓ (Auto)</span></>
                    : <span className="italic">-- No Grandparent --</span>;
                })()}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setGroupDialogOpen(false); setQuickGroup({ name: '', nature: '', parent_id: '' }); }}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateQuickGroup} disabled={groupSubmitting || !quickGroup.name.trim()}>
              {groupSubmitting ? 'Creating...' : 'Create Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default QuickCreateLedgerDialog;