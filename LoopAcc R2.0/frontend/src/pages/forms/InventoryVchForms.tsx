import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SearchableDropdown from '@/components/ui/searchable-dropdown';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Plus, Trash2, Printer, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { getCompanyTaxLabel, getCompanyTaxType, isCompanyTaxEnabled } from '@/lib/companyTax';
import { BatchSelectionDialog } from '@/components/BatchSelectionDialog';
import { BatchAllocationDialog } from '@/components/BatchAllocationDialog';
import QuickCreateLedgerDialog from '@/components/QuickCreateLedgerDialog';
import QuickCreateItemDialog from '@/components/QuickCreateItemDialog';
import type { VoucherTypeMeta } from './VoucherForm';

interface InventoryItem {
  id: string;
  item_id: string;
  quantity: number;
  rate: number;
  discount_percent: number;
  discount_amount: number;
  tax_percent: number;
  amount: number;
  tax_amount: number;
  net_amount: number;
  batch_id?: string | null;
  batch_qty?: number;
  batch_allocations?: any[];
  itemData?: {
    cgst_rate: number;
    sgst_rate: number;
    igst_rate: number;
    tax_rate: number;
  };
}

interface AdditionalLedgerEntry {
  id: string;
  ledger_id: string;
  amount: number;
  isAutoCalculated?: boolean;
}

interface InventoryFormProps {
  voucherType?: 'sales' | 'credit-note' | 'purchase' | 'debit-note';
  voucherTypeMeta?: VoucherTypeMeta;
}

