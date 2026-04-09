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
import { Plus, Trash2, Upload, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { API_BASE_URL } from '@/config/runtime';
import { getCompanyTaxType, isCompanyTaxEnabled, isCompanyBatchesEnabled, isCompanyPOSEnabled } from '@/lib/companyTax';

const API_HOST_URL = API_BASE_URL.replace(/\/api$/, '');

const normalizeBatchNumber = (value: unknown): string =>
  String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();

interface UOM {
  id: string;
  name: string;
  symbol: string;
}

interface QuickCreateItemDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (item: { id: string; name: string; enable_batches: boolean; tax_rate: number; igst_rate: number; cgst_rate: number; sgst_rate: number; sales_rate: number; purchase_rate: number }) => void;
}

const QuickCreateItemDialog = ({
  open,
  onClose,
  onCreated,
}: QuickCreateItemDialogProps) => {
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const isTaxEnabled = isCompanyTaxEnabled(selectedCompany);
  const companyTaxType = getCompanyTaxType(selectedCompany);
  const companyBatchesEnabled = isCompanyBatchesEnabled(selectedCompany);
  const companyPOSEnabled = isCompanyPOSEnabled(selectedCompany);
  const [loading, setLoading] = useState(false);
  const [uoms, setUoms] = useState<UOM[]>([]);
  const [stockGroups, setStockGroups] = useState<any[]>([]);
  const [stockCategories, setStockCategories] = useState<any[]>([]);
  const [uomDialogOpen, setUomDialogOpen] = useState(false);
  const [uomSubmitting, setUomSubmitting] = useState(false);
  const [quickUom, setQuickUom] = useState({ name: '', symbol: '', decimal_places: 2 });
  const [stockGroupDialogOpen, setStockGroupDialogOpen] = useState(false);
  const [stockGroupSubmitting, setStockGroupSubmitting] = useState(false);
  const [quickStockGroup, setQuickStockGroup] = useState({ name: '', alias: '', parent_group_id: '' });
  const [stockCatDialogOpen, setStockCatDialogOpen] = useState(false);
  const [stockCatSubmitting, setStockCatSubmitting] = useState(false);
  const [quickStockCat, setQuickStockCat] = useState({ name: '', alias: '' });

  // Standard Rates dialog
  const [standardRatesDialogOpen, setStandardRatesDialogOpen] = useState(false);
  const [standardRateEntry, setStandardRateEntry] = useState({ date: new Date().toISOString().split('T')[0], cost: 0, rate: 0 });

  const [formData, setFormData] = useState({
    name: '',
    uom_id: '',
    stock_group_id: '',
    stock_category_id: '',
    alias: '',
    hsn_code: '',
    opening_stock: 0,
    opening_rate: 0,
    opening_value: 0,
    standard_rates: [] as any[],
    tax_rate: 0,
    igst_rate: 0,
    cgst_rate: 0,
    sgst_rate: 0,
    tax_effective_date: new Date().toISOString().split('T')[0],
    opening_balance_mode: 'without_batch',
    batch_details: [] as any[],
    tax_history: [] as any[],
    image: '',
  });

  useEffect(() => {
    if (open && selectedCompany) fetchAll();
  }, [open, selectedCompany]);

  useEffect(() => {
    const value = formData.opening_stock * formData.opening_rate;
    setFormData(prev => ({ ...prev, opening_value: value }));
  }, [formData.opening_stock, formData.opening_rate]);

  const fetchAll = async () => {
    if (!selectedCompany) return;
    try {
      const [uomsRes, groupsRes, catsRes] = await Promise.all([
        fetch(`${API_HOST_URL}/api/uom?companyId=${selectedCompany.id}`).then(r => r.json()),
        fetch(`${API_HOST_URL}/api/stock-groups?companyId=${selectedCompany.id}`).then(r => r.json()),
        fetch(`${API_HOST_URL}/api/stock-categories?companyId=${selectedCompany.id}`).then(r => r.json()),
      ]);
      if (uomsRes.success) setUoms(uomsRes.data || []);
      if (groupsRes.success) setStockGroups(groupsRes.data || []);
      if (catsRes.success) setStockCategories(catsRes.data || []);
    } catch (err) {
      console.error('Error fetching item master data:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '', uom_id: '', stock_group_id: '', stock_category_id: '',
      alias: '', hsn_code: '',
      opening_stock: 0, opening_rate: 0, opening_value: 0,
      standard_rates: [],
      tax_rate: 0, igst_rate: 0, cgst_rate: 0, sgst_rate: 0,
      tax_effective_date: new Date().toISOString().split('T')[0],
      opening_balance_mode: 'without_batch',
      batch_details: [], tax_history: [],
      image: '',
    });
  };

  const handleClose = () => {
    resetForm();
    setUomDialogOpen(false); setQuickUom({ name: '', symbol: '', decimal_places: 2 });
    setStockGroupDialogOpen(false); setQuickStockGroup({ name: '', alias: '', parent_group_id: '' });
    setStockCatDialogOpen(false); setQuickStockCat({ name: '', alias: '' });
    onClose();
  };

  const handleCreateQuickUom = async () => {
    if (!quickUom.name.trim() || !selectedCompany) return;
    setUomSubmitting(true);
    try {
      const resp = await fetch(`${API_HOST_URL}/api/uom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: quickUom.name.trim(),
          symbol: quickUom.symbol.trim() || quickUom.name.trim(),
          decimal_places: quickUom.decimal_places,
          company_id: selectedCompany.id,
        }),
      });
      const json = await resp.json();
      if (!json.success) throw new Error(json.message || 'Failed to create UOM');
      toast({ title: 'Success', description: `UOM "${quickUom.name.trim()}" created!` });
      await fetchAll();
      setFormData(prev => ({ ...prev, uom_id: json.data.id }));
      setUomDialogOpen(false);
      setQuickUom({ name: '', symbol: '', decimal_places: 2 });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to create UOM', variant: 'destructive' });
    } finally {
      setUomSubmitting(false);
    }
  };

  const handleCreateQuickStockGroup = async () => {
    if (!quickStockGroup.name.trim() || !selectedCompany) return;
    setStockGroupSubmitting(true);
    try {
      const resp = await fetch(`${API_HOST_URL}/api/stock-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: quickStockGroup.name.trim(),
          alias: quickStockGroup.alias.trim() || null,
          parent_group_id: quickStockGroup.parent_group_id || null,
          company_id: selectedCompany.id,
        }),
      });
      const json = await resp.json();
      if (!json.success) throw new Error(json.message || 'Failed to create stock group');
      toast({ title: 'Success', description: `Stock Group "${quickStockGroup.name.trim()}" created!` });
      await fetchAll();
      setFormData(prev => ({ ...prev, stock_group_id: json.data.id }));
      setStockGroupDialogOpen(false);
      setQuickStockGroup({ name: '', alias: '', parent_group_id: '' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to create stock group', variant: 'destructive' });
    } finally {
      setStockGroupSubmitting(false);
    }
  };

  const handleCreateQuickStockCat = async () => {
    if (!quickStockCat.name.trim() || !selectedCompany) return;
    setStockCatSubmitting(true);
    try {
      const resp = await fetch(`${API_HOST_URL}/api/stock-categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: quickStockCat.name.trim(),
          alias: quickStockCat.alias.trim() || null,
          company_id: selectedCompany.id,
        }),
      });
      const json = await resp.json();
      if (!json.success) throw new Error(json.message || 'Failed to create stock category');
      toast({ title: 'Success', description: `Stock Category "${quickStockCat.name.trim()}" created!` });
      await fetchAll();
      setFormData(prev => ({ ...prev, stock_category_id: json.data.id }));
      setStockCatDialogOpen(false);
      setQuickStockCat({ name: '', alias: '' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to create stock category', variant: 'destructive' });
    } finally {
      setStockCatSubmitting(false);
    }
  };

  // Batch helpers
  const addBatchRow = () => {
    const newBatch = { id: Math.random().toString(), batch_number: '', opening_qty: 0, opening_rate: 0, opening_value: 0 };
    const updated = [...formData.batch_details, newBatch];
    const totalQty = updated.reduce((s, b) => s + (b.opening_qty || 0), 0);
    const totalVal = updated.reduce((s, b) => s + (b.opening_value || 0), 0);
    setFormData(prev => ({ ...prev, batch_details: updated, opening_stock: totalQty, opening_value: totalVal, opening_rate: totalQty > 0 ? totalVal / totalQty : 0 }));
  };

  const removeBatchRow = (batchId: string) => {
    const updated = formData.batch_details.filter(b => b.id !== batchId);
    const totalQty = updated.reduce((s, b) => s + (b.opening_qty || 0), 0);
    const totalVal = updated.reduce((s, b) => s + (b.opening_value || 0), 0);
    setFormData(prev => ({ ...prev, batch_details: updated, opening_stock: totalQty, opening_value: totalVal, opening_rate: totalQty > 0 ? totalVal / totalQty : 0 }));
  };

  const updateBatchRow = (batchId: string, field: string, value: any) => {
    const updated = formData.batch_details.map(b =>
      b.id === batchId ? {
        ...b, [field]: value,
        opening_value: (field === 'opening_qty' || field === 'opening_rate')
          ? (field === 'opening_qty' ? value : b.opening_qty) * (field === 'opening_rate' ? value : b.opening_rate)
          : b.opening_value
      } : b
    );
    const totalQty = updated.reduce((s, b) => s + (b.opening_qty || 0), 0);
    const totalVal = updated.reduce((s, b) => s + (b.opening_value || 0), 0);
    setFormData(prev => ({ ...prev, batch_details: updated, opening_stock: totalQty, opening_value: totalVal, opening_rate: totalQty > 0 ? totalVal / totalQty : 0 }));
  };

  const buildMergedTaxHistory = () => {
    const entry = {
      date: formData.tax_effective_date,
      tax_rate: formData.tax_rate, igst_rate: formData.igst_rate,
      cgst_rate: formData.cgst_rate, sgst_rate: formData.sgst_rate,
    };
    const base = [...(formData.tax_history || [])];
    const idx = base.findIndex(h => h.date === entry.date);
    if (idx >= 0) base[idx] = entry; else base.push(entry);
    return base.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const addTaxToHistory = () => {
    const updated = buildMergedTaxHistory();
    setFormData(prev => ({ ...prev, tax_history: updated }));
    toast({ title: 'Success', description: `Tax rate for ${formData.tax_effective_date} added to history` });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    if (!formData.uom_id) {
      toast({ title: 'Validation', description: 'Please select a Unit of Measure.', variant: 'destructive' });
      return;
    }

    // Batch duplicate check
    if (formData.opening_balance_mode === 'with_batch') {
      const batchCounts = new Map<string, number>();
      for (const b of formData.batch_details) {
        const n = normalizeBatchNumber(b.batch_number);
        if (!n) continue;
        batchCounts.set(n, (batchCounts.get(n) || 0) + 1);
      }
      if (Array.from(batchCounts.values()).some(c => c > 1)) {
        toast({ title: 'Validation Error', description: 'Batch number must be unique.', variant: 'destructive' });
        return;
      }
    }

    setLoading(true);
    try {
      const batchDetailsToSave = formData.opening_balance_mode === 'without_batch'
        ? [{ batch_number: 'primary', opening_qty: formData.opening_stock, opening_rate: formData.opening_rate, opening_value: formData.opening_value }]
        : formData.batch_details;

      const mergedTaxHistory = buildMergedTaxHistory();

      const payload: any = {
        name: formData.name.trim(),
        alias: formData.alias,
        uom_id: formData.uom_id,
        stock_group_id: formData.stock_group_id,
        stock_category_id: formData.stock_category_id,
        image: formData.image || '',
        standard_rates: formData.standard_rates || [],
        hsn_code: formData.hsn_code,
        opening_stock: formData.opening_stock,
        opening_rate: formData.opening_rate,
        opening_value: formData.opening_value,
        purchase_rate: formData.purchase_rate,
        sales_rate: formData.sales_rate,
        enable_batches: formData.opening_balance_mode === 'with_batch',
        company_id: selectedCompany.id,
        batch_details: batchDetailsToSave,
      };

      if (isTaxEnabled) {
        if (companyTaxType === 'GST') {
          payload.igst_rate = formData.igst_rate;
          payload.cgst_rate = formData.cgst_rate;
          payload.sgst_rate = formData.sgst_rate;
        } else {
          payload.tax_rate = formData.tax_rate;
        }
        payload.tax_history = mergedTaxHistory;
      }

      const resp = await fetch(`${API_HOST_URL}/api/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await resp.json();
      if (!json.success) throw new Error(json.message || 'Failed to create item');
      toast({ title: 'Success', description: `Item "${formData.name}" created successfully!` });
      onCreated({
        id: json.data.id,
        name: formData.name.trim(),
        enable_batches: formData.opening_balance_mode === 'with_batch',
        tax_rate: Number(formData.tax_rate) || 0,
        igst_rate: Number(formData.igst_rate) || 0,
        cgst_rate: Number(formData.cgst_rate) || 0,
        sgst_rate: Number(formData.sgst_rate) || 0,
        standard_rates: formData.standard_rates || [],
        sales_rate: (() => { const sr = [...(formData.standard_rates || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); return sr[0] ? Number(sr[0].rate) : 0; })(),
        purchase_rate: (() => { const sr = [...(formData.standard_rates || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); return sr[0] ? Number(sr[0].cost) : 0; })(),
      });
      handleClose();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to create item', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-4xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Create New Item</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Unit of Measure *</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <SearchableDropdown
                    value={formData.uom_id}
                    onValueChange={(v) => setFormData({ ...formData, uom_id: v })}
                    placeholder="Select UOM"
                    options={uoms.map(u => ({ value: u.id, label: `${u.name} (${u.symbol})` }))}
                  />
                </div>
                <Button type="button" variant="outline" size="icon" onClick={() => setUomDialogOpen(true)} title="Create new UOM">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>Item Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter item name"
                required
                autoFocus
              />
            </div>
            <div>
              <Label>Stock Group</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <SearchableDropdown
                    value={formData.stock_group_id}
                    onValueChange={(v) => setFormData({ ...formData, stock_group_id: v })}
                    placeholder="Select Stock Group"
                    options={stockGroups.map(g => ({ value: g.id, label: g.name }))}
                  />
                </div>
                <Button type="button" variant="outline" size="icon" onClick={() => setStockGroupDialogOpen(true)} title="Create new stock group">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>Stock Category</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <SearchableDropdown
                    value={formData.stock_category_id}
                    onValueChange={(v) => setFormData({ ...formData, stock_category_id: v })}
                    placeholder="Select Stock Category"
                    options={stockCategories.map(c => ({ value: c.id, label: c.name }))}
                  />
                </div>
                <Button type="button" variant="outline" size="icon" onClick={() => setStockCatDialogOpen(true)} title="Create new stock category">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>Alias</Label>
              <Input
                value={formData.alias}
                onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                placeholder="Enter alias"
              />
            </div>
            {companyPOSEnabled && (
              <div className="md:col-span-2">
                <Label>Item Image <span className="text-muted-foreground text-xs">(for POS display)</span></Label>
                <div className="flex items-start gap-4 mt-1">
                  {formData.image ? (
                    <div className="relative">
                      <img src={formData.image} alt="item" className="h-20 w-20 object-cover rounded border" />
                      <button
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, image: '' }))}
                        className="absolute -top-2 -right-2 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-20 w-20 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground">
                      <Upload className="h-6 w-6" />
                    </div>
                  )}
                  <div className="flex-1">
                    <Input
                      type="file"
                      accept="image/*"
                      className="cursor-pointer"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => setFormData(p => ({ ...p, image: ev.target?.result as string }));
                        reader.readAsDataURL(file);
                      }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Upload JPG, PNG or GIF. Shown as thumbnail in POS screen.</p>
                  </div>
                </div>
              </div>
            )}
            {isTaxEnabled && (
              <div>
                <Label>HSN Code</Label>
                <Input
                  value={formData.hsn_code}
                  onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                  placeholder="Enter HSN code"
                />
              </div>
            )}
            {isTaxEnabled && (
              companyTaxType === 'GST' ? (
                <div className="md:col-span-2">
                  <Label className="font-medium mb-2 block">GST Rates (%)</Label>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-sm">IGST (Integrated) *</Label>
                      <Input
                        type="number"
                        value={formData.igst_rate}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          setFormData({ ...formData, igst_rate: v, cgst_rate: v / 2, sgst_rate: v / 2 });
                        }}
                        step="0.01" min="0" placeholder="e.g., 18"
                      />
                      <p className="text-xs text-muted-foreground mt-1">CGST & SGST auto-calculated</p>
                    </div>
                    <div>
                      <Label className="text-sm">CGST (Central)</Label>
                      <Input type="number" value={formData.cgst_rate} readOnly className="bg-muted" step="0.01" />
                    </div>
                    <div>
                      <Label className="text-sm">SGST (State)</Label>
                      <Input type="number" value={formData.sgst_rate} readOnly className="bg-muted" step="0.01" />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <Label>Tax Rate (%) - {companyTaxType || 'VAT'}</Label>
                  <Input
                    type="number"
                    value={formData.tax_rate}
                    onChange={(e) => setFormData({ ...formData, tax_rate: parseFloat(e.target.value) || 0 })}
                    step="0.01" min="0" placeholder="e.g., 15"
                  />
                </div>
              )
            )}
            {isTaxEnabled && (
              <div className="md:col-span-2 border-t pt-4">
                <Label className="font-medium mb-2 block">Tax Effective Date</Label>
                <div className="flex gap-2 items-end">
                  <Input
                    type="date"
                    value={formData.tax_effective_date}
                    onChange={(e) => setFormData({ ...formData, tax_effective_date: e.target.value })}
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" onClick={addTaxToHistory} className="whitespace-nowrap">
                    Add to History
                  </Button>
                </div>
                {formData.tax_history.length > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {formData.tax_history.length} tax rate(s) in history (most recent applies)
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Standard Rates */}
          <div className="flex items-center gap-3 border-t pt-4 mt-2">
            <Label className="font-medium shrink-0">Standard Rates</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setStandardRateEntry({ date: new Date().toISOString().split('T')[0], cost: 0, rate: 0 });
                setStandardRatesDialogOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Standard Rate
            </Button>
            {formData.standard_rates && formData.standard_rates.length > 0 && (() => {
              const sorted = [...(formData.standard_rates || [])].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
              const latest = sorted[0];
              return (
                <span className="text-xs text-muted-foreground">
                  {formData.standard_rates.length} rate{formData.standard_rates.length > 1 ? 's' : ''} defined — latest: ₹{Number(latest?.rate || 0).toFixed(2)}
                </span>
              );
            })()}
          </div>

          {/* Opening Balance Section */}
          <div className="border-t pt-4">
            <Label className="font-medium mb-3 block">Opening Balance</Label>
            {companyBatchesEnabled && (
              <div className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  id="qc_with_batch"
                  checked={formData.opening_balance_mode === 'with_batch'}
                  onChange={(e) => setFormData({ ...formData, opening_balance_mode: e.target.checked ? 'with_batch' : 'without_batch', batch_details: [] })}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <Label htmlFor="qc_with_batch" className="cursor-pointer">With Batch</Label>
              </div>
            )}

            {formData.opening_balance_mode === 'without_batch' && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Opening Stock</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={formData.opening_stock}
                    onChange={(e) => setFormData({ ...formData, opening_stock: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Opening Rate</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={formData.opening_rate}
                    onChange={(e) => setFormData({ ...formData, opening_rate: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Opening Value</Label>
                  <Input type="number" value={formData.opening_value} readOnly className="bg-muted" />
                </div>
              </div>
            )}

            {formData.opening_balance_mode === 'with_batch' && (
              <div className="border rounded-lg p-4 bg-muted/50">
                <div className="flex justify-between items-center mb-4">
                  <Label className="font-medium">Batch-wise Opening Details</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addBatchRow}>
                    <Plus className="h-4 w-4 mr-1" />Add Batch
                  </Button>
                </div>
                {formData.batch_details.length > 0 ? (
                  <div className="space-y-3">
                    {formData.batch_details.map((batch: any) => {
                      const normNum = normalizeBatchNumber(batch.batch_number);
                      const dupCount = normNum ? formData.batch_details.filter(b => normalizeBatchNumber(b.batch_number) === normNum).length : 0;
                      return (
                        <div key={batch.id} className="grid grid-cols-5 gap-2 items-end bg-white p-3 rounded border">
                          <div>
                            <Label className="text-xs">Batch Number</Label>
                            <Input
                              value={batch.batch_number}
                              onChange={(e) => updateBatchRow(batch.id, 'batch_number', e.target.value)}
                              placeholder="Batch #"
                              className={dupCount > 1 ? 'border-red-500' : ''}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Opening Qty</Label>
                            <Input type="number" value={batch.opening_qty}
                              onChange={(e) => updateBatchRow(batch.id, 'opening_qty', parseFloat(e.target.value) || 0)}
                              step="0.01" min="0"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Opening Rate</Label>
                            <Input type="number" value={batch.opening_rate}
                              onChange={(e) => updateBatchRow(batch.id, 'opening_rate', parseFloat(e.target.value) || 0)}
                              step="0.01" min="0"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Opening Value</Label>
                            <Input type="number" value={batch.opening_value} readOnly className="bg-muted" />
                          </div>
                          <Button type="button" variant="destructive" size="sm" onClick={() => removeBatchRow(batch.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Click "Add Batch" to add batch-wise opening balance.</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Item'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>

      {/* Quick Create UOM Dialog */}
      <Dialog open={uomDialogOpen} onOpenChange={(o) => { if (!o) { setUomDialogOpen(false); setQuickUom({ name: '', symbol: '', decimal_places: 2 }); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New UOM</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>UOM Name *</Label>
              <Input
                value={quickUom.name}
                onChange={(e) => setQuickUom(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Kilogram"
                autoFocus
              />
            </div>
            <div>
              <Label>Symbol</Label>
              <Input
                value={quickUom.symbol}
                onChange={(e) => setQuickUom(prev => ({ ...prev, symbol: e.target.value }))}
                placeholder="e.g., kg"
              />
            </div>
            <div>
              <Label>Decimal Places</Label>
              <Input
                type="number"
                value={quickUom.decimal_places}
                onChange={(e) => setQuickUom(prev => ({ ...prev, decimal_places: parseInt(e.target.value) || 0 }))}
                min={0} max={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setUomDialogOpen(false); setQuickUom({ name: '', symbol: '', decimal_places: 2 }); }}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateQuickUom} disabled={uomSubmitting || !quickUom.name.trim()}>
              {uomSubmitting ? 'Creating...' : 'Create UOM'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Create Stock Group Dialog */}
      <Dialog open={stockGroupDialogOpen} onOpenChange={(o) => { if (!o) { setStockGroupDialogOpen(false); setQuickStockGroup({ name: '', alias: '', parent_group_id: '' }); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New Stock Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Stock Group Name *</Label>
              <Input
                value={quickStockGroup.name}
                onChange={(e) => setQuickStockGroup(p => ({ ...p, name: e.target.value }))}
                placeholder="Enter stock group name"
                autoFocus
              />
            </div>
            <div>
              <Label>Alias</Label>
              <Input
                value={quickStockGroup.alias}
                onChange={(e) => setQuickStockGroup(p => ({ ...p, alias: e.target.value }))}
                placeholder="Enter alias (optional)"
              />
            </div>
            <div>
              <Label>Parent Group</Label>
              <SearchableDropdown
                value={quickStockGroup.parent_group_id}
                onValueChange={(v) => setQuickStockGroup(p => ({ ...p, parent_group_id: v }))}
                placeholder="None (top-level)"
                options={stockGroups.map(g => ({ value: g.id, label: g.name }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setStockGroupDialogOpen(false); setQuickStockGroup({ name: '', alias: '', parent_group_id: '' }); }}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateQuickStockGroup} disabled={stockGroupSubmitting || !quickStockGroup.name.trim()}>
              {stockGroupSubmitting ? 'Creating...' : 'Create Stock Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Create Stock Category Dialog */}
      <Dialog open={stockCatDialogOpen} onOpenChange={(o) => { if (!o) { setStockCatDialogOpen(false); setQuickStockCat({ name: '', alias: '' }); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New Stock Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Stock Category Name *</Label>
              <Input
                value={quickStockCat.name}
                onChange={(e) => setQuickStockCat(p => ({ ...p, name: e.target.value }))}
                placeholder="Enter stock category name"
                autoFocus
              />
            </div>
            <div>
              <Label>Alias</Label>
              <Input
                value={quickStockCat.alias}
                onChange={(e) => setQuickStockCat(p => ({ ...p, alias: e.target.value }))}
                placeholder="Enter alias (optional)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setStockCatDialogOpen(false); setQuickStockCat({ name: '', alias: '' }); }}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateQuickStockCat} disabled={stockCatSubmitting || !quickStockCat.name.trim()}>
              {stockCatSubmitting ? 'Creating...' : 'Create Stock Category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Standard Rates Dialog */}
      <Dialog open={standardRatesDialogOpen} onOpenChange={(o) => { if (!o) setStandardRatesDialogOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Standard Rates</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Effective Date *</Label>
                <Input type="date" value={standardRateEntry.date} onChange={(e) => setStandardRateEntry(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div>
                <Label>Cost (Purchase Rate)</Label>
                <Input type="number" step="0.01" min="0" value={standardRateEntry.cost} onChange={(e) => setStandardRateEntry(p => ({ ...p, cost: parseFloat(e.target.value) || 0 }))} placeholder="0.00" />
              </div>
              <div>
                <Label>Rate (Sales Rate)</Label>
                <Input type="number" step="0.01" min="0" value={standardRateEntry.rate} onChange={(e) => setStandardRateEntry(p => ({ ...p, rate: parseFloat(e.target.value) || 0 }))} placeholder="0.00" />
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={!standardRateEntry.date}
              onClick={() => {
                const entry = { date: standardRateEntry.date, cost: standardRateEntry.cost, rate: standardRateEntry.rate };
                setFormData(p => {
                  const existing = (p.standard_rates || []).filter((r: any) => r.date !== entry.date);
                  return { ...p, standard_rates: [...existing, entry] };
                });
                setStandardRateEntry({ date: new Date().toISOString().split('T')[0], cost: 0, rate: 0 });
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Rate
            </Button>
            {formData.standard_rates && formData.standard_rates.length > 0 && (
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Effective Date</th>
                      <th className="text-right px-3 py-2 font-medium">Cost</th>
                      <th className="text-right px-3 py-2 font-medium">Rate</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(formData.standard_rates || [])].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((sr: any, idx: number) => (
                      <tr key={idx} className={idx === 0 ? 'bg-primary/5 font-semibold' : ''}>
                        <td className="px-3 py-1.5">
                          {sr.date}
                          {idx === 0 && <span className="ml-1.5 text-[10px] bg-primary text-primary-foreground rounded px-1">Current</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right">₹{Number(sr.cost || 0).toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right">₹{Number(sr.rate || 0).toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => setFormData(p => ({ ...p, standard_rates: (p.standard_rates || []).filter((_: any, i: number) => i !== (p.standard_rates || []).indexOf(sr)) }))}
                            className="text-destructive hover:text-destructive/80"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStandardRatesDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default QuickCreateItemDialog;