import { useState, useEffect } from 'react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Plus, Edit, Trash2, Upload, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { getCompanyTaxType, isCompanyTaxEnabled, isCompanyBatchesEnabled, isCompanyPOSEnabled } from '@/lib/companyTax';

const normalizeBatchNumber = (value: unknown): string =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

const ItemMaster = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo;
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const isTaxEnabled = isCompanyTaxEnabled(selectedCompany);
  const companyTaxType = getCompanyTaxType(selectedCompany);
  const companyBatchesEnabled = isCompanyBatchesEnabled(selectedCompany);
  const companyPOSEnabled = isCompanyPOSEnabled(selectedCompany);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [stockGroups, setStockGroups] = useState<any[]>([]);
  const [stockCategories, setStockCategories] = useState<any[]>([]);
  const [itemBalances, setItemBalances] = useState<Map<string, any>>(new Map());
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [showTaxHistory, setShowTaxHistory] = useState(false);
  const [selectedItemForHistory, setSelectedItemForHistory] = useState<any>(null);
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

  const handleCreateQuickUom = async () => {
    if (!quickUom.name.trim() || !selectedCompany) return;
    setUomSubmitting(true);
    try {
      const resp = await fetch('http://localhost:5000/api/uom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: quickUom.name.trim(), symbol: quickUom.symbol.trim() || quickUom.name.trim(), decimal_places: quickUom.decimal_places, company_id: selectedCompany.id }),
      });
      const json = await resp.json();
      if (!json.success) throw new Error(json.message || 'Failed to create UOM');
      toast({ title: 'Success', description: `UOM "${quickUom.name.trim()}" created!` });
      await fetchData();
      setFormData(prev => ({ ...prev, uom_id: json.data.id }));
      setUomDialogOpen(false);
      setQuickUom({ name: '', symbol: '', decimal_places: 2 });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to create UOM', variant: 'destructive' });
    } finally { setUomSubmitting(false); }
  };

  const handleCreateQuickStockGroup = async () => {
    if (!quickStockGroup.name.trim() || !selectedCompany) return;
    setStockGroupSubmitting(true);
    try {
      const resp = await fetch('http://localhost:5000/api/stock-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: quickStockGroup.name.trim(), alias: quickStockGroup.alias.trim() || null, parent_group_id: quickStockGroup.parent_group_id || null, company_id: selectedCompany.id }),
      });
      const json = await resp.json();
      if (!json.success) throw new Error(json.message || 'Failed to create stock group');
      toast({ title: 'Success', description: `Stock Group "${quickStockGroup.name.trim()}" created!` });
      await fetchData();
      setFormData(prev => ({ ...prev, stock_group_id: json.data.id }));
      setStockGroupDialogOpen(false);
      setQuickStockGroup({ name: '', alias: '', parent_group_id: '' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to create stock group', variant: 'destructive' });
    } finally { setStockGroupSubmitting(false); }
  };

  const handleCreateQuickStockCat = async () => {
    if (!quickStockCat.name.trim() || !selectedCompany) return;
    setStockCatSubmitting(true);
    try {
      const resp = await fetch('http://localhost:5000/api/stock-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: quickStockCat.name.trim(), alias: quickStockCat.alias.trim() || null, company_id: selectedCompany.id }),
      });
      const json = await resp.json();
      if (!json.success) throw new Error(json.message || 'Failed to create stock category');
      toast({ title: 'Success', description: `Stock Category "${quickStockCat.name.trim()}" created!` });
      await fetchData();
      setFormData(prev => ({ ...prev, stock_category_id: json.data.id }));
      setStockCatDialogOpen(false);
      setQuickStockCat({ name: '', alias: '' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to create stock category', variant: 'destructive' });
    } finally { setStockCatSubmitting(false); }
  };
  
  const [formData, setFormData] = useState({
    uom_id: '',
    stock_group_id: '',
    stock_category_id: '',
    name: '',
    alias: '',
    hsn_code: '',
    opening_stock: 0,
    opening_rate: 0,
    opening_value: 0,
    standard_rates: [] as any[],
    // Current tax fields - will be conditional based on tax_type
    tax_rate: 0, // VAT or combined tax
    igst_rate: 0, // GST - Integrated
    cgst_rate: 0, // GST - Central
    sgst_rate: 0, // GST - State
    tax_effective_date: new Date().toISOString().split('T')[0], // Date for tax entry
    enable_batches: false,
    batch_details: [],
    opening_balance_mode: 'without_batch', // 'without_batch' or 'with_batch'
    tax_history: [], // Array of {date, tax_rate, igst_rate, cgst_rate, sgst_rate}
    image: '',
  });

  useEffect(() => {
    fetchData();
    // Auto-show form if navigated from another page with autoShowForm flag
    if (location.state?.autoShowForm) {
      setShowForm(true);
    }
    // Keep form open if returning from UOM creation
    if (location.state?.keepFormOpen) {
      setShowForm(true);
    }
  }, [selectedCompany, location.state]);

  const fetchData = async () => {
    if (!selectedCompany) return;
    try {
      const [itemsRes, uomsRes, groupsRes, categoriesRes] = await Promise.all([
        fetch(`http://localhost:5000/api/items?companyId=${selectedCompany.id}`).then(r => r.json()),
        fetch(`http://localhost:5000/api/uom?companyId=${selectedCompany.id}`).then(r => r.json()),
        fetch(`http://localhost:5000/api/stock-groups?companyId=${selectedCompany.id}`).then(r => r.json()),
        fetch(`http://localhost:5000/api/stock-categories?companyId=${selectedCompany.id}`).then(r => r.json())
      ]);

      if (itemsRes && itemsRes.success) {
        const fetchedItems = itemsRes.data || [];
        setItems(fetchedItems);

        // Use stock movement values maintained in item_master by backend.
        calculateItemBalances(fetchedItems);
      }
      if (uomsRes && uomsRes.success) setUoms(uomsRes.data || []);
      if (groupsRes && groupsRes.success) setStockGroups(groupsRes.data || []);
      if (categoriesRes && categoriesRes.success) setStockCategories(categoriesRes.data || []);
    } catch (error) {
      console.error('Error fetching item masters:', error);
    }
  };

  const calculateItemBalances = (itemList: any[]) => {
    const balances = new Map<string, any>();

    itemList.forEach(item => {
      const openingBalance = Number(item.opening_stock ?? item.opening_qty ?? 0) || 0;
      const inward = Number(item.inward_qty ?? 0) || 0;
      const outward = Number(item.outward_qty ?? 0) || 0;
      const closingBalance =
        item.closing_qty !== undefined && item.closing_qty !== null
          ? Number(item.closing_qty) || 0
          : openingBalance + inward - outward;

      balances.set(item.id, {
        openingBalance,
        inward,
        outward,
        closingBalance
      });
    });
    
    setItemBalances(balances);
  };

  const resetForm = () => {
    setFormData({
      uom_id: '',
      stock_group_id: '',
      stock_category_id: '',
      name: '',
      alias: '',
      hsn_code: '',
      opening_stock: 0,
      opening_rate: 0,
      opening_value: 0,
      standard_rates: [],
      tax_rate: 0,
      igst_rate: 0,
      cgst_rate: 0,
      sgst_rate: 0,
      tax_effective_date: new Date().toISOString().split('T')[0],
      enable_batches: false,
      batch_details: [],
      opening_balance_mode: 'without_batch',
      tax_history: [],
      image: '',
    });
    setEditingItem(null);
    setShowForm(false);
  };

  const handleEdit = (item: any) => {
    // Determine mode based on batch_details
    const batchDetails = item.batch_details || [];
    const hasPrimaryBatch = batchDetails.length === 1 && batchDetails[0].batch_number === 'primary';
    const mode = hasPrimaryBatch ? 'without_batch' : (batchDetails.length > 0 ? 'with_batch' : 'without_batch');
    
    setFormData({
      uom_id: item.uom_id,
      stock_group_id: item.stock_group_id || '',
      stock_category_id: item.stock_category_id || '',
      name: item.name,
      alias: item.alias || '',
      hsn_code: item.hsn_code || '',
      opening_stock: item.opening_stock || 0,
      opening_rate: item.opening_rate || 0,
      opening_value: item.opening_value || 0,
      standard_rates: item.standard_rates || [],
      tax_rate: item.tax_rate || 0,
      igst_rate: item.igst_rate || 0,
      cgst_rate: item.cgst_rate || 0,
      sgst_rate: item.sgst_rate || 0,
      tax_effective_date: new Date().toISOString().split('T')[0],
      enable_batches: item.enable_batches || false,
      batch_details: item.batch_details || [],
      opening_balance_mode: mode,
      tax_history: item.tax_history || [],
      image: item.image || '',
    });
    setEditingItem(item);
    setShowForm(true);
  };

  const calculateOpeningValue = () => {
    const value = formData.opening_stock * formData.opening_rate;
    setFormData(prev => ({ ...prev, opening_value: value }));
  };

  const addTaxToHistory = () => {
    const taxEntry = {
      date: formData.tax_effective_date,
      tax_rate: formData.tax_rate,
      igst_rate: formData.igst_rate,
      cgst_rate: formData.cgst_rate,
      sgst_rate: formData.sgst_rate
    };
    
    // Check if entry for this date already exists
    const existingIndex = formData.tax_history.findIndex(h => h.date === formData.tax_effective_date);
    
    let updatedHistory;
    if (existingIndex >= 0) {
      // Replace existing entry for this date
      updatedHistory = [...formData.tax_history];
      updatedHistory[existingIndex] = taxEntry;
    } else {
      // Add new entry
      updatedHistory = [...formData.tax_history, taxEntry];
    }
    
    // Sort by date descending (most recent first)
    updatedHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    setFormData(prev => ({
      ...prev,
      tax_history: updatedHistory
    }));
    
    toast({
      title: "Success",
      description: `Tax rate for ${formData.tax_effective_date} added to history`
    });
  };

  const buildMergedTaxHistory = () => {
    const currentEntry = {
      date: formData.tax_effective_date,
      tax_rate: formData.tax_rate,
      igst_rate: formData.igst_rate,
      cgst_rate: formData.cgst_rate,
      sgst_rate: formData.sgst_rate,
    };

    const baseHistory = Array.isArray(formData.tax_history)
      ? [...formData.tax_history]
      : [];

    const idx = baseHistory.findIndex((h: any) => h.date === currentEntry.date);
    if (idx >= 0) {
      baseHistory[idx] = currentEntry;
    } else {
      baseHistory.push(currentEntry);
    }

    baseHistory.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return baseHistory;
  };

  const removeTaxFromHistory = (date: string) => {
    setFormData(prev => ({
      ...prev,
      tax_history: prev.tax_history.filter(h => h.date !== date)
    }));
    
    toast({
      title: "Success",
      description: `Tax rate for ${date} removed from history`
    });
  };

  const getCurrentTaxRate = () => {
    // Find the most recent tax rate (effective from that date or earlier)
    if (formData.tax_history.length === 0) {
      return {
        tax_rate: formData.tax_rate,
        igst_rate: formData.igst_rate,
        cgst_rate: formData.cgst_rate,
        sgst_rate: formData.sgst_rate
      };
    }
    
    const today = new Date().toISOString().split('T')[0];
    const validRates = formData.tax_history.filter(h => h.date <= today).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    if (validRates.length > 0) {
      return validRates[0];
    }
    
    return {
      tax_rate: formData.tax_rate,
      igst_rate: formData.igst_rate,
      cgst_rate: formData.cgst_rate,
      sgst_rate: formData.sgst_rate
    };
  };

  useEffect(() => {
    calculateOpeningValue();
  }, [formData.opening_stock, formData.opening_rate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    setLoading(true);

    try {
      // Client-side duplicate check for item name (case-insensitive)
      const dupCheck = items.find(i => i.name?.toLowerCase() === formData.name.trim().toLowerCase());

      if (dupCheck && (!editingItem || dupCheck.id !== editingItem.id)) {
        toast({
          title: "Duplicate name",
          description: "An item with this name already exists in this company.",
          variant: "destructive"
        });
        return;
      }
      
      // Prepare batch details based on mode
      let batchDetailsToSave = [];
      if (formData.opening_balance_mode === 'without_batch') {
        // Create a primary batch with the opening balance values
        batchDetailsToSave = [{
          batch_number: 'primary',
          opening_qty: formData.opening_stock,
          opening_rate: formData.opening_rate,
          opening_value: formData.opening_value
        }];
      } else if (formData.opening_balance_mode === 'with_batch') {
        // Use the batch details from form
        batchDetailsToSave = formData.batch_details;

        const batchCounts = new Map<string, number>();
        for (const batch of batchDetailsToSave) {
          const normalizedBatch = normalizeBatchNumber(batch?.batch_number);
          if (!normalizedBatch) continue;
          batchCounts.set(normalizedBatch, (batchCounts.get(normalizedBatch) || 0) + 1);
        }

        const duplicates = Array.from(batchCounts.entries()).filter(([, count]) => count > 1);
        if (duplicates.length > 0) {
          toast({
            title: 'Validation Error',
            description: 'Batch number must be unique for an item.',
            variant: 'destructive'
          });
          setLoading(false);
          return;
        }
      }
      
      let dataToSave: any = {
        uom_id: formData.uom_id,
        stock_group_id: formData.stock_group_id,
        stock_category_id: formData.stock_category_id,
        name: formData.name,
        alias: formData.alias,
        hsn_code: formData.hsn_code,
        opening_stock: formData.opening_stock,
        opening_rate: formData.opening_rate,
        opening_value: formData.opening_value,
        standard_rates: formData.standard_rates,
        enable_batches: formData.opening_balance_mode === 'with_batch',
        company_id: selectedCompany.id,
        batch_details: batchDetailsToSave,
        image: formData.image || '',
      };

      const mergedTaxHistory = buildMergedTaxHistory();
      
      // Add tax fields based on company tax type
      if (selectedCompany.tax_type === 'GST') {
        dataToSave.igst_rate = formData.igst_rate;
        dataToSave.cgst_rate = formData.cgst_rate;
        dataToSave.sgst_rate = formData.sgst_rate;
        dataToSave.tax_history = mergedTaxHistory;
      } else {
        // VAT or other tax types
        dataToSave.tax_rate = formData.tax_rate;
        dataToSave.tax_history = mergedTaxHistory;
      }

      if (editingItem) {
        const resp = await fetch(`http://localhost:5000/api/items/${editingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSave)
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'Update failed');
        
        // Update form with returned batch_details which now have proper IDs
        if (json.data && json.data.batch_details) {
          setFormData(prev => ({
            ...prev,
            batch_details: json.data.batch_details
          }));
        }
        
        toast({ title: "Success", description: "Item updated successfully!" });
      } else {
        const resp = await fetch(`http://localhost:5000/api/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSave)
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'Insert failed');
        
        // Update form with returned batch_details which now have proper IDs
        if (json.data && json.data.batch_details) {
          setFormData(prev => ({
            ...prev,
            batch_details: json.data.batch_details
          }));
        }
        
        toast({ title: "Success", description: "Item created successfully!" });
      }
      
      fetchData();
      resetForm();
      
      // Navigate back to return path if provided
      if (returnTo) {
        navigate(returnTo);
      }
    } catch (error: any) {
      const message = error?.code === '23505'
        ? 'An item with this name already exists in this company.'
        : 'Failed to save item';
      console.error('Error saving item:', error);
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const addBatchRow = () => {
    const newBatch = {
      id: Math.random().toString(),
      batch_number: '',
      opening_qty: 0,
      opening_rate: 0,
      opening_value: 0
    };
    const updatedBatches = [...(formData.batch_details || []), newBatch];

    // Calculate totals from batch details
    const totalQty = updatedBatches.reduce((sum, b) => sum + (b.opening_qty || 0), 0);
    const totalValue = updatedBatches.reduce((sum, b) => sum + (b.opening_value || 0), 0);
    const averageRate = totalQty > 0 ? totalValue / totalQty : 0;

    setFormData(prev => ({
      ...prev,
      batch_details: updatedBatches,
      opening_stock: totalQty,
      opening_value: totalValue,
      opening_rate: averageRate
    }));
  };

  const removeBatchRow = (batchId: string) => {
    const updatedBatches = (formData.batch_details || []).filter(b => b.id !== batchId);

    // Calculate totals from remaining batch details
    const totalQty = updatedBatches.reduce((sum, b) => sum + (b.opening_qty || 0), 0);
    const totalValue = updatedBatches.reduce((sum, b) => sum + (b.opening_value || 0), 0);
    const averageRate = totalQty > 0 ? totalValue / totalQty : 0;

    setFormData(prev => ({
      ...prev,
      batch_details: updatedBatches,
      opening_stock: totalQty,
      opening_value: totalValue,
      opening_rate: averageRate
    }));
  };

  const updateBatchRow = (batchId: string, field: string, value: any) => {
    const updatedBatches = (formData.batch_details || []).map(b =>
      b.id === batchId
        ? {
            ...b,
            [field]: value,
            opening_value: field === 'opening_qty' || field === 'opening_rate'
              ? (field === 'opening_qty' ? value : b.opening_qty) * (field === 'opening_rate' ? value : b.opening_rate)
              : b.opening_value
          }
        : b
    );

    // Calculate totals from batch details
    const totalQty = updatedBatches.reduce((sum, b) => sum + (b.opening_qty || 0), 0);
    const totalValue = updatedBatches.reduce((sum, b) => sum + (b.opening_value || 0), 0);
    const averageRate = totalQty > 0 ? totalValue / totalQty : 0;

    setFormData(prev => ({
      ...prev,
      batch_details: updatedBatches,
      opening_stock: totalQty,
      opening_value: totalValue,
      opening_rate: averageRate
    }));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      const resp = await fetch(`http://localhost:5000/api/items/${id}`, { method: 'DELETE' });
      let json: any = null;
      try {
        json = await resp.json();
      } catch {
        json = null;
      }

      if (!resp.ok || !json?.success) {
        throw new Error(json?.message || `Delete failed with status ${resp.status}`);
      }

      toast({ title: "Success", description: "Item deleted successfully!" });
      fetchData();
    } catch (error) {
      console.error('Error deleting item:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete item",
        variant: "destructive"
      });
    }
  };

  if (!selectedCompany) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mt-10">
            <h2 className="text-xl font-semibold text-muted-foreground">
              Please select a company to manage items
            </h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background h-screen flex flex-col overflow-hidden">
      <div className="flex-shrink-0 bg-background border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Button variant="ghost" onClick={() => { if (window.history.length > 1) { navigate(-1); } else { navigate('/dashboard'); } }} className="mr-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Item Master</h1>
              <p className="text-sm text-muted-foreground">{selectedCompany.name}</p>
            </div>
          </div>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">

        <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
          <DialogContent className="max-w-4xl overflow-y-auto max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Edit Item' : 'Add New Item'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  <div>
                    <Label>Unit of Measure</Label>
                    <div className="flex gap-2">
                      <SearchableDropdown
                        value={formData.uom_id}
                        onValueChange={(value) => setFormData({ ...formData, uom_id: value })}
                        placeholder="Select UOM"
                        options={uoms.map((uom) => ({
                          value: uom.id,
                          label: `${uom.name} (${uom.symbol})`,
                        }))}
                      />
                       <Button type="button" variant="outline" size="icon" onClick={() => setUomDialogOpen(true)} title="Create new UOM">
                         <Plus className="h-4 w-4" />
                       </Button>
                    </div>
                  </div>

                  <div>
                    <Label>Stock Group</Label>
                    <div className="flex gap-2">
                      <SearchableDropdown
                        value={formData.stock_group_id}
                        onValueChange={(value) => setFormData({ ...formData, stock_group_id: value })}
                        placeholder="Select Stock Group"
                        options={stockGroups.map((group) => ({ value: group.id, label: group.name }))}
                      />
                      <Button type="button" variant="outline" size="icon" onClick={() => setStockGroupDialogOpen(true)} title="Create new stock group">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label>Stock Category</Label>
                    <div className="flex gap-2">
                      <SearchableDropdown
                        value={formData.stock_category_id}
                        onValueChange={(value) => setFormData({ ...formData, stock_category_id: value })}
                        placeholder="Select Stock Category"
                        options={stockCategories.map((category) => ({ value: category.id, label: category.name }))}
                      />
                      <Button type="button" variant="outline" size="icon" onClick={() => setStockCatDialogOpen(true)} title="Create new stock category">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div>
                    <Label>Item Name</Label>
                    <Input 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="Enter item name"
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

                  {/* Item Image for POS */}
                  {companyPOSEnabled && <div className="md:col-span-2">
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
                  </div>}
                  
                  {/* HSN Code - Only show when tax is enabled */}
                  {isTaxEnabled && (
                    <div>
                      <Label>HSN Code</Label>
                      <Input 
                        value={formData.hsn_code}
                        onChange={(e) => setFormData({...formData, hsn_code: e.target.value})}
                        placeholder="Enter HSN code"
                      />
                    </div>
                  )}
                  
                  {/* Tax Fields - Conditional based on company tax type and tax enabled */}
                  {isTaxEnabled && (companyTaxType === 'GST' ? (
                    <div className="md:col-span-3">
                      <Label className="font-medium mb-2 block">GST Rates (%)</Label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label className="text-sm">IGST (Integrated) *</Label>
                          <Input 
                            type="number"
                            value={formData.igst_rate ?? 0}
                            onChange={(e) => {
                              const igstValue = parseFloat(e.target.value) || 0;
                              const halfRate = igstValue / 2;
                              setFormData({
                                ...formData, 
                                igst_rate: igstValue,
                                cgst_rate: halfRate,
                                sgst_rate: halfRate
                              });
                            }}
                            step="0.01"
                            min="0"
                            placeholder="e.g., 18"
                          />
                          <p className="text-xs text-muted-foreground mt-1">Enter IGST rate (CGST & SGST auto-calculated)</p>
                        </div>
                        <div>
                          <Label className="text-sm">CGST (Central)</Label>
                          <Input 
                            type="number"
                            value={formData.cgst_rate ?? 0}
                            readOnly
                            className="bg-muted cursor-not-allowed"
                            step="0.01"
                            min="0"
                            placeholder="Auto-calculated"
                          />
                          <p className="text-xs text-muted-foreground mt-1">= IGST ÷ 2</p>
                        </div>
                        <div>
                          <Label className="text-sm">SGST (State)</Label>
                          <Input 
                            type="number"
                            value={formData.sgst_rate ?? 0}
                            readOnly
                            className="bg-muted cursor-not-allowed"
                            step="0.01"
                            min="0"
                            placeholder="Auto-calculated"
                          />
                          <p className="text-xs text-muted-foreground mt-1">= IGST ÷ 2</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Label>Tax Rate (%) - {companyTaxType || 'VAT'}</Label>
                      <Input 
                        type="number"
                        value={formData.tax_rate ?? 0}
                        onChange={(e) => setFormData({...formData, tax_rate: parseFloat(e.target.value) || 0})}
                        step="0.01"
                        min="0"
                        placeholder="e.g., 15"
                      />
                    </div>
                  ))}

                  {/* Tax History Management */}
                  {isTaxEnabled && (
                    <div className="border-t pt-4 mt-4">
                      <Label className="font-medium mb-3 block">Tax Effective Date</Label>
                      <div className="flex gap-2 items-end">
                        <Input 
                          type="date"
                          value={formData.tax_effective_date}
                          onChange={(e) => setFormData({...formData, tax_effective_date: e.target.value})}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={addTaxToHistory}
                          className="whitespace-nowrap"
                        >
                          Add to History
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setShowTaxHistory(true);
                            setSelectedItemForHistory({
                              ...formData,
                              tax_history: buildMergedTaxHistory(),
                            });
                          }}
                          className="whitespace-nowrap"
                        >
                          View History ({buildMergedTaxHistory().length})
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Set the date when this tax rate became effective, then click "Add to History"</p>
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
                  {formData.standard_rates && formData.standard_rates.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {formData.standard_rates.length} rate{formData.standard_rates.length !== 1 ? 's' : ''} defined &mdash; latest: ₹{Number([...(formData.standard_rates || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.rate || 0).toFixed(2)}
                    </span>
                  )}
                </div>

                {/* Opening Balance Mode */}
                <div className="border-t pt-6 mt-6">
                  <Label className="font-medium mb-3 block">Opening Balance</Label>
                  {companyBatchesEnabled && (
                    <div className="flex items-center gap-2 mb-6">
                      <input
                        type="checkbox"
                        id="mode_with_batch"
                        checked={formData.opening_balance_mode === 'with_batch'}
                        onChange={async (e) => {
                          const newVal = e.target.checked;
                          if (!newVal && editingItem?.id && selectedCompany) {
                            const resp = await fetch(`http://localhost:5000/api/batch-allocations?itemId=${editingItem.id}&companyId=${selectedCompany.id}`);
                            const json = await resp.json();
                            if (json.data && json.data.length > 0) {
                              toast({ title: 'Cannot disable', description: `This item has ${json.data.length} existing batch record(s). Delete them before disabling batch tracking.`, variant: 'destructive' });
                              return;
                            }
                          }
                          setFormData({...formData, opening_balance_mode: newVal ? 'with_batch' : 'without_batch'});
                        }}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <Label htmlFor="mode_with_batch" className="cursor-pointer">With Batch</Label>
                    </div>
                  )}

                {formData.opening_balance_mode === 'without_batch' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Opening Stock</Label>
                      <Input 
                        type="number"
                        value={formData.opening_stock}
                        onChange={(e) => setFormData({...formData, opening_stock: parseFloat(e.target.value) || 0})}
                        step="0.01"
                        min="0"
                        placeholder="Opening stock quantity"
                      />
                    </div>                  
                    <div>
                      <Label>Opening Rate</Label>
                      <Input 
                        type="number"
                        value={formData.opening_rate}
                        onChange={(e) => setFormData({...formData, opening_rate: parseFloat(e.target.value) || 0})}
                        step="0.01"
                        min="0"
                        placeholder="Rate per unit"
                      />
                    </div>
                    
                    <div>
                      <Label>Opening Value</Label>
                      <Input 
                        type="number"
                        value={formData.opening_value}
                        readOnly
                        className="bg-muted"
                        placeholder="Auto-calculated"
                      />
                    </div>
                  </div>
                )}

                  {formData.opening_balance_mode === 'with_batch' && (
                    <div className="space-y-4">
                      <div className="border rounded-lg p-4 bg-muted/50">
                        <div className="flex justify-between items-center mb-4">
                          <Label className="font-medium">Batch-wise Opening Details</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addBatchRow}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Batch
                          </Button>
                        </div>

                        {formData.batch_details && formData.batch_details.length > 0 ? (
                          <div className="space-y-3">
                            {formData.batch_details.map((batch: any, idx: number) => (
                              (() => {
                                const normalizedCurrent = normalizeBatchNumber(batch.batch_number);
                                const duplicateCount = normalizedCurrent
                                  ? (formData.batch_details || []).filter((row: any) => normalizeBatchNumber(row.batch_number) === normalizedCurrent).length
                                  : 0;
                                const hasDuplicateBatch = duplicateCount > 1;

                                return (
                              <div key={batch.id} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end bg-white p-3 rounded border">
                                <div>
                                  <Label className="text-xs">Batch Number</Label>
                                  <Input
                                    value={batch.batch_number}
                                    onChange={(e) => updateBatchRow(batch.id, 'batch_number', e.target.value)}
                                    placeholder="Batch #"
                                    className={hasDuplicateBatch ? 'border-red-500' : ''}
                                  />
                                  {hasDuplicateBatch && (
                                    <p className="text-xs text-red-500 mt-1">Batch number must be unique for this item</p>
                                  )}
                                </div>
                                <div>
                                  <Label className="text-xs">Opening Qty</Label>
                                  <Input
                                    type="number"
                                    value={batch.opening_qty}
                                    onChange={(e) => updateBatchRow(batch.id, 'opening_qty', parseFloat(e.target.value) || 0)}
                                    step="0.01"
                                    min="0"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Opening Rate</Label>
                                  <Input
                                    type="number"
                                    value={batch.opening_rate}
                                    onChange={(e) => updateBatchRow(batch.id, 'opening_rate', parseFloat(e.target.value) || 0)}
                                    step="0.01"
                                    min="0"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Opening Value</Label>
                                  <Input
                                    type="number"
                                    value={batch.opening_value}
                                    readOnly
                                    className="bg-muted"
                                  />
                                </div>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => removeBatchRow(batch.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                                );
                              })()
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">No batch details added. Click "Add Batch" to add batch-wise opening balance.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Info about opening balance modes */}
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-900 mt-4">
                    <div className="font-medium mb-1">Opening Balance Modes:</div>
                    <div><strong>Without Batch:</strong> Normal opening balance entry (saved as &quot;primary&quot; batch internally)</div>
                    <div><strong>With Batch:</strong> Enter batch-wise opening balance details</div>
                  </div>
                </div>

                <DialogFooter className="mt-6">
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : (editingItem ? 'Update' : 'Save')}
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
                  <TableHead>UOM</TableHead>
                  <TableHead>HSN Code</TableHead>
                  <TableHead>Opening Balance</TableHead>
                  <TableHead>Inward</TableHead>
                  <TableHead>Outward</TableHead>
                  <TableHead>Closing Balance</TableHead>
                  <TableHead>Sales Rate</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const balance = itemBalances.get(item.id) || {
                    openingBalance: 0,
                    inward: 0,
                    outward: 0,
                    closingBalance: 0
                  };
                  
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.uom_master?.name}</TableCell>
                      <TableCell>{item.hsn_code}</TableCell>
                      <TableCell className="text-right">{balance.openingBalance}</TableCell>
                      <TableCell className="text-right text-green-600 font-semibold">{balance.inward}</TableCell>
                      <TableCell className="text-right text-red-600 font-semibold">{balance.outward}</TableCell>
                      <TableCell className="text-right font-bold bg-blue-50">{balance.closingBalance}</TableCell>
                      <TableCell>
                        {(() => {
                          const sorted = [...(item.standard_rates || [])].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                          const latest = sorted[0];
                          return latest ? `₹${Number(latest.rate || 0).toFixed(2)}` : (item.sales_rate ? `₹${item.sales_rate.toFixed(2)}` : '—');
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button variant="outline" size="sm" onClick={() => handleEdit(item)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDelete(item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </div>
      </div>

      {/* Tax History Dialog */}
      <Dialog
        open={showTaxHistory}
        onOpenChange={(open) => {
          if (!open) {
            setShowTaxHistory(false);
            setSelectedItemForHistory(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tax History - {selectedItemForHistory?.name}</DialogTitle>
          </DialogHeader>
          {selectedItemForHistory?.tax_history && selectedItemForHistory.tax_history.length > 0 ? (
            <div className="space-y-4">
              {selectedItemForHistory.tax_history
                .slice()
                .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((entry: any, idx: number) => (
                  <div key={idx} className="border rounded p-3 bg-muted/30">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium">Effective Date: {entry.date}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(entry.date).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                      {idx === 0 && (
                        <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                          Current Active
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                      {companyTaxType === 'GST' ? (
                        <>
                          <div>
                            <span className="text-muted-foreground">IGST:</span>
                            <p className="font-medium">{entry.igst_rate}%</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">CGST:</span>
                            <p className="font-medium">{entry.cgst_rate}%</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">SGST:</span>
                            <p className="font-medium">{entry.sgst_rate}%</p>
                          </div>
                        </>
                      ) : (
                        <div>
                          <span className="text-muted-foreground">Tax Rate:</span>
                          <p className="font-medium">{entry.tax_rate}%</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-muted-foreground italic">No tax history recorded yet.</p>
          )}
        </DialogContent>
      </Dialog>
      {/* Quick Create UOM Dialog */}
      <Dialog open={uomDialogOpen} onOpenChange={(o) => { if (!o) { setUomDialogOpen(false); setQuickUom({ name: '', symbol: '', decimal_places: 2 }); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create New UOM</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>UOM Name *</Label><Input value={quickUom.name} onChange={(e) => setQuickUom(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Kilogram" autoFocus /></div>
            <div><Label>Symbol</Label><Input value={quickUom.symbol} onChange={(e) => setQuickUom(p => ({ ...p, symbol: e.target.value }))} placeholder="e.g., kg" /></div>
            <div><Label>Decimal Places</Label><Input type="number" value={quickUom.decimal_places} onChange={(e) => setQuickUom(p => ({ ...p, decimal_places: parseInt(e.target.value) || 0 }))} min={0} max={6} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setUomDialogOpen(false); setQuickUom({ name: '', symbol: '', decimal_places: 2 }); }}>Cancel</Button>
            <Button type="button" onClick={handleCreateQuickUom} disabled={uomSubmitting || !quickUom.name.trim()}>{uomSubmitting ? 'Creating...' : 'Create UOM'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Create Stock Group Dialog */}
      <Dialog open={stockGroupDialogOpen} onOpenChange={(o) => { if (!o) { setStockGroupDialogOpen(false); setQuickStockGroup({ name: '', alias: '', parent_group_id: '' }); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create New Stock Group</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Stock Group Name *</Label><Input value={quickStockGroup.name} onChange={(e) => setQuickStockGroup(p => ({ ...p, name: e.target.value }))} placeholder="Enter stock group name" autoFocus /></div>
            <div><Label>Alias</Label><Input value={quickStockGroup.alias} onChange={(e) => setQuickStockGroup(p => ({ ...p, alias: e.target.value }))} placeholder="Enter alias (optional)" /></div>
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
            <Button type="button" variant="outline" onClick={() => { setStockGroupDialogOpen(false); setQuickStockGroup({ name: '', alias: '', parent_group_id: '' }); }}>Cancel</Button>
            <Button type="button" onClick={handleCreateQuickStockGroup} disabled={stockGroupSubmitting || !quickStockGroup.name.trim()}>{stockGroupSubmitting ? 'Creating...' : 'Create Stock Group'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Create Stock Category Dialog */}
      <Dialog open={stockCatDialogOpen} onOpenChange={(o) => { if (!o) { setStockCatDialogOpen(false); setQuickStockCat({ name: '', alias: '' }); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create New Stock Category</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Stock Category Name *</Label><Input value={quickStockCat.name} onChange={(e) => setQuickStockCat(p => ({ ...p, name: e.target.value }))} placeholder="Enter stock category name" autoFocus /></div>
            <div><Label>Alias</Label><Input value={quickStockCat.alias} onChange={(e) => setQuickStockCat(p => ({ ...p, alias: e.target.value }))} placeholder="Enter alias (optional)" /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setStockCatDialogOpen(false); setQuickStockCat({ name: '', alias: '' }); }}>Cancel</Button>
            <Button type="button" onClick={handleCreateQuickStockCat} disabled={stockCatSubmitting || !quickStockCat.name.trim()}>{stockCatSubmitting ? 'Creating...' : 'Create Stock Category'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Standard Rate Dialog */}
      <Dialog open={standardRatesDialogOpen} onOpenChange={(o) => { if (!o) setStandardRatesDialogOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Standard Rates</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Effective Date *</Label>
                <Input
                  type="date"
                  value={standardRateEntry.date}
                  onChange={(e) => setStandardRateEntry(p => ({ ...p, date: e.target.value }))}
                />
              </div>
              <div>
                <Label>Cost (Purchase Rate)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={standardRateEntry.cost}
                  onChange={(e) => setStandardRateEntry(p => ({ ...p, cost: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Rate (Sales Rate)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={standardRateEntry.rate}
                  onChange={(e) => setStandardRateEntry(p => ({ ...p, rate: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                />
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
                toast({ title: 'Rate Added', description: `Standard rate for ${standardRateEntry.date} added.` });
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Rate
            </Button>

            {/* History table inside dialog */}
            {formData.standard_rates && formData.standard_rates.length > 0 && (
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Effective Date</th>
                      <th className="text-right px-3 py-2 font-medium">Cost (Purchase)</th>
                      <th className="text-right px-3 py-2 font-medium">Rate (Sales)</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(formData.standard_rates || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((sr: any, idx: number) => (
                      <tr key={idx} className={idx === 0 ? 'bg-primary/5 font-semibold' : 'border-t'}>
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
    </div>
  );
};

export default ItemMaster;