const InventoryForm = ({ voucherType = 'sales', voucherTypeMeta }: InventoryFormProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo;
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const isTaxEnabled = isCompanyTaxEnabled(selectedCompany);
  const companyTaxType = getCompanyTaxType(selectedCompany);
  const [loading, setLoading] = useState(false);

  const actualVoucherType = voucherType || 'sales';
  const isSales = ['sales', 'credit-note'].includes(actualVoucherType);
  const taxLabel = isTaxEnabled ? getCompanyTaxLabel(selectedCompany) : 'Tax Amount';

  // Mode-dependent labels and config
  const partyLabel = isSales ? 'Customer' : 'Supplier';
  const partyDefaultGroup = isSales ? 'Sundry Debtors' : 'Sundry Creditors';
  const inventoryLedgerLabel = isSales ? 'Sales Ledger *' : 'Purchase Ledger *';
  const inventoryLedgerGroups = isSales ? ['Sales Accounts', 'Income'] : ['Purchase Accounts', 'Expenses'];
  const isReturn = isSales ? actualVoucherType === 'credit-note' : actualVoucherType === 'debit-note';

  const defaultTitle = isSales
    ? actualVoucherType === 'credit-note' ? 'Credit Note' : 'Sales Invoice'
    : actualVoucherType === 'debit-note' ? 'Debit Note' : 'Purchase Invoice';
  const typeDisplayName = voucherTypeMeta?.name || defaultTitle;

  const searchParams = new URLSearchParams(location.search);
  const editVoucherId = searchParams.get('edit');
  const isEditMode = !!editVoucherId;

  const formTitle = isEditMode ? `Edit ${typeDisplayName}` : `Create ${typeDisplayName}`;
  const invoiceLabel = typeDisplayName;

  const [formData, setFormData] = useState({
    ledger_id: '',
    voucher_number: '',
    voucher_date: new Date().toISOString().split('T')[0],
    reference_number: '',
    reference_date: '',
    narration: '',
    total_amount: 0,
    tax_amount: 0,
    net_amount: 0,
  });

  const [selectedInventoryLedgerId, setSelectedInventoryLedgerId] = useState<string>('');
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([{
    id: '1', item_id: '', quantity: 1, rate: 0,
    discount_percent: 0, discount_amount: 0,
    tax_percent: 0, amount: 0, tax_amount: 0, net_amount: 0,
  }]);
  const currencySymbol = selectedCompany?.currency === 'INR' ? '₹' : selectedCompany?.currency === 'USD' ? '$' : selectedCompany?.currency || '₹';
  const [additionalLedgers, setAdditionalLedgers] = useState<AdditionalLedgerEntry[]>([]);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [ledgersState, setLedgersState] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [savedVoucher, setSavedVoucher] = useState<any>(null);
  const [itemSearchByRow, setItemSearchByRow] = useState<Record<string, string>>({});
  const [showDiscountColumn, setShowDiscountColumn] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchAllocationDialogOpen, setBatchAllocationDialogOpen] = useState(false);
  const [selectedItemForBatch, setSelectedItemForBatch] = useState<{
    index: number; itemId: string; itemName: string; quantity: number;
    batch_allocations?: any[]; itemData?: any;
  } | null>(null);
  const [quickCreateLedgerOpen, setQuickCreateLedgerOpen] = useState(false);
  const [quickCreateLedgerDefaultGroup, setQuickCreateLedgerDefaultGroup] = useState<string | undefined>(undefined);
  const [quickCreateItemOpen, setQuickCreateItemOpen] = useState(false);

  useEffect(() => {
    if (!selectedCompany) return;
    const init = async () => {
      const loaded = await fetchInitialData();
      if (isEditMode && editVoucherId) {
        await loadExistingVoucher(editVoucherId, loaded || []);
      } else {
        await generateVoucherNumber();
      }
    };
    init();
  }, [selectedCompany, isEditMode, editVoucherId]);

  useEffect(() => {
    if (selectedCompany?.settings) {
      setShowDiscountColumn(selectedCompany.settings.show_discount_column === 'true');
    }
  }, [selectedCompany]);

  const generateVoucherNumber = async () => {
    if (!selectedCompany) return;
    try {
      let prefix = isSales
        ? (actualVoucherType === 'credit-note' ? 'CN' : 'INV')
        : (actualVoucherType === 'debit-note' ? 'DN' : 'BILL');
      let suffix = '';
      let startingNumber = 1;

      if (voucherTypeMeta) {
        prefix = voucherTypeMeta.prefix;
        suffix = voucherTypeMeta.suffix || '';
        startingNumber = voucherTypeMeta.starting_number || 1;
      } else {
        const keyMap: Record<string, string> = {
          'sales': 'invoice_prefix,invoice_starting_number',
          'credit-note': 'credit_note_prefix,credit_note_starting_number',
          'purchase': 'bill_prefix,bill_starting_number',
          'debit-note': 'debit_note_prefix,debit_note_starting_number',
        };
        const settingKeys = keyMap[actualVoucherType] || 'invoice_prefix,invoice_starting_number';
        const settingsResponse = await fetch(
          `http://localhost:5000/api/settings?companyId=${selectedCompany.id}&keys=${settingKeys}`
        );
        if (settingsResponse.ok) {
          const settingsResult = await settingsResponse.json();
          const settingsData = settingsResult.data || [];
          const prefixKey = settingKeys.split(',')[0];
          const numberKey = settingKeys.split(',')[1];
          const prefixSetting = settingsData.find((s: any) => s.setting_key === prefixKey);
          const numberSetting = settingsData.find((s: any) => s.setting_key === numberKey);
          if (prefixSetting) prefix = String(prefixSetting.setting_value || prefix);
          if (numberSetting) startingNumber = parseInt(String(numberSetting.setting_value || '1'));
        }
      }

      const vouchersResponse = await fetch(
        `http://localhost:5000/api/vouchers?companyId=${selectedCompany.id}`
      );
      let nextNumber = startingNumber;
      if (vouchersResponse.ok) {
        const vouchersResult = await vouchersResponse.json();
        const allVouchers = vouchersResult.data || [];
        const lastVoucher = allVouchers
          .filter((v: any) => v.voucher_type === actualVoucherType)
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        if (lastVoucher) {
          let stripped = String(lastVoucher.voucher_number || '');
          if (prefix && stripped.startsWith(prefix)) stripped = stripped.slice(prefix.length);
          if (suffix && stripped.endsWith(suffix)) stripped = stripped.slice(0, stripped.length - suffix.length);
          const parsed = parseInt(stripped);
          if (!isNaN(parsed)) nextNumber = parsed + 1;
        }
      }
      setFormData(prev => ({ ...prev, voucher_number: `${prefix}${nextNumber.toString().padStart(4, '0')}${suffix}` }));
    } catch (error) {
      console.error('Error generating voucher number:', error);
    }
  };

  const fetchInitialData = async () => {
    if (!selectedCompany) return [];
    let ledgersWithGroupNames: any[] = [];
    try {
      const [ledgersRes, itemsRes] = await Promise.all([
        fetch(`http://localhost:5000/api/ledgers?companyId=${selectedCompany.id}`),
        fetch(`http://localhost:5000/api/items?companyId=${selectedCompany.id}`),
      ]);
      const ledgersJson = await ledgersRes.json();
      const itemsJson = await itemsRes.json();
      if (ledgersJson.success && ledgersJson.data) {
        ledgersWithGroupNames = ledgersJson.data.map((ledger: any) => ({
          ...ledger,
          group_name: ledger.ledger_groups?.name || 'Unknown',
        }));
        setLedgers(ledgersWithGroupNames);
        setLedgersState(ledgersWithGroupNames);
      }
      if (itemsJson.success && itemsJson.data) {
        setItems(itemsJson.data);
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
      setLedgers([]); setLedgersState([]); setItems([]);
    }
    return ledgersWithGroupNames;
  };

  const loadExistingVoucher = async (voucherId: string, preloadedLedgers: any[] = []) => {
    if (!selectedCompany) return;
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:5000/api/vouchers/${voucherId}`);
      if (!response.ok) throw new Error('Failed to load voucher');
      const result = await response.json();
      const voucher = result.data;
      const voucherDetails = voucher.details || [];
      const itemDetails = voucherDetails.filter((d: any) => d.item_id) || [];
      const ledgerDetails = voucherDetails.filter((d: any) => d.ledger_id && !d.item_id) || [];
      const availableLedgers = preloadedLedgers.length > 0 ? preloadedLedgers : (ledgersState.length > 0 ? ledgersState : ledgers);

      const inventoryLedgerDetail =
        ledgerDetails.find((d: any) => d.isinventory === 'yes') ||
        ledgerDetails.find((d: any) => {
          if (!d?.ledger_id || d.ledger_id === voucher.ledger_id) return false;
          const ledger = availableLedgers.find((l: any) => l.id === d.ledger_id);
          const classifier = `${ledger?.group_name || ''} ${ledger?.name || ''}`.toLowerCase();
          return isSales ? classifier.includes('sale') : classifier.includes('purchase');
        });
      const resolvedInventoryLedgerId = inventoryLedgerDetail?.ledger_id || '';
      if (resolvedInventoryLedgerId) setSelectedInventoryLedgerId(resolvedInventoryLedgerId);

      setFormData({
        ledger_id: voucher.ledger_id,
        voucher_number: voucher.voucher_number,
        voucher_date: voucher.voucher_date,
        reference_number: voucher.reference_number || '',
        reference_date: voucher.reference_date || '',
        narration: voucher.narration || '',
        total_amount: voucher.total_amount,
        tax_amount: voucher.tax_amount,
        net_amount: voucher.net_amount,
      });

      let loadedItemsData: InventoryItem[] = [];
      if (itemDetails.length > 0) {
        loadedItemsData = itemDetails.map((detail: any, index: number) => {
          const itemMaster = items.find((item: any) => item.id === detail.item_id);
          const hydrated: InventoryItem = {
            id: (index + 1).toString(),
            item_id: detail.item_id || '',
            quantity: Number(detail.quantity || 0),
            rate: Number(detail.rate || 0),
            discount_percent: Number(detail.discount_percent || 0),
            discount_amount: Number(detail.discount_amount || 0),
            tax_percent: Number(detail.tax_percent || 0),
            amount: Number(detail.amount || 0),
            tax_amount: Number(detail.tax_amount || 0),
            net_amount: Number(detail.net_amount || 0),
            batch_id: detail.batch_id || null,
            batch_allocations: detail.batch_allocations || [],
            itemData: {
              cgst_rate: Number(itemMaster?.cgst_rate || 0),
              sgst_rate: Number(itemMaster?.sgst_rate || 0),
              igst_rate: Number(itemMaster?.igst_rate || 0),
              tax_rate: Number(itemMaster?.tax_rate || detail.tax_percent || 0),
            },
          };
          return calculateItemAmounts(hydrated);
        });
        setInventoryItems(loadedItemsData);
      }

      let loadedAdditionalLedgersData: AdditionalLedgerEntry[] = [];
      if (ledgerDetails.length > 0) {
        loadedAdditionalLedgersData = ledgerDetails
          .filter((detail: any) => {
            if (detail.isparty === 'yes') return false;
            if (detail.ledger_id === voucher.ledger_id) return false;
            if (detail.isinventory === 'yes') return false;
            if (resolvedInventoryLedgerId && detail.ledger_id === resolvedInventoryLedgerId) return false;
            return true;
          })
          .map((detail: any, index: number) => {
            const matchedLedger = availableLedgers.find((l: any) => l.id === detail.ledger_id);
            const isTaxLedger =
              matchedLedger?.group_name === 'Duties & Taxes' &&
              ['IGST', 'CGST', 'SGST', 'VAT'].includes(matchedLedger?.tax_type);
            return {
              id: (index + 1).toString(),
              ledger_id: detail.ledger_id || '',
              amount: detail.amount,
              isAutoCalculated: isTaxLedger,
            };
          });
        setAdditionalLedgers(loadedAdditionalLedgersData);
      }

      if (loadedItemsData.length > 0) {
        const recalculated = updateTaxLedgersAutomatically(loadedItemsData, loadedAdditionalLedgersData);
        calculateTotals(loadedItemsData, recalculated);
      }
      setSavedVoucher(voucher);
    } catch (error) {
      console.error('Error loading existing voucher:', error);
      toast({ title: 'Error', description: 'Failed to load voucher data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const calculateItemAmounts = (item: InventoryItem): InventoryItem => {
    const amount = item.quantity * item.rate;
    const discountAmount = (amount * item.discount_percent) / 100;
    const discountedAmount = amount - discountAmount;

    if (!isTaxEnabled) {
      return { ...item, amount, discount_amount: discountAmount, tax_percent: 0, tax_amount: 0, net_amount: discountedAmount };
    }

    let applicableTaxRate = item.tax_percent || 0;
    if (item.itemData) {
      if (companyTaxType === 'GST') {
        applicableTaxRate = item.itemData.igst_rate > 0
          ? item.itemData.igst_rate
          : (item.itemData.cgst_rate + item.itemData.sgst_rate) || item.itemData.tax_rate || 0;
      } else {
        applicableTaxRate = item.itemData.tax_rate || 0;
      }
    }
    const tax_amount = (discountedAmount * applicableTaxRate) / 100;
    const net_amount = discountedAmount + tax_amount;
    return { ...item, amount, discount_amount: discountAmount, tax_percent: applicableTaxRate, tax_amount, net_amount };
  };

  const calculateTaxByType = (itemsToCalc: InventoryItem[], taxType: string) => {
    if (!isTaxEnabled) return 0;
    let totalTax = 0;
    itemsToCalc.forEach((item) => {
      if (!item.item_id) return;
      let itemTaxData = item.itemData;
      if (!itemTaxData && item.item_id) {
        const itemMaster = items.find(i => i.id === item.item_id);
        if (itemMaster) {
          itemTaxData = {
            cgst_rate: itemMaster.cgst_rate || 0,
            sgst_rate: itemMaster.sgst_rate || 0,
            igst_rate: itemMaster.igst_rate || 0,
            tax_rate: itemMaster.tax_rate || 0,
          };
        }
      }
      const amount = item.quantity * item.rate;
      const discountAmount = (amount * item.discount_percent) / 100;
      const discountedAmount = amount - discountAmount;
      const fallbackRate = Number(item.tax_percent || 0);
      const rates = {
        CGST: itemTaxData?.cgst_rate || (companyTaxType === 'GST' ? fallbackRate / 2 : 0),
        SGST: itemTaxData?.sgst_rate || (companyTaxType === 'GST' ? fallbackRate / 2 : 0),
        IGST: itemTaxData?.igst_rate || fallbackRate,
        VAT: itemTaxData?.tax_rate || fallbackRate,
      } as Record<string, number>;
      if (rates[taxType] > 0) {
        totalTax += (discountedAmount * rates[taxType]) / 100;
      }
    });
    return totalTax;
  };

  const updateInventoryItem = (index: number, field: keyof InventoryItem, value: any) => {
    const newItems = [...inventoryItems];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === 'item_id' && value) {
      const selectedItem = items.find(item => item.id === value);
      if (selectedItem) {
        newItems[index].tax_percent = selectedItem.tax_rate || 0;
        newItems[index].rate = isSales ? (selectedItem.sales_rate || 0) : (selectedItem.purchase_rate || 0);
        newItems[index].itemData = {
          cgst_rate: selectedItem.cgst_rate || 0,
          sgst_rate: selectedItem.sgst_rate || 0,
          igst_rate: selectedItem.igst_rate || 0,
          tax_rate: selectedItem.tax_rate || 0,
        };
      }
    }
    newItems[index] = calculateItemAmounts(newItems[index]);
    setInventoryItems(newItems);
    const updatedTaxLedgers = updateTaxLedgersAutomatically(newItems, additionalLedgers);
    calculateTotals(newItems, updatedTaxLedgers);
  };

  const handleInventoryItemSearchChange = (index: number, rowId: string, inputValue: string) => {
    setItemSearchByRow(prev => ({ ...prev, [rowId]: inputValue }));
    const match = items.find(p => p.name?.trim().toLowerCase() === inputValue.trim().toLowerCase());
    if (match && inventoryItems[index]?.item_id !== match.id) {
      updateInventoryItem(index, 'item_id', match.id);
    }
  };

  const handleInventoryItemSearchBlur = (index: number, rowId: string) => {
    const entered = (itemSearchByRow[rowId] || '').trim();
    const exactMatch = items.find(p => p.name?.trim().toLowerCase() === entered.toLowerCase());
    if (!entered) {
      setItemSearchByRow(prev => ({ ...prev, [rowId]: '' }));
      if (inventoryItems[index]?.item_id) updateInventoryItem(index, 'item_id', '');
      return;
    }
    if (exactMatch) {
      if (inventoryItems[index]?.item_id !== exactMatch.id) updateInventoryItem(index, 'item_id', exactMatch.id);
      setItemSearchByRow(prev => ({ ...prev, [rowId]: exactMatch.name }));
      return;
    }
    const selected = items.find(p => p.id === inventoryItems[index]?.item_id);
    setItemSearchByRow(prev => ({ ...prev, [rowId]: selected?.name || '' }));
  };

  const calculateTotals = (itemsArr: InventoryItem[], ledgersArr: AdditionalLedgerEntry[] = additionalLedgers) => {
    const items_subtotal = itemsArr.reduce(
      (sum, item) => sum + (Number(item.amount || 0) - Number(item.discount_amount || 0)),
      0
    );
    const taxLedgerAmount = isTaxEnabled ? ledgersArr.reduce((sum, entry) => {
      const ledger = ledgersState.find(l => l.id === entry.ledger_id);
      const isDutiesAndTaxes = ledger?.group_name === 'Duties & Taxes';
      const hasTaxType = ledger?.tax_type && ['IGST', 'CGST', 'SGST', 'VAT'].includes(ledger.tax_type);
      return isDutiesAndTaxes && hasTaxType ? sum + entry.amount : sum;
    }, 0) : 0;
    const otherLedgersTotal = ledgersArr.reduce((sum, entry) => {
      const ledger = ledgersState.find(l => l.id === entry.ledger_id);
      const isDutiesAndTaxes = ledger?.group_name === 'Duties & Taxes';
      const hasTaxType = ledger?.tax_type && ['IGST', 'CGST', 'SGST', 'VAT'].includes(ledger.tax_type);
      if (!isTaxEnabled) return sum + entry.amount;
      return isDutiesAndTaxes && hasTaxType ? sum : sum + entry.amount;
    }, 0);
    const total_amount = items_subtotal + otherLedgersTotal;
    const tax_amount = taxLedgerAmount;
    const net_amount = total_amount + tax_amount;
    setFormData(prev => ({ ...prev, total_amount, tax_amount, net_amount }));
  };

  const addInventoryItem = () => {
    setInventoryItems([...inventoryItems, {
      id: Date.now().toString(), item_id: '', quantity: 1, rate: 0,
      discount_percent: 0, discount_amount: 0, tax_percent: 0, amount: 0, tax_amount: 0, net_amount: 0,
    }]);
  };

  const removeInventoryItem = (index: number) => {
    const newItems = inventoryItems.filter((_, i) => i !== index);
    setInventoryItems(newItems);
    const updatedTaxLedgers = updateTaxLedgersAutomatically(newItems, additionalLedgers);
    calculateTotals(newItems, updatedTaxLedgers);
  };

  const openBatchSelection = (index: number) => {
    const item = inventoryItems[index];
    if (!item.item_id) {
      toast({ title: 'Select Item First', description: 'Please select an item before choosing a batch', variant: 'destructive' });
      return;
    }
    const selectedItem = items.find(i => i.id === item.item_id);
    if (!selectedItem) return;
    const batchesEnabled = selectedItem.enable_batches === true;
    setSelectedItemForBatch({
      index,
      itemId: item.item_id,
      itemName: selectedItem.name,
      quantity: item.quantity,
      batch_allocations: item.batch_allocations || [],
      itemData: inventoryItems[index]?.itemData,
    });
    if (batchesEnabled) setBatchAllocationDialogOpen(true);
    else setBatchDialogOpen(true);
  };

  const handleBatchSelect = (batchId: string | null, _allocationMethod?: 'fifo' | 'lifo', qty?: number) => {
    if (selectedItemForBatch) {
      const newItems = [...inventoryItems];
      newItems[selectedItemForBatch.index].batch_id = batchId;
      if (qty) newItems[selectedItemForBatch.index].batch_qty = qty;
      setInventoryItems(newItems);
    }
    setBatchDialogOpen(false);
    setSelectedItemForBatch(null);
  };

  const handleBatchAllocationsSelect = (summary: any) => {
    if (selectedItemForBatch && summary.allocations && summary.allocations.length > 0) {
      const newItems = [...inventoryItems];
      const itemIndex = selectedItemForBatch.index;
      if (summary.allocations.length === 1) {
        const alloc = summary.allocations[0];
        newItems[itemIndex].batch_id = alloc.batch_id;
        newItems[itemIndex].batch_qty = alloc.qty;
        newItems[itemIndex].batch_allocations = summary.allocations;
        newItems[itemIndex].quantity = alloc.qty;
        newItems[itemIndex].rate = alloc.rate;
        newItems[itemIndex].amount = alloc.amount;
        newItems[itemIndex].discount_percent = alloc.discount_percent || 0;
        newItems[itemIndex].discount_amount = alloc.discount_amount || 0;
        newItems[itemIndex].tax_percent = alloc.tax_percent || 0;
        newItems[itemIndex].tax_amount = alloc.tax_amount || 0;
        newItems[itemIndex].net_amount = alloc.net_amount || 0;
      } else {
        newItems[itemIndex].batch_qty = summary.totalBatchQty;
        newItems[itemIndex].quantity = summary.totalBatchQty;
        newItems[itemIndex].rate = summary.averageRate;
        newItems[itemIndex].amount = summary.totalAmount;
        newItems[itemIndex].batch_allocations = summary.allocations;
        newItems[itemIndex].discount_amount = summary.totalDiscount || 0;
        newItems[itemIndex].tax_amount = summary.totalTaxAmount || 0;
        newItems[itemIndex].net_amount = summary.totalNetAmount || 0;
      }
      setInventoryItems(newItems);
      calculateTotals(newItems, additionalLedgers);
      toast({ title: 'Success', description: `Batch allocations applied to ${selectedItemForBatch.itemName}` });
    }
    setBatchAllocationDialogOpen(false);
    setSelectedItemForBatch(null);
  };

  const addAdditionalLedger = () => {
    const newId = (Math.max(...additionalLedgers.map(e => parseInt(e.id)), 0) + 1).toString();
    const newLedgers = [...additionalLedgers, { id: newId, ledger_id: '', amount: 0, isAutoCalculated: undefined }];
    setAdditionalLedgers(newLedgers as AdditionalLedgerEntry[]);
    calculateTotals(inventoryItems, newLedgers as AdditionalLedgerEntry[]);
  };

  const removeAdditionalLedger = (entryId: string) => {
    const newLedgers = additionalLedgers.filter(e => e.id !== entryId);
    setAdditionalLedgers(newLedgers);
    calculateTotals(inventoryItems, newLedgers);
  };

  const handleAdditionalLedgerChange = (entryId: string, ledgerId: string) => {
    const selectedLedger = ledgers.find(l => l.id === ledgerId);
    const isDutiesAndTaxes = selectedLedger?.group_name === 'Duties & Taxes';
    const hasTaxType = selectedLedger?.tax_type && ['IGST', 'CGST', 'SGST', 'VAT'].includes(selectedLedger.tax_type);
    const taxType = selectedLedger?.tax_type;
    const isValidTaxLedger = isTaxEnabled && isDutiesAndTaxes && hasTaxType;
    const taxAmount = isValidTaxLedger ? calculateTaxByType(inventoryItems, taxType) : 0;
    const newLedgers = additionalLedgers.map(entry =>
      entry.id === entryId
        ? { ...entry, ledger_id: ledgerId, amount: isValidTaxLedger ? taxAmount : 0, isAutoCalculated: isValidTaxLedger }
        : entry
    );
    setAdditionalLedgers(newLedgers);
    calculateTotals(inventoryItems, newLedgers);
  };

  const updateTaxLedgersAutomatically = (itemsArr: InventoryItem[], ledgersToUpdate: AdditionalLedgerEntry[] = additionalLedgers) => {
    const updatedLedgers = ledgersToUpdate.map(entry => {
      const ledger = ledgersState.find(l => l.id === entry.ledger_id);
      const isDutiesAndTaxes = ledger?.group_name === 'Duties & Taxes';
      const hasTaxType = ledger?.tax_type && ['IGST', 'CGST', 'SGST', 'VAT'].includes(ledger.tax_type);
      const taxType = ledger?.tax_type;
      if (!isTaxEnabled && isDutiesAndTaxes && hasTaxType && entry.isAutoCalculated !== false) {
        return { ...entry, amount: 0, isAutoCalculated: true };
      }
      if (isDutiesAndTaxes && hasTaxType && entry.isAutoCalculated !== false) {
        const taxAmount = calculateTaxByType(itemsArr, taxType);
        return { ...entry, amount: taxAmount, isAutoCalculated: true };
      }
      return entry;
    });
    setAdditionalLedgers(updatedLedgers);
    return updatedLedgers;
  };

  useEffect(() => {
    if (additionalLedgers.length === 0) { calculateTotals(inventoryItems, []); return; }
    const updatedTaxLedgers = updateTaxLedgersAutomatically(inventoryItems, additionalLedgers);
    calculateTotals(inventoryItems, updatedTaxLedgers);
  }, [inventoryItems, ledgersState]);

  const handleAdditionalAmountChange = (entryId: string, amount: number) => {
    const newLedgers = additionalLedgers.map(e => e.id === entryId ? { ...e, amount, isAutoCalculated: false } : e);
    setAdditionalLedgers(newLedgers);
    calculateTotals(inventoryItems, newLedgers);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    if (!formData.ledger_id) {
      toast({ title: 'Validation Error', description: `Please select a ${partyLabel}.`, variant: 'destructive' });
      return;
    }
    if (!selectedInventoryLedgerId) {
      toast({ title: 'Validation Error', description: `Please select a ${isSales ? 'sales' : 'purchase'} ledger.`, variant: 'destructive' });
      return;
    }
    if (inventoryItems.length === 0 || inventoryItems.every(item => !item.item_id)) {
      toast({ title: 'Validation Error', description: 'Please add at least one item.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const itemsSubtotal = inventoryItems.reduce(
        (sum, item) => sum + (Number(item.amount || 0) - Number(item.discount_amount || 0)),
        0
      );

      // Ledger entries: direction depends on voucher type
      // Sales/CreditNote: Debit customer, Credit sales+tax
      // Purchase/DebitNote: Credit supplier, Debit purchase+tax
      const partyDebit = isSales ? (isReturn ? 0 : formData.net_amount) : (isReturn ? formData.net_amount : 0);
      const partyCredit = isSales ? (isReturn ? formData.net_amount : 0) : (isReturn ? 0 : formData.net_amount);
      const inventoryDebit = isSales ? (isReturn ? itemsSubtotal : 0) : (isReturn ? 0 : itemsSubtotal);
      const inventoryCredit = isSales ? (isReturn ? 0 : itemsSubtotal) : (isReturn ? itemsSubtotal : 0);

      const ledgerEntries: any[] = [
        {
          company_id: selectedCompany.id,
          ledger_id: formData.ledger_id,
          transaction_date: formData.voucher_date,
          debit_amount: partyDebit,
          credit_amount: partyCredit,
          narration: `${invoiceLabel} ${formData.voucher_number}`,
        },
        {
          company_id: selectedCompany.id,
          ledger_id: selectedInventoryLedgerId,
          transaction_date: formData.voucher_date,
          debit_amount: inventoryDebit,
          credit_amount: inventoryCredit,
          narration: `${invoiceLabel} to ${ledgers.find(l => l.id === formData.ledger_id)?.name}`,
        },
      ];

      additionalLedgers.filter(e => e.ledger_id && e.amount > 0).forEach(entry => {
        const addDebit = isSales ? (isReturn ? entry.amount : 0) : (isReturn ? 0 : entry.amount);
        const addCredit = isSales ? (isReturn ? 0 : entry.amount) : (isReturn ? entry.amount : 0);
        ledgerEntries.push({
          company_id: selectedCompany.id,
          ledger_id: entry.ledger_id,
          transaction_date: formData.voucher_date,
          debit_amount: addDebit,
          credit_amount: addCredit,
          narration: `Tax/Expense on ${invoiceLabel} ${formData.voucher_number}`,
        });
      });

      const voucherDetails = [
        ...inventoryItems
          .filter(item => item.item_id)
          .map(item => ({
            item_id: item.item_id,
            batch_id: item.batch_id || null,
            batch_allocations: item.batch_allocations || [],
            quantity: item.quantity,
            rate: item.rate,
            amount: item.amount,
            discount_percent: item.discount_percent,
            discount_amount: item.discount_amount,
            tax_percent: item.tax_percent,
            tax_amount: item.tax_amount,
            net_amount: item.net_amount,
          })),
        ...additionalLedgers
          .filter(e => e.ledger_id && e.amount > 0)
          .map(entry => ({
            ledger_id: entry.ledger_id,
            amount: entry.amount,
            net_amount: entry.amount,
            quantity: 0, rate: 0, tax_percent: 0, tax_amount: 0,
            debit_amount: isSales ? (isReturn ? entry.amount : 0) : (isReturn ? 0 : entry.amount),
            credit_amount: isSales ? (isReturn ? 0 : entry.amount) : (isReturn ? entry.amount : 0),
          })),
      ];

      const voucherPayload = {
        id: editVoucherId || undefined,
        ...formData,
        reference_date: formData.reference_date || null,
        company_id: selectedCompany.id,
        voucher_type: actualVoucherType,
        voucher_type_id: voucherTypeMeta?.id || undefined,
        details: voucherDetails,
        ledger_entries: ledgerEntries.filter(e => e.ledger_id),
      };

      const apiUrl = isEditMode && editVoucherId
        ? `http://localhost:5000/api/vouchers/${editVoucherId}`
        : `http://localhost:5000/api/vouchers`;
      const method = isEditMode ? 'PUT' : 'POST';

      const response = await fetch(apiUrl, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voucherPayload),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `Failed to ${isEditMode ? 'update' : 'create'} voucher`);
      }
      const result = await response.json();
      const voucher = result.data;
      setSavedVoucher(voucher);
      toast({ title: 'Success', description: isEditMode ? `${invoiceLabel} updated!` : `${invoiceLabel} created!` });

      handlePrint(voucher);

      if (returnTo) {
        navigate(returnTo);
      } else if (isEditMode) {
        if (window.history.length > 1) navigate(-1); else navigate('/dashboard');
      } else {
        setFormData({
          ledger_id: '', voucher_number: '',
          voucher_date: new Date().toISOString().split('T')[0],
          reference_number: '', reference_date: '',
          narration: '', total_amount: 0, tax_amount: 0, net_amount: 0,
        });
        setInventoryItems([{ id: '1', item_id: '', quantity: 1, rate: 0, discount_percent: 0, discount_amount: 0, tax_percent: 0, amount: 0, tax_amount: 0, net_amount: 0 }]);
        setAdditionalLedgers([]);
        setSelectedInventoryLedgerId('');
        setSavedVoucher(null);
        await generateVoucherNumber();
      }
    } catch (error) {
      console.error('Error saving voucher:', error);
      toast({ title: 'Error', description: `Failed to ${isEditMode ? 'update' : 'create'} ${invoiceLabel.toLowerCase()}`, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = (voucherArg?: any) => {
    const voucherToPrint = voucherArg || savedVoucher;
    if (!voucherToPrint) {
      toast({ title: 'Error', description: 'Please save the invoice first', variant: 'destructive' });
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const numberToWords = (value: number): string => {
      const ones = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
      const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
      const integerToWords = (num: number): string => {
        if (num < 20) return ones[num];
        if (num < 100) return `${tens[Math.floor(num/10)]}${num%10 ? ` ${ones[num%10]}` : ''}`;
        if (num < 1000) return `${ones[Math.floor(num/100)]} Hundred${num%100 ? ` ${integerToWords(num%100)}` : ''}`;
        if (num < 100000) return `${integerToWords(Math.floor(num/1000))} Thousand${num%1000 ? ` ${integerToWords(num%1000)}` : ''}`;
        if (num < 10000000) return `${integerToWords(Math.floor(num/100000))} Lakh${num%100000 ? ` ${integerToWords(num%100000)}` : ''}`;
        return `${integerToWords(Math.floor(num/10000000))} Crore${num%10000000 ? ` ${integerToWords(num%10000000)}` : ''}`;
      };
      const abs = Math.abs(Number(value) || 0);
      const rupees = Math.floor(abs);
      const paise = Math.round((abs - rupees) * 100);
      return `${value < 0 ? 'Minus ' : ''}${rupees === 0 ? 'Zero' : integerToWords(rupees)} Rupees${paise > 0 ? ` and ${integerToWords(paise)} Paise` : ''} Only`;
    };

    const formatAmount = (val: number, withSymbol = false) => {
      const abs = Math.abs(Number(val || 0));
      const formatted = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const prefixed = `${withSymbol ? `${currencySymbol} ` : ''}${formatted}`;
      return Number(val) < 0 ? `-${prefixed}` : prefixed;
    };

    const printableAdditionalLedgers = additionalLedgers
      .filter(e => e.ledger_id)
      .map(entry => ({ entry, ledger: ledgers.find(l => l.id === entry.ledger_id) }));

    const itemRows = inventoryItems.filter(i => i.item_id).map((item, idx) => {
      const itemMaster = items.find(i => i.id === item.item_id);
      const unit = itemMaster?.uom_master?.symbol || itemMaster?.uom_master?.name || '';
      return `<tr>
        <td class="num">${idx + 1}</td>
        <td class="desc-cell"><strong>${itemMaster?.name || ''}</strong></td>
        <td class="num">${Number(item.quantity).toFixed(2)} ${unit}</td>
        <td class="num">${formatAmount(Number(item.rate))}</td>
        <td class="unit">${unit}</td>
        <td class="num"><strong>${formatAmount(Number(item.amount))}</strong></td>
      </tr>`;
    }).join('');

    const additionalRows = printableAdditionalLedgers.map(({ entry, ledger }) => {
      const amount = Number(entry.amount || 0);
      const labelPrefix = amount < 0 ? '<span class="less">Less :</span>' : '';
      return `<tr>
        <td></td>
        <td class="desc-cell">${labelPrefix}<span class="adj-ledger">${ledger?.name || ''}</span></td>
        <td class="num"></td><td class="num"></td><td class="unit"></td>
        <td class="num">${formatAmount(amount)}</td>
      </tr>`;
    }).join('');

    const itemsAmountTotal = inventoryItems.reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const additionalAmountTotal = printableAdditionalLedgers.reduce((sum, x) => sum + Number(x.entry.amount || 0), 0);
    const columnTotalAmount = itemsAmountTotal + additionalAmountTotal;
    const totalQty = inventoryItems.reduce((sum, i) => sum + Number(i.quantity || 0), 0);
    const firstUnit = (() => {
      const first = inventoryItems.find(i => i.item_id);
      const master = first ? items.find(i => i.id === first.item_id) : null;
      return master?.uom_master?.symbol || master?.uom_master?.name || '';
    })();

    const partyLedger = ledgers.find(l => l.id === (voucherToPrint.ledger_id || formData.ledger_id));
    const partyName = partyLedger?.name || voucherToPrint.ledger_name || '';
    const printTitle = isSales
      ? (actualVoucherType === 'credit-note' ? 'CREDIT NOTE' : 'INVOICE')
      : (actualVoucherType === 'debit-note' ? 'DEBIT NOTE' : 'PURCHASE');
    const partyRoleLabel = isSales ? 'Customer (Bill to)' : 'Supplier';

    printWindow.document.write(`
      <html><head>
        <title>${printTitle} - ${voucherToPrint.voucher_number}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 10px; color: #000; }
          .title { text-align: center; font-size: 30px; font-weight: 700; margin-bottom: 8px; }
          .outer, .items, .bottom { width: 100%; border-collapse: collapse; }
          .outer td, .outer th, .items td, .items th, .bottom td { border: 1px solid #000; vertical-align: top; }
          .cell-pad { padding: 6px; }
          .label { font-size: 12px; }
          .value { font-size: 28px; font-weight: 700; }
          .items th { font-size: 12px; font-weight: 600; text-align: center; padding: 4px; }
          .items td { font-size: 12px; padding: 4px; }
          .num { text-align: right; white-space: nowrap; }
          .unit { text-align: center; white-space: nowrap; }
          .desc-cell { padding-left: 8px; }
          .less { font-style: italic; margin-right: 6px; }
          .adj-ledger { font-weight: 700; font-style: italic; }
          .totals td { font-weight: 700; font-size: 14px; }
          .amount-words { font-size: 13px; font-weight: 700; }
          .sign-box { text-align: right; vertical-align: bottom; height: 80px; }
        </style>
      </head><body>
        <div class="title">${printTitle}</div>
        <table class="outer">
          <tr>
            <td style="width:50%" class="cell-pad" rowspan="2">
              <div class="value">${selectedCompany?.name || ''}</div>
              <div>State Name : ${(selectedCompany as any)?.state || ''}, Code : ${(selectedCompany as any)?.state_code || ''}</div>
              <div>E-Mail : ${(selectedCompany as any)?.email || ''}</div>
            </td>
            <td style="width:25%" class="cell-pad"><div class="label">Voucher No.</div><div>${voucherToPrint.voucher_number}</div></td>
            <td style="width:25%" class="cell-pad"><div class="label">Dated</div><div>${voucherToPrint.voucher_date}</div></td>
          </tr>
          <tr>
            <td class="cell-pad"><div class="label">Reference No.</div><div>${voucherToPrint.reference_number || ''}</div></td>
            <td class="cell-pad"><div class="label">Reference Date</div><div>${voucherToPrint.reference_date || ''}</div></td>
          </tr>
          <tr>
            <td class="cell-pad" style="height:90px">
              <div class="label">${partyRoleLabel}</div>
              <div class="value">${partyName}</div>
            </td>
            <td colspan="2"></td>
          </tr>
        </table>
        <table class="items">
          <tr>
            <th style="width:5%">Sl No.</th>
            <th style="width:54%">Description of Goods</th>
            <th style="width:10%">Quantity</th>
            <th style="width:10%">Rate</th>
            <th style="width:5%">per</th>
            <th style="width:16%">Amount</th>
          </tr>
          ${itemRows}
          ${additionalRows}
          <tr class="totals">
            <td></td>
            <td class="num">Total</td>
            <td class="num">${Number(totalQty).toFixed(2)} ${firstUnit}</td>
            <td></td><td></td>
            <td class="num">${formatAmount(columnTotalAmount, true)}</td>
          </tr>
        </table>
        <table class="bottom">
          <tr>
            <td class="cell-pad"><div class="label">Narration</div><div>${voucherToPrint.narration || '-'}</div></td>
          </tr>
          <tr>
            <td class="cell-pad">
              <div class="label">Amount Chargeable (in words)</div>
              <div class="amount-words">INR ${numberToWords(columnTotalAmount)}</div>
            </td>
          </tr>
          <tr>
            <td class="cell-pad sign-box">
              <div><strong>for ${selectedCompany?.name || ''}</strong></div>
              <div style="margin-top:38px">Authorised Signatory</div>
            </td>
          </tr>
        </table>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { try { printWindow.print(); } catch {} }, 100);
  };

  if (!selectedCompany) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto text-center mt-10">
          <h2 className="text-xl font-semibold text-muted-foreground">
            Please select a company to create {isSales ? 'sales' : 'purchase'} vouchers
          </h2>
        </div>
      </div>
    );
  }

  const handleLedgerCreated = (ledger: { id: string; name: string; group_name: string; tax_type?: string }) => {
    const newEntry = { ...ledger, tax_type: ledger.tax_type || '', ledger_groups: { name: ledger.group_name } };
    setLedgers(prev => [...prev, newEntry]);
    setLedgersState(prev => [...prev, newEntry]);
  };

  const handleItemCreated = (item: { id: string; name: string; enable_batches?: boolean; tax_rate?: number; igst_rate?: number; cgst_rate?: number; sgst_rate?: number; sales_rate?: number; purchase_rate?: number }) => {
    setItems(prev => [...prev, item]);
  };

  const voucherNumberLabel = isSales
    ? (actualVoucherType === 'credit-note' ? 'Note Number' : 'Invoice Number')
    : (actualVoucherType === 'debit-note' ? 'Note Number' : 'Bill Number');
  const voucherDateLabel = isSales
    ? (actualVoucherType === 'credit-note' ? 'Note Date' : 'Invoice Date')
    : (actualVoucherType === 'debit-note' ? 'Note Date' : 'Bill Date');
  const cardDetailsTitle = isSales
    ? (actualVoucherType === 'credit-note' ? 'Credit Note Details' : 'Invoice Details')
    : (actualVoucherType === 'debit-note' ? 'Debit Note Details' : 'Purchase Details');

  return (
    <div className="bg-background h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 bg-background border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Button variant="ghost" onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/dashboard'); }} className="mr-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">{formTitle}</h1>
          </div>
          {savedVoucher && (
            <Button onClick={() => handlePrint()} variant="outline">
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">

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

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{cardDetailsTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{partyLabel}</Label>
                  <div className="flex gap-2">
                    <SearchableDropdown
                      value={formData.ledger_id}
                      onValueChange={(value) => setFormData({ ...formData, ledger_id: value })}
                      placeholder={`Select ${partyLabel}`}
                      options={ledgers
                        .filter((ledger) => {
                          const directGroup = ledger.group_name;
                          const parentGroup = ledger.ledger_groups?.parent_group?.name;
                          const targetGroups = ['Sundry Debtors', 'Sundry Creditors', 'Cash-in-Hand', 'Current Liabilities'];
                          return targetGroups.includes(directGroup) || targetGroups.includes(parentGroup);
                        })
                        .map((ledger) => ({ value: ledger.id, label: `${ledger.name} (${ledger.group_name})` }))}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => {
                      setQuickCreateLedgerDefaultGroup(partyDefaultGroup);
                      setQuickCreateLedgerOpen(true);
                    }}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <Label>{inventoryLedgerLabel}</Label>
                  <div className="flex gap-2">
                    <SearchableDropdown
                      value={selectedInventoryLedgerId}
                      onValueChange={setSelectedInventoryLedgerId}
                      placeholder={`Select ${isSales ? 'Sales' : 'Purchase'} Ledger`}
                      options={ledgers
                        .filter((ledger) => inventoryLedgerGroups.includes(ledger.ledger_groups?.name) || inventoryLedgerGroups.includes(ledger.group_name))
                        .map((ledger) => ({ value: ledger.id, label: ledger.name }))}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => {
                      setQuickCreateLedgerDefaultGroup(undefined);
                      setQuickCreateLedgerOpen(true);
                    }}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <Label>{voucherNumberLabel}</Label>
                  <Input
                    value={formData.voucher_number}
                    onChange={(e) => setFormData({ ...formData, voucher_number: e.target.value })}
                    placeholder="Enter number"
                    required
                  />
                </div>

                <div>
                  <Label>{voucherDateLabel}</Label>
                  <Input
                    type="date"
                    value={formData.voucher_date}
                    onChange={(e) => setFormData({ ...formData, voucher_date: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <Label>Reference Number</Label>
                  <Input
                    value={formData.reference_number}
                    onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                    placeholder="Enter reference number"
                  />
                </div>

                <div>
                  <Label>Reference Date</Label>
                  <Input
                    type="date"
                    value={formData.reference_date}
                    onChange={(e) => setFormData({ ...formData, reference_date: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Narration</Label>
                <Textarea
                  value={formData.narration}
                  onChange={(e) => setFormData({ ...formData, narration: e.target.value })}
                  placeholder="Enter description"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Items</CardTitle>
                <Button type="button" onClick={addInventoryItem} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {inventoryItems.map((item, index) => {
                  const selectedItemMaster = items.find(i => i.id === item.item_id);
                  const isBatchEnabled = selectedItemMaster?.enable_batches === true;
                  const isReadOnly = !!(isBatchEnabled && Array.isArray(item.batch_allocations) && item.batch_allocations.length > 0);
                  return (
                    <div key={item.id} className="p-4 border rounded-lg space-y-3">
                      <div>
                        <Label>Item</Label>
                        <div className="flex gap-1">
                          <Input
                            className="w-full"
                            list="inventory-items-datalist"
                            placeholder="Type or select item"
                            value={itemSearchByRow[item.id] ?? selectedItemMaster?.name ?? ''}
                            onChange={(e) => handleInventoryItemSearchChange(index, item.id, e.target.value)}
                            onBlur={() => handleInventoryItemSearchBlur(index, item.id)}
                          />
                          <datalist id="inventory-items-datalist">
                            {items.map((product) => (
                              <option key={product.id} value={product.name} />
                            ))}
                          </datalist>
                          <Button type="button" variant="outline" size="sm" onClick={() => setQuickCreateItemOpen(true)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant={item.batch_id ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => openBatchSelection(index)}
                            disabled={!item.item_id || !isBatchEnabled}
                            title={!isBatchEnabled ? 'Batches disabled for this item' : (item.batch_id ? 'Batch selected' : 'Select batch')}
                          >
                            <Package className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className={`grid gap-2 items-end ${showDiscountColumn ? 'grid-cols-[repeat(9,1fr)]' : 'grid-cols-[repeat(7,1fr)]'}`}>
                        <div>
                          <Label>Qty</Label>
                          <Input type="number" value={item.quantity}
                            onChange={(e) => updateInventoryItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                            min="0" step="1" readOnly={isReadOnly} className={isReadOnly ? 'bg-muted' : ''} />
                        </div>
                        <div>
                          <Label>Rate</Label>
                          <Input type="number" value={item.rate}
                            onChange={(e) => updateInventoryItem(index, 'rate', parseFloat(e.target.value) || 0)}
                            min="0" step="0.01" readOnly={isReadOnly} className={isReadOnly ? 'bg-muted' : ''} />
                        </div>
                        {showDiscountColumn && (
                          <>
                            <div>
                              <Label>Disc %</Label>
                              <Input type="number" value={item.discount_percent}
                                onChange={(e) => updateInventoryItem(index, 'discount_percent', parseFloat(e.target.value) || 0)}
                                min="0" step="0.01" />
                            </div>
                            <div>
                              <Label>Disc Amt</Label>
                              <Input type="number" value={item.discount_amount} readOnly className="bg-muted" />
                            </div>
                          </>
                        )}
                        <div>
                          <Label>Amount</Label>
                          <Input value={item.amount.toFixed(2)} readOnly className="bg-muted" />
                        </div>
                        {isTaxEnabled && (
                          <>
                            <div>
                              <Label>Tax %</Label>
                              <Input type="number" value={item.tax_percent}
                                onChange={(e) => updateInventoryItem(index, 'tax_percent', parseFloat(e.target.value) || 0)}
                                min="0" step="0.01" />
                            </div>
                            <div>
                              <Label>{taxLabel}</Label>
                              <Input value={item.tax_amount.toFixed(2)} readOnly className="bg-muted" />
                            </div>
                            <div>
                              <Label>Net Amt</Label>
                              <Input value={item.net_amount.toFixed(2)} readOnly className="bg-muted" />
                            </div>
                          </>
                        )}
                        <div className="flex items-end justify-center">
                          <Button type="button" variant="outline" size="sm"
                            onClick={() => removeInventoryItem(index)}
                            disabled={inventoryItems.length === 1}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 flex justify-end">
                <div className="w-64 space-y-2 text-right">
                  <div className="flex justify-between font-medium">
                    <span>Sub Total:</span>
                    <span>{currencySymbol} {formData.total_amount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Additional Ledger Entries</CardTitle>
                <Button type="button" onClick={addAdditionalLedger} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Ledger
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {additionalLedgers.length > 0 ? (
                <div className="space-y-4">
                  {additionalLedgers.map((entry) => (
                    <div key={entry.id} className="flex gap-4 items-end">
                      <div className="flex-1">
                        <Label>Ledger</Label>
                        <div className="flex gap-2">
                          <SearchableDropdown
                            value={entry.ledger_id}
                            onValueChange={(value) => handleAdditionalLedgerChange(entry.id, value)}
                            placeholder="Select Ledger"
                            options={ledgers.map((ledger) => ({ value: ledger.id, label: `${ledger.name} (${ledger.group_name})` }))}
                          />
                          <Button type="button" variant="outline" size="sm" onClick={() => {
                            setQuickCreateLedgerDefaultGroup(undefined);
                            setQuickCreateLedgerOpen(true);
                          }}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="w-48">
                        <Label>Amount</Label>
                        <Input type="number" step="0.01" value={entry.amount}
                          onChange={(e) => handleAdditionalAmountChange(entry.id, parseFloat(e.target.value) || 0)}
                          placeholder="0.00" />
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => removeAdditionalLedger(entry.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No additional ledger entries. Click "Add Ledger" to add expense/tax entries.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium">{taxLabel}:</span>
                  <span className="font-semibold">{currencySymbol}{formData.tax_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-lg border-t pt-3">
                  <span className="font-bold">Net Amount:</span>
                  <span className="font-bold text-primary">{currencySymbol}{formData.net_amount.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end space-x-4">
            <Button type="button" variant="outline" onClick={() => navigate('/dashboard')}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : `${isEditMode ? 'Update' : 'Save'} ${invoiceLabel}`}
            </Button>
            {savedVoucher && (
              <Button type="button" onClick={() => handlePrint()} variant="outline">
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            )}
          </div>
        </form>
      </div>

      {selectedItemForBatch && selectedCompany && (
        <>
          <BatchSelectionDialog
            open={batchDialogOpen}
            onClose={() => { setBatchDialogOpen(false); setSelectedItemForBatch(null); }}
            itemId={selectedItemForBatch.itemId}
            itemName={selectedItemForBatch.itemName}
            requiredQuantity={selectedItemForBatch.quantity}
            companyId={selectedCompany.id}
            onBatchSelect={handleBatchSelect}
          />
          <BatchAllocationDialog
            open={batchAllocationDialogOpen}
            onClose={() => { setBatchAllocationDialogOpen(false); setSelectedItemForBatch(null); }}
            itemId={selectedItemForBatch.itemId}
            itemName={selectedItemForBatch.itemName}
            requiredQuantity={selectedItemForBatch.quantity}
            companyId={selectedCompany.id}
            onBatchAllocationsSelect={handleBatchAllocationsSelect}
            batchesEnabled={true}
            initialAllocations={selectedItemForBatch.batch_allocations}
            companySettings={selectedCompany}
            itemData={selectedItemForBatch.itemData}
          />
        </>
      )}

      <QuickCreateLedgerDialog
        open={quickCreateLedgerOpen}
        onClose={() => setQuickCreateLedgerOpen(false)}
        onCreated={handleLedgerCreated}
        defaultGroupName={quickCreateLedgerDefaultGroup}
      />
      <QuickCreateItemDialog
        open={quickCreateItemOpen}
        onClose={() => setQuickCreateItemOpen(false)}
        onCreated={handleItemCreated}
      />
      </div>
    </div>
  );
};

export default InventoryForm;
