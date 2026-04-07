import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SearchableDropdown from '@/components/ui/searchable-dropdown';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Plus, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { getCompanyTaxType, isCompanyTaxEnabled } from '@/lib/companyTax';

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
    purchase_rate: 0,
    sales_rate: 0,
    // Current tax fields - will be conditional based on tax_type
    tax_rate: 0, // VAT or combined tax
    igst_rate: 0, // GST - Integrated
    cgst_rate: 0, // GST - Central
    sgst_rate: 0, // GST - State
    tax_effective_date: new Date().toISOString().split('T')[0], // Date for tax entry
    enable_batches: false,
    batch_details: [],
    opening_balance_mode: 'without_batch', // 'without_batch' or 'with_batch'
    tax_history: [] // Array of {date, tax_rate, igst_rate, cgst_rate, sgst_rate}
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
      purchase_rate: 0,
      sales_rate: 0,
      tax_rate: 0,
      igst_rate: 0,
      cgst_rate: 0,
      sgst_rate: 0,
      tax_effective_date: new Date().toISOString().split('T')[0],
      enable_batches: false,
      batch_details: [],
      opening_balance_mode: 'without_batch',
      tax_history: []
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
      purchase_rate: item.purchase_rate || 0,
      sales_rate: item.sales_rate || 0,
      tax_rate: item.tax_rate || 0,
      igst_rate: item.igst_rate || 0,
      cgst_rate: item.cgst_rate || 0,
      sgst_rate: item.sgst_rate || 0,
      tax_effective_date: new Date().toISOString().split('T')[0],
      enable_batches: item.enable_batches || false,
      batch_details: item.batch_details || [],
      opening_balance_mode: mode,
      tax_history: item.tax_history || []
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
        purchase_rate: formData.purchase_rate,
        sales_rate: formData.sales_rate,
        enable_batches: formData.opening_balance_mode === 'with_batch',
        company_id: selectedCompany.id,
        batch_details: batchDetailsToSave
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
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Button variant="ghost" onClick={() => { if (window.history.length > 1) { navigate(-1); } else { navigate('/dashboard'); } }} className="mr-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">Item Master</h1>
          </div>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        </div>

        {/* Company Info */}
        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm text-muted-foreground">Selected Company</Label>
                <p className="font-medium">{selectedCompany.name}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {showForm ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{editingItem ? 'Edit Item' : 'Add New Item'}</CardTitle>
            </CardHeader>
            <CardContent>
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
                       <Button type="button" variant="outline" size="sm" onClick={() => {
                         const returnPath = window.location.pathname;
                         navigate('/uom-master', { state: { returnTo: returnPath, autoShowForm: true } });
                       }}>
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
                      <Button type="button" variant="outline" size="sm" onClick={() => {
                        const returnPath = window.location.pathname;
                        navigate('/stock-group-master', { state: { returnTo: returnPath, autoShowForm: true } });
                      }}>
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
                      <Button type="button" variant="outline" size="sm" onClick={() => {
                        const returnPath = window.location.pathname;
                        navigate('/stock-category-master', { state: { returnTo: returnPath, autoShowForm: true } });
                      }}>
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

                  <div>
                    <Label>Purchase Rate</Label>
                    <Input 
                      type="number"
                      value={formData.purchase_rate ?? 0}
                      onChange={(e) => setFormData({...formData, purchase_rate: parseFloat(e.target.value) || 0})}
                      step="0.01"
                      min="0"
                    />
                  </div>
                  
                  <div>
                    <Label>Sales Rate</Label>
                    <Input 
                      type="number"
                      value={formData.sales_rate}
                      onChange={(e) => setFormData({...formData, sales_rate: parseFloat(e.target.value) || 0})}
                      step="0.01"
                      min="0"
                    />
                  </div>
                </div>

                {/* Opening Balance Mode */}
                <div className="border-t pt-6 mt-6">
                  <Label className="font-medium mb-3 block">Opening Balance</Label>
                  <div className="flex gap-6 mb-6">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        id="mode_without_batch"
                        name="opening_balance_mode"
                        value="without_batch"
                        checked={formData.opening_balance_mode === 'without_batch'}
                        onChange={(e) => setFormData({...formData, opening_balance_mode: 'without_batch'})}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="mode_without_batch" className="cursor-pointer">Without Batch</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        id="mode_with_batch"
                        name="opening_balance_mode"
                        value="with_batch"
                        checked={formData.opening_balance_mode === 'with_batch'}
                        onChange={(e) => setFormData({...formData, opening_balance_mode: 'with_batch'})}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="mode_with_batch" className="cursor-pointer">With Batch</Label>
                    </div>
                  </div>

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

                <div className="flex justify-end space-x-4 mt-6">
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : (editingItem ? 'Update' : 'Save')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Items List</CardTitle>
          </CardHeader>
          <CardContent>
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
                      <TableCell>₹{item.sales_rate?.toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          {isTaxEnabled && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => {
                                setShowTaxHistory(true);
                                setSelectedItemForHistory(item);
                              }}
                              title="View tax history"
                            >
                              📅
                            </Button>
                          )}
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

      {/* Tax History Modal */}
      {showTaxHistory && selectedItemForHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-96 overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle>Tax History - {selectedItemForHistory.name}</CardTitle>
              <button
                onClick={() => {
                  setShowTaxHistory(false);
                  setSelectedItemForHistory(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </CardHeader>
            <CardContent>
              {selectedItemForHistory.tax_history && selectedItemForHistory.tax_history.length > 0 ? (
                <div className="space-y-4">
                  {selectedItemForHistory.tax_history
                    .slice()
                    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((entry: any, idx: number) => (
                      <div key={idx} className="border rounded p-3 bg-white">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-medium">Effective Date: {entry.date}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(entry.date).toLocaleDateString('en-US', { 
                                weekday: 'long', 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric' 
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
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ItemMaster;