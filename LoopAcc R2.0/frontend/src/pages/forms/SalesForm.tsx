import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
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

interface SalesItem {
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
  batch_qty?: number; // Quantity allocated to specific batch
  batch_allocations?: any[]; // Array of batch allocations for editing
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
  isAutoCalculated?: boolean; // Track if amount is auto-calculated or manually edited
}

interface SalesFormProps {
  voucherType?: 'sales' | 'credit-note';
}

const SalesForm = ({ voucherType = 'sales' }: SalesFormProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo;
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const isTaxEnabled = isCompanyTaxEnabled(selectedCompany);
  const companyTaxType = getCompanyTaxType(selectedCompany);
  const [loading, setLoading] = useState(false);
  
  // Determine actual voucher type (from prop or fallback)
  const actualVoucherType = voucherType || 'sales';
  // Dynamic tax label based on company tax type and tax enabled status
  const taxLabel = isTaxEnabled ? getCompanyTaxLabel(selectedCompany) : 'Tax Amount';
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [ledgersState, setLedgersState] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [savedVoucher, setSavedVoucher] = useState<any>(null);
  const [itemSearchByRow, setItemSearchByRow] = useState<Record<string, string>>({});
  const [showDiscountColumn, setShowDiscountColumn] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchAllocationDialogOpen, setBatchAllocationDialogOpen] = useState(false);
  const [selectedItemForBatch, setSelectedItemForBatch] = useState<{index: number; itemId: string; itemName: string; quantity: number; batch_allocations?: any[]; itemData?: any} | null>(null);
  
  // Edit mode detection
  const searchParams = new URLSearchParams(location.search);
  const editVoucherId = searchParams.get('edit');
  const isEditMode = !!editVoucherId;
  
  // Get display text based on voucher type
  const formTitle = actualVoucherType === 'credit-note' 
    ? (isEditMode ? 'Edit Credit Note' : 'Create Credit Note')
    : (isEditMode ? 'Edit Sales Invoice' : 'Create Sales Invoice');
  
  const invoiceLabel = actualVoucherType === 'credit-note' ? 'Credit Note' : 'Sales Invoice';
  
  const [formData, setFormData] = useState({
    ledger_id: '',
    voucher_number: '',
    voucher_date: new Date().toISOString().split('T')[0],
    reference_number: '',
    reference_date: '',
    narration: '',
    total_amount: 0,
    tax_amount: 0,
    net_amount: 0
  });

  // Sales ledger selection for automatic ledger entry creation
  const [selectedSalesLedgerId, setSelectedSalesLedgerId] = useState<string>('');
  
  const [salesItems, setSalesItems] = useState<SalesItem[]>([{
    id: '1',
    item_id: '',
    quantity: 1,
    rate: 0,
    discount_percent: 0,
    discount_amount: 0,
    tax_percent: 0,
    amount: 0,
    tax_amount: 0,
    net_amount: 0
  }]);
  const currencySymbol = selectedCompany?.currency === 'INR' ? '₹' : selectedCompany?.currency === 'USD' ? '$' : selectedCompany?.currency || '₹';

  const [additionalLedgers, setAdditionalLedgers] = useState<AdditionalLedgerEntry[]>([]);
  useEffect(() => {
    if (!selectedCompany) return;

    const initializeData = async () => {
      const loadedLedgers = await fetchInitialData();
      if (isEditMode && editVoucherId) {
        await loadExistingVoucher(editVoucherId, loadedLedgers || []);
      } else {
        await generateInvoiceNumber();
      }
    };

    initializeData();
  }, [selectedCompany, isEditMode, editVoucherId]);

  // Update showDiscountColumn based on company settings
  useEffect(() => {
    if (selectedCompany?.settings) {
      const isDiscountEnabled = selectedCompany.settings.show_discount_column === "true";
      setShowDiscountColumn(isDiscountEnabled);
    }
  }, [selectedCompany]);

  const generateInvoiceNumber = async () => {
    if (!selectedCompany) return;
    
    try {
      // Determine which settings keys to fetch based on voucher type
      const settingKeys = actualVoucherType === 'credit-note' 
        ? 'credit_note_prefix,credit_note_starting_number'
        : 'invoice_prefix,invoice_starting_number';
      
      // Fetch settings for invoice prefix and starting number from backend API
      const settingsResponse = await fetch(
        `http://localhost:5000/api/settings?companyId=${selectedCompany.id}&keys=${settingKeys}`
      );
      
      let prefix = actualVoucherType === 'credit-note' ? 'CN' : 'INV';
      let startingNumber = 1;
      
      if (settingsResponse.ok) {
        const settingsResult = await settingsResponse.json();
        const settingsData = settingsResult.data || [];
        
        const prefixSetting = settingsData.find(s => 
          actualVoucherType === 'credit-note'
            ? s.setting_key === 'credit_note_prefix'
            : s.setting_key === 'invoice_prefix'
        );
        const numberSetting = settingsData.find(s => 
          actualVoucherType === 'credit-note'
            ? s.setting_key === 'credit_note_starting_number'
            : s.setting_key === 'invoice_starting_number'
        );
        
        if (prefixSetting) prefix = String(prefixSetting.setting_value || (actualVoucherType === 'credit-note' ? 'CN' : 'INV'));
        if (numberSetting) startingNumber = parseInt(String(numberSetting.setting_value || '1'));
      }
      
      // Get the last invoice number for this company from backend API
      const vouchersResponse = await fetch(
        `http://localhost:5000/api/vouchers?companyId=${selectedCompany.id}`
      );
      
      let nextNumber = startingNumber;
      if (vouchersResponse.ok) {
        const vouchersResult = await vouchersResponse.json();
        const allVouchers = vouchersResult.data || [];
        
        // Filter for the correct voucher type and get the last one
        const lastVoucher = allVouchers
          .filter(v => v.voucher_type === actualVoucherType)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          [0];
        
        if (lastVoucher) {
          const lastNumber = lastVoucher.voucher_number.replace(prefix, '');
          nextNumber = parseInt(lastNumber) + 1;
        }
      }
      
      const voucherNumber = `${prefix}${nextNumber.toString().padStart(4, '0')}`;
      setFormData(prev => ({ ...prev, voucher_number: voucherNumber }));
    } catch (error) {
      console.error('Error generating invoice number:', error);
    }
  };

  const fetchInitialData = async () => {
    if (!selectedCompany) return [];
    let ledgersWithGroupNames: any[] = [];
    
    try {
      const [ledgersRes, itemsRes] = await Promise.all([
        fetch(`http://localhost:5000/api/ledgers?companyId=${selectedCompany.id}`),
        fetch(`http://localhost:5000/api/items?companyId=${selectedCompany.id}`)
      ]);

      const ledgersJson = await ledgersRes.json();
      const itemsJson = await itemsRes.json();

      if (ledgersJson.success && ledgersJson.data) {
        // Debug: Log raw backend response
        console.log('Raw ledgers from backend:', ledgersJson.data.slice(0, 2));
        console.log('First ledger raw:', JSON.stringify(ledgersJson.data[0], null, 2));
        
        // Backend already provides ledger_groups via aggregation with parent_group
        ledgersWithGroupNames = ledgersJson.data.map((ledger: any) => ({
          ...ledger,
          group_name: ledger.ledger_groups?.name || 'Unknown'
        }));
        
        // Debug: Log all ledgers and their groups
        console.log('All ledgers from backend:', ledgersWithGroupNames.map((l: any) => ({
          id: l.id,
          name: l.name,
          group_name: l.group_name,
          parent_group: l.ledger_groups?.parent_group?.name,
          full_ledger_groups: l.ledger_groups
        })));
        console.log('First ledger full structure:', ledgersWithGroupNames[0]);
        
        setLedgers(ledgersWithGroupNames);
        setLedgersState(ledgersWithGroupNames);
      }
      if (itemsJson.success && itemsJson.data) {
        setItems(itemsJson.data);
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
      setLedgers([]);
      setLedgersState([]);
      setItems([]);
    }
    return ledgersWithGroupNames;
  };

  const loadExistingVoucher = async (voucherId: string, preloadedLedgers: any[] = []) => {
    if (!selectedCompany) return;
    
    try {
      setLoading(true);
      
      // Load voucher from backend API
      const response = await fetch(`http://localhost:5000/api/vouchers/${voucherId}`);
      
      if (!response.ok) {
        throw new Error('Failed to load voucher');
      }
      
      const result = await response.json();
      const voucher = result.data;
      
      const voucherDetails = voucher.details || [];
      let loadedSalesItemsData: SalesItem[] = [];
      let loadedAdditionalLedgersData: AdditionalLedgerEntry[] = [];

      // Separate item-based and ledger-based voucher details
      const itemDetails = voucherDetails.filter((d: any) => d.item_id) || [];
      const ledgerDetails = voucherDetails.filter((d: any) => d.ledger_id && !d.item_id) || [];
      const availableLedgers =
        (preloadedLedgers && preloadedLedgers.length > 0
          ? preloadedLedgers
          : (ledgersState.length > 0 ? ledgersState : ledgers)) || [];
      
      // Find and extract the sales ledger (isinventory = "yes")
      const salesLedgerDetail =
        ledgerDetails.find((d: any) => d.isinventory === "yes") ||
        ledgerDetails.find((d: any) => {
          if (!d?.ledger_id || d.ledger_id === voucher.ledger_id) return false;
          const ledger = availableLedgers.find((l: any) => l.id === d.ledger_id);
          const classifier = `${ledger?.group_name || ''} ${ledger?.name || ''}`.toLowerCase();
          return classifier.includes('sale');
        });
      const resolvedSalesLedgerId = salesLedgerDetail?.ledger_id || '';
      if (resolvedSalesLedgerId) {
        setSelectedSalesLedgerId(resolvedSalesLedgerId);
      }
      
      // Set form data
      setFormData({
        ledger_id: voucher.ledger_id,
        voucher_number: voucher.voucher_number,
        voucher_date: voucher.voucher_date,
        reference_number: voucher.reference_number || '',
        reference_date: voucher.reference_date || '',
        narration: voucher.narration || '',
        total_amount: voucher.total_amount,
        tax_amount: voucher.tax_amount,
        net_amount: voucher.net_amount
      });
      
      // Set sales items
      if (itemDetails && itemDetails.length > 0) {
        const salesItemsData = itemDetails.map((detail: any, index: number) => {
          const itemMaster = items.find((item: any) => item.id === detail.item_id);
          const hydratedItem = {
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
              tax_rate: Number(itemMaster?.tax_rate || detail.tax_percent || 0)
            }
          };

          // Force recalculation so edit-mode lines always have current tax % and tax amount.
          return calculateItemAmounts(hydratedItem);
        });
        loadedSalesItemsData = salesItemsData;
        setSalesItems(salesItemsData);
      }

      // Set additional ledger entries (excluding customer/supplier and sales/purchase ledgers)
      if (ledgerDetails && ledgerDetails.length > 0) {
        const partyLedgerId = voucher.ledger_id;
        const inventoryLedgerId = resolvedSalesLedgerId;

        // Filter out party ledgers (customer/supplier) and inventory ledgers (sales/purchase)
        // Only include tax/expense ledgers where isparty="no" and isinventory="no"
        const additionalLedgersData = ledgerDetails
          .filter((detail: any) => {
            // Exclude if it's a party ledger (customer/supplier)
            if (detail.isparty === "yes") return false;
            if (detail.ledger_id === partyLedgerId) return false;
            // Exclude if it's an inventory ledger (sales/purchase)
            if (detail.isinventory === "yes") return false;
            if (inventoryLedgerId && detail.ledger_id === inventoryLedgerId) return false;
            // Include only tax/expense ledgers
            return true;
          })
          .map((detail: any, index: number) => {
            const matchedLedger = availableLedgers.find(
              (l: any) => l.id === detail.ledger_id,
            );
            const isTaxLedger =
              matchedLedger?.group_name === 'Duties & Taxes' &&
              ['IGST', 'CGST', 'SGST', 'VAT'].includes(matchedLedger?.tax_type);

            return {
              id: (index + 1).toString(),
              ledger_id: detail.ledger_id || '',
              amount: detail.amount,
              // Keep non-tax ledgers manual; auto-recalculate tax ledgers on edit changes.
              isAutoCalculated: isTaxLedger
            };
          });
        loadedAdditionalLedgersData = additionalLedgersData;
        setAdditionalLedgers(additionalLedgersData);
      }

      if (loadedSalesItemsData.length > 0) {
        const recalculatedTaxLedgers = updateTaxLedgersAutomatically(
          loadedSalesItemsData,
          loadedAdditionalLedgersData,
        );
        calculateTotals(loadedSalesItemsData, recalculatedTaxLedgers);
      }
      
      setSavedVoucher(voucher);
      
    } catch (error) {
      console.error('Error loading existing voucher:', error);
      toast({
        title: "Error",
        description: "Failed to load voucher data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateItemAmounts = (item: SalesItem) => {
    const amount = item.quantity * item.rate;
    const discountAmount = (amount * item.discount_percent) / 100;
    const discountedAmount = amount - discountAmount;

    if (!isTaxEnabled) {
      return {
        ...item,
        amount,
        discount_amount: discountAmount,
        tax_percent: 0,
        tax_amount: 0,
        net_amount: discountedAmount,
      };
    }
    
    // Determine which tax rate to use based on item data
    let applicableTaxRate = item.tax_percent || 0;
    const selectedTaxType = companyTaxType;
    
    if (item.itemData) {
      // For GST company: use IGST if IGST rate is available, else use CGST+SGST
      if (selectedTaxType === 'GST') {
        if (item.itemData.igst_rate && item.itemData.igst_rate > 0) {
          applicableTaxRate = item.itemData.igst_rate;
        } else if (item.itemData.cgst_rate && item.itemData.sgst_rate) {
          applicableTaxRate = item.itemData.cgst_rate + item.itemData.sgst_rate;
        } else {
          applicableTaxRate = item.itemData.tax_rate || 0;
        }
      } else {
        // For VAT company: use VAT rate
        applicableTaxRate = item.itemData.tax_rate || 0;
      }
    }
    
    const tax_amount = (discountedAmount * applicableTaxRate) / 100;
    const net_amount = discountedAmount + tax_amount;
    return { ...item, amount, discount_amount: discountAmount, tax_percent: applicableTaxRate, tax_amount, net_amount };
  };

  const calculateTaxByType = (itemsToCalculate: SalesItem[], taxType: string) => {
    if (!isTaxEnabled) {
      return 0;
    }

    // Calculate tax amount based on specific item master rates for each tax type
    let totalTax = 0;
    const selectedTaxType = companyTaxType;
    
    console.log('=== calculateTaxByType ===');
    console.log('Tax Type:', taxType);
    console.log('Items to Calculate:', itemsToCalculate);
    console.log('Items lookup array:', items);
    
    itemsToCalculate.forEach((item, index) => {
      // Skip empty items
      if (!item.item_id) {
        console.log(`Item ${index}: Skipped (no item_id)`);
        return;
      }
      
      console.log(`\nProcessing Item ${index}:`, {
        item_id: item.item_id,
        quantity: item.quantity,
        rate: item.rate,
        discount: item.discount_percent,
        itemData: item.itemData
      });
      
      // Get item data from itemData or build it from item master if not set
      let itemTaxData = item.itemData;
      if (!itemTaxData && item.item_id) {
        // Fallback: fetch from items list
        const itemMaster = items.find(i => i.id === item.item_id);
        console.log('Fetching from item master:', itemMaster);
        
        if (itemMaster) {
          itemTaxData = {
            cgst_rate: itemMaster.cgst_rate || 0,
            sgst_rate: itemMaster.sgst_rate || 0,
            igst_rate: itemMaster.igst_rate || 0,
            tax_rate: itemMaster.tax_rate || 0
          };
          console.log('Built itemTaxData from itemMaster:', itemTaxData);
        }
      }
      
      const amount = item.quantity * item.rate;
      const discountAmount = (amount * item.discount_percent) / 100;
      const discountedAmount = amount - discountAmount;
      
      console.log(`Amounts - Gross: ${amount}, Discount: ${discountAmount}, Discounted: ${discountedAmount}`);
      
      // Use the specific tax rate for the selected tax type.
      // Fallback to item's effective tax_percent when itemData is not available.
      const fallbackRate = Number(item.tax_percent || 0);
      const resolvedRateByType = {
        CGST: itemTaxData?.cgst_rate || (selectedTaxType === 'GST' ? fallbackRate / 2 : 0),
        SGST: itemTaxData?.sgst_rate || (selectedTaxType === 'GST' ? fallbackRate / 2 : 0),
        IGST: itemTaxData?.igst_rate || fallbackRate,
        VAT: itemTaxData?.tax_rate || fallbackRate,
      } as const;

      if (taxType === 'CGST' && resolvedRateByType.CGST > 0) {
        const taxCalculated = (discountedAmount * resolvedRateByType.CGST) / 100;
        totalTax += taxCalculated;
        console.log(`✓ CGST: ${discountedAmount} × ${resolvedRateByType.CGST}% = ${taxCalculated}`);
      } else if (taxType === 'SGST' && resolvedRateByType.SGST > 0) {
        const taxCalculated = (discountedAmount * resolvedRateByType.SGST) / 100;
        totalTax += taxCalculated;
        console.log(`✓ SGST: ${discountedAmount} × ${resolvedRateByType.SGST}% = ${taxCalculated}`);
      } else if (taxType === 'IGST' && resolvedRateByType.IGST > 0) {
        const taxCalculated = (discountedAmount * resolvedRateByType.IGST) / 100;
        totalTax += taxCalculated;
        console.log(`✓ IGST: ${discountedAmount} × ${resolvedRateByType.IGST}% = ${taxCalculated}`);
      } else if (taxType === 'VAT' && resolvedRateByType.VAT > 0) {
        const taxCalculated = (discountedAmount * resolvedRateByType.VAT) / 100;
        totalTax += taxCalculated;
        console.log(`✓ VAT: ${discountedAmount} × ${resolvedRateByType.VAT}% = ${taxCalculated}`);
      } else {
        console.log(`✗ No matching tax rate for ${taxType}. Available rates:`, itemTaxData || { fallbackRate });
      }
    });
    
    console.log(`\n=== FINAL RESULT ===`);
    console.log(`calculateTaxByType(${taxType}): Total = ${totalTax}`);
    return totalTax;
  };

  const getItemTaxByType = (itemsTaxTotal: number, taxType: string) => {
    const selectedTaxType = companyTaxType;
    
    // For GST company with CGST/SGST: split equally
    if (selectedTaxType === 'GST' && (taxType === 'CGST' || taxType === 'SGST')) {
      return itemsTaxTotal / 2;
    }
    // For IGST (works with both GST and non-GST companies): use full amount
    if (taxType === 'IGST') {
      return itemsTaxTotal;
    }
    // For VAT: use full amount
    if (taxType === 'VAT') {
      return itemsTaxTotal;
    }
    // Default: return 0 for unknown types
    return 0;
  };

  const updateSalesItem = (index: number, field: keyof SalesItem, value: any) => {
    const newItems = [...salesItems];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Auto-populate tax rate when item is selected
    if (field === 'item_id' && value) {
      const selectedItem = items.find(item => item.id === value);
      if (selectedItem) {
        // Store item master tax details for later use
        newItems[index].tax_percent = selectedItem.tax_rate || 0;
        newItems[index].rate = selectedItem.sales_rate || 0;
        // Store the item's individual tax rates from item master
        newItems[index].itemData = {
          cgst_rate: selectedItem.cgst_rate || 0,
          sgst_rate: selectedItem.sgst_rate || 0,
          igst_rate: selectedItem.igst_rate || 0,
          tax_rate: selectedItem.tax_rate || 0
        };
      }
    }
    
    newItems[index] = calculateItemAmounts(newItems[index]);
    setSalesItems(newItems);
    
    // Auto-update tax ledgers when items change
    const updatedTaxLedgers = updateTaxLedgersAutomatically(newItems, additionalLedgers);
    calculateTotals(newItems, updatedTaxLedgers);
  };

  const handleSalesItemSearchChange = (index: number, rowId: string, inputValue: string) => {
    setItemSearchByRow((prev) => ({ ...prev, [rowId]: inputValue }));
    const match = items.find(
      (product) => product.name?.trim().toLowerCase() === inputValue.trim().toLowerCase()
    );
    if (match && salesItems[index]?.item_id !== match.id) {
      updateSalesItem(index, 'item_id', match.id);
    }
  };

  const handleSalesItemSearchBlur = (index: number, rowId: string) => {
    const entered = (itemSearchByRow[rowId] || '').trim();
    const exactMatch = items.find(
      (product) => product.name?.trim().toLowerCase() === entered.toLowerCase()
    );

    if (!entered) {
      setItemSearchByRow((prev) => ({ ...prev, [rowId]: '' }));
      if (salesItems[index]?.item_id) {
        updateSalesItem(index, 'item_id', '');
      }
      return;
    }

    if (exactMatch) {
      if (salesItems[index]?.item_id !== exactMatch.id) {
        updateSalesItem(index, 'item_id', exactMatch.id);
      }
      setItemSearchByRow((prev) => ({ ...prev, [rowId]: exactMatch.name }));
      return;
    }

    const selected = items.find((product) => product.id === salesItems[index]?.item_id);
    setItemSearchByRow((prev) => ({ ...prev, [rowId]: selected?.name || '' }));
  };

  const calculateTotals = (items: SalesItem[], ledgers: AdditionalLedgerEntry[] = additionalLedgers) => {
    // Sub Total = discounted item amount (without tax)
    const items_subtotal = items.reduce(
      (sum, item) => sum + (Number(item.amount || 0) - Number(item.discount_amount || 0)),
      0
    );
    
    // Tax Amount = sum of Duties & Taxes ledgers with tax types (IGST, CGST, SGST, VAT)
    const taxLedgerAmount = isTaxEnabled ? ledgers.reduce((sum, entry) => {
      const ledger = ledgersState.find(l => l.id === entry.ledger_id);
      const isDutiesAndTaxes = ledger?.group_name === 'Duties & Taxes';
      const hasTaxType = ledger?.tax_type && ['IGST', 'CGST', 'SGST', 'VAT'].includes(ledger.tax_type);
      return isDutiesAndTaxes && hasTaxType ? sum + entry.amount : sum;
    }, 0) : 0;
    
    // Other ledger entries (not Duties & Taxes with tax type)
    const otherLedgersTotal = ledgers.reduce((sum, entry) => {
      const ledger = ledgersState.find(l => l.id === entry.ledger_id);
      const isDutiesAndTaxes = ledger?.group_name === 'Duties & Taxes';
      const hasTaxType = ledger?.tax_type && ['IGST', 'CGST', 'SGST', 'VAT'].includes(ledger.tax_type);
      if (!isTaxEnabled) {
        return sum + entry.amount;
      }
      return isDutiesAndTaxes && hasTaxType ? sum : sum + entry.amount;
    }, 0);
    
    const total_amount = items_subtotal + otherLedgersTotal;
    const tax_amount = taxLedgerAmount;
    const net_amount = total_amount + tax_amount;
    
    setFormData(prev => ({ ...prev, total_amount, tax_amount, net_amount }));
  };

  const addSalesItem = () => {
    setSalesItems([...salesItems, {
      id: Date.now().toString(),
      item_id: '',
      quantity: 1,
      rate: 0,
      discount_percent: 0,
      discount_amount: 0,
      tax_percent: 0,
      amount: 0,
      tax_amount: 0,
      net_amount: 0
    }]);
  };

  const removeSalesItem = (index: number) => {
    const newItems = salesItems.filter((_, i) => i !== index);
    setSalesItems(newItems);
    
    // Auto-update tax ledgers when items are removed
    const updatedTaxLedgers = updateTaxLedgersAutomatically(newItems, additionalLedgers);
    calculateTotals(newItems, updatedTaxLedgers);
  };

  const openBatchSelection = (index: number) => {
    const item = salesItems[index];
    if (!item.item_id) {
      toast({
        title: "Select Item First",
        description: "Please select an item before choosing a batch",
        variant: "destructive"
      });
      return;
    }
    const selectedItem = items.find(i => i.id === item.item_id);
    if (!selectedItem) return;
    
    // Check if batches are enabled for this item
    // Default to false if enable_batches is not defined
    const batchesEnabled = selectedItem.enable_batches === true;
    
    setSelectedItemForBatch({
      index,
      itemId: item.item_id,
      itemName: selectedItem.name,
      quantity: item.quantity,
      batch_allocations: item.batch_allocations || [], // Include existing allocations for editing
      itemData: salesItems[index]?.itemData // Add itemData for tax/discount calculations
    });
    
    // Open batch allocation dialog if batches are enabled,
    // otherwise open simple batch selection dialog
    if (batchesEnabled) {
      setBatchAllocationDialogOpen(true);
    } else {
      setBatchDialogOpen(true);
    }
  };

  const handleBatchSelect = (batchId: string | null, allocationMethod?: 'fifo' | 'lifo', qty?: number) => {
    if (selectedItemForBatch) {
      const newItems = [...salesItems];
      newItems[selectedItemForBatch.index].batch_id = batchId;
      // Store batch quantity if provided (from batch allocation dialog)
      if (qty) {
        newItems[selectedItemForBatch.index].batch_qty = qty;
      }
      setSalesItems(newItems);
    }
    setBatchDialogOpen(false);
    setSelectedItemForBatch(null);
  };

  const handleBatchAllocationsSelect = (summary: any) => {
    // summary contains { allocations, totalBatchQty, averageRate, totalAmount, totalDiscount, totalTaxAmount, totalNetAmount }
    if (selectedItemForBatch && summary.allocations && summary.allocations.length > 0) {
      const newItems = [...salesItems];
      const itemIndex = selectedItemForBatch.index;
      
      // Use the first (and should be only if single batch allocation) batch
      if (summary.allocations.length === 1) {
        const alloc = summary.allocations[0];
        newItems[itemIndex].batch_id = alloc.batch_id;
        newItems[itemIndex].batch_qty = alloc.qty;
        newItems[itemIndex].batch_allocations = summary.allocations; // Store allocations for editing
        
        // Update qty, rate, and amount from batch allocation
        newItems[itemIndex].quantity = alloc.qty;
        newItems[itemIndex].rate = alloc.rate;
        newItems[itemIndex].amount = alloc.amount;
        
        // Use tax and discount from batch allocation (if available)
        // These include the tax % calculation from itemData
        newItems[itemIndex].discount_percent = alloc.discount_percent || 0;
        newItems[itemIndex].discount_amount = alloc.discount_amount || 0;
        newItems[itemIndex].tax_percent = alloc.tax_percent || 0;
        newItems[itemIndex].tax_amount = alloc.tax_amount || 0;
        newItems[itemIndex].net_amount = alloc.net_amount || 0;
      } else {
        // Multiple batch allocations - use totals from batch allocation dialog
        newItems[itemIndex].batch_qty = summary.totalBatchQty;
        newItems[itemIndex].quantity = summary.totalBatchQty;
        newItems[itemIndex].rate = summary.averageRate;
        newItems[itemIndex].amount = summary.totalAmount;
        
        // Store all allocations for reference
        newItems[itemIndex].batch_allocations = summary.allocations;
        
        // Use totals from batch allocation dialog (includes all tax/discount calculations)
        newItems[itemIndex].discount_amount = summary.totalDiscount || 0;
        newItems[itemIndex].tax_amount = summary.totalTaxAmount || 0;
        newItems[itemIndex].net_amount = summary.totalNetAmount || 0;
      }
      
      setSalesItems(newItems);
      // Recalculate totals after batch allocation to update tax_amount and other aggregates
      calculateTotals(newItems, additionalLedgers);
      toast({
        title: "Success",
        description: `Batch allocations applied to ${selectedItemForBatch.itemName}`,
      });
    }
    setBatchAllocationDialogOpen(false);
    setSelectedItemForBatch(null);
  };

  const addAdditionalLedger = () => {
    const newId = (Math.max(...additionalLedgers.map(e => parseInt(e.id)), 0) + 1).toString();
    const newLedgers = [...additionalLedgers, {
      id: newId,
      ledger_id: '',
      amount: 0,
      isAutoCalculated: undefined // Start undefined so it can auto-calculate when a tax ledger is selected
    }];
    setAdditionalLedgers(newLedgers);
    calculateTotals(salesItems, newLedgers);
  };

  const removeAdditionalLedger = (entryId: string) => {
    const newLedgers = additionalLedgers.filter(entry => entry.id !== entryId);
    setAdditionalLedgers(newLedgers);
    calculateTotals(salesItems, newLedgers);
  };

  const handleAdditionalLedgerChange = (entryId: string, ledgerId: string) => {
    const selectedLedger = ledgers.find(l => l.id === ledgerId);
    const isDutiesAndTaxes = selectedLedger?.group_name === 'Duties & Taxes';
    const hasTaxType = selectedLedger?.tax_type && ['IGST', 'CGST', 'SGST', 'VAT'].includes(selectedLedger.tax_type);
    const taxType = selectedLedger?.tax_type;
    
    console.log('=== handleAdditionalLedgerChange ===');
    console.log('Selected Ledger:', selectedLedger);
    console.log('Tax Type:', taxType);
    console.log('Is Duties & Taxes:', isDutiesAndTaxes);
    console.log('Has Tax Type:', hasTaxType);
    console.log('Sales Items:', salesItems);
    
    // Calculate tax amount using specific item master rates for this tax type
    const isValidTaxLedger = isTaxEnabled && isDutiesAndTaxes && hasTaxType;
    const taxAmount = isValidTaxLedger ? calculateTaxByType(salesItems, taxType) : 0;
    
    console.log('Calculated Tax Amount:', taxAmount);
    
    // Update the ledger with the calculated amount
    const newLedgers = additionalLedgers.map(entry => {
      if (entry.id === entryId) {
        const updatedEntry = {
          ...entry,
          ledger_id: ledgerId,
          // Auto-populate tax amount using item master CGST/SGST/IGST rates
          amount: isValidTaxLedger ? taxAmount : 0,
          // Mark as auto-calculated only if it's a valid tax ledger
          isAutoCalculated: isValidTaxLedger ? true : false
        };
        console.log('Updated ledger entry:', updatedEntry);
        return updatedEntry;
      }
      return entry;
    });
    
    // Update state and immediately recalculate totals
    setAdditionalLedgers(newLedgers);
    calculateTotals(salesItems, newLedgers);
  };

  const updateTaxLedgersAutomatically = (items: SalesItem[], ledgersToUpdate: AdditionalLedgerEntry[] = additionalLedgers) => {
    // Recalculate all tax ledger entries based on item master CGST/SGST/IGST rates
    const updatedLedgers = ledgersToUpdate.map(entry => {
      const ledger = ledgersState.find(l => l.id === entry.ledger_id);
      const isDutiesAndTaxes = ledger?.group_name === 'Duties & Taxes';
      const hasTaxType = ledger?.tax_type && ['IGST', 'CGST', 'SGST', 'VAT'].includes(ledger.tax_type);
      const taxType = ledger?.tax_type;

      if (!isTaxEnabled && isDutiesAndTaxes && hasTaxType && entry.isAutoCalculated !== false) {
        return { ...entry, amount: 0, isAutoCalculated: true };
      }
      
      // Only update if it's a tax ledger AND it was auto-calculated (isAutoCalculated is true)
      // Don't update if isAutoCalculated is explicitly false (user edited it)
      if (isDutiesAndTaxes && hasTaxType && entry.isAutoCalculated !== false) {
        // Calculate using specific item master rates for this tax type
        const taxAmount = calculateTaxByType(items, taxType);
        return { ...entry, amount: taxAmount, isAutoCalculated: true };
      }
      return entry;
    });
    
    setAdditionalLedgers(updatedLedgers);
    return updatedLedgers;
  };

  useEffect(() => {
    if (additionalLedgers.length === 0) {
      calculateTotals(salesItems, []);
      return;
    }

    const updatedTaxLedgers = updateTaxLedgersAutomatically(salesItems, additionalLedgers);
    calculateTotals(salesItems, updatedTaxLedgers);
  }, [salesItems, ledgersState]);

  const handleAdditionalAmountChange = (entryId: string, amount: number) => {
    const newLedgers = additionalLedgers.map(entry => 
      entry.id === entryId ? { ...entry, amount, isAutoCalculated: false } : entry
    );
    setAdditionalLedgers(newLedgers);
    calculateTotals(salesItems, newLedgers);
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    
    // Validation
    if (!formData.ledger_id || formData.ledger_id === '') {
      toast({
        title: "Validation Error",
        description: "Please select a customer/party.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedSalesLedgerId || selectedSalesLedgerId === '') {
      toast({
        title: "Validation Error",
        description: "Please select a sales ledger.",
        variant: "destructive",
      });
      return;
    }
    
    if (salesItems.length === 0 || salesItems.every(item => !item.item_id || item.item_id === '')) {
      toast({
        title: "Validation Error", 
        description: "Please add at least one item.",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);

    try {
      // Calculate items subtotal (discounted item base, without tax)
      const itemsSubtotal = salesItems.reduce(
        (sum, item) => sum + (Number(item.amount || 0) - Number(item.discount_amount || 0)),
        0
      );
      
      // Create ledger entries for double-entry bookkeeping
      // Sales:        Debit Customer,   Credit Sales/Tax  (normal)
      // Credit Note:  Credit Customer,  Debit Sales/Tax   (reversed = sales return)
      const isReturn = actualVoucherType === 'credit-note';
      const ledgerEntries = [
        {
          company_id: selectedCompany.id,
          ledger_id: formData.ledger_id,
          transaction_date: formData.voucher_date,
          debit_amount: isReturn ? 0 : formData.net_amount,
          credit_amount: isReturn ? formData.net_amount : 0,
          narration: `${invoiceLabel} ${formData.voucher_number}`
        },
        {
          company_id: selectedCompany.id,
          ledger_id: selectedSalesLedgerId,
          transaction_date: formData.voucher_date,
          debit_amount: isReturn ? itemsSubtotal : 0,
          credit_amount: isReturn ? 0 : itemsSubtotal,
          narration: `${invoiceLabel} to ${ledgers.find(l => l.id === formData.ledger_id)?.name}`
        }
      ];

      additionalLedgers.filter(entry => entry.ledger_id && entry.amount > 0).forEach(entry => {
        ledgerEntries.push({
          company_id: selectedCompany.id,
          ledger_id: entry.ledger_id,
          transaction_date: formData.voucher_date,
          debit_amount: isReturn ? entry.amount : 0,
          credit_amount: isReturn ? 0 : entry.amount,
          narration: `Tax/Expense on ${invoiceLabel} ${formData.voucher_number}`
        });
      });

      // Prepare voucher details
      const voucherDetails = [
        ...salesItems
          .filter(item => item.item_id && item.item_id !== '') // Only include items with valid item_id
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
            net_amount: item.net_amount
          })),
        ...additionalLedgers
          .filter(entry => entry.ledger_id && entry.amount > 0)
          .map(entry => ({
            ledger_id: entry.ledger_id,
            amount: entry.amount,
            net_amount: entry.amount,
            quantity: 0,
            rate: 0,
            tax_percent: 0,
            tax_amount: 0,
            debit_amount: isReturn ? entry.amount : 0,
            credit_amount: isReturn ? 0 : entry.amount
          }))
      ];

      // Prepare payload for backend API
      const voucherPayload = {
        id: editVoucherId || undefined,
        ...formData,
        reference_date: formData.reference_date ? formData.reference_date : null,
        company_id: selectedCompany.id,
        voucher_type: actualVoucherType,
        details: voucherDetails,
        ledger_entries: ledgerEntries.filter(entry => entry.ledger_id && entry.ledger_id !== '')
      };

      let voucher: any = null;
      const apiUrl = isEditMode && editVoucherId 
        ? `http://localhost:5000/api/vouchers/${editVoucherId}`
        : `http://localhost:5000/api/vouchers`;
      
      const method = isEditMode && editVoucherId ? 'PUT' : 'POST';
      
      const response = await fetch(apiUrl, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(voucherPayload)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `Failed to ${isEditMode ? 'update' : 'create'} voucher`);
      }

      const result = await response.json();
      voucher = result.data;

      setSavedVoucher(voucher);
      toast({
        title: "Success",
        description: isEditMode 
          ? `${invoiceLabel} updated successfully!` 
          : `${invoiceLabel} created successfully!`
      });

      // Auto-print after save using the freshly returned voucher.
      handlePrint(voucher);

      // After save: if opened from a report, go back there. If editing, go back.
      // Otherwise, stay on the form and reset to allow creating another invoice.
      if (returnTo) {
        navigate(returnTo);
      } else if (isEditMode) {
        if (window.history.length > 1) navigate(-1); else navigate('/dashboard');
      } else {
        // Reset form for next entry
        setFormData({
          ledger_id: '',
          voucher_number: '',
          voucher_date: new Date().toISOString().split('T')[0],
          reference_number: '',
          reference_date: '',
          narration: '',
          total_amount: 0,
          tax_amount: 0,
          net_amount: 0
        });
        setSalesItems([{
          id: '1',
          item_id: '',
          quantity: 1,
          rate: 0,
          discount_percent: 0,
          discount_amount: 0,
          tax_percent: 0,
          amount: 0,
          tax_amount: 0,
          net_amount: 0
        }]);
        setAdditionalLedgers([]);
        setSelectedSalesLedgerId('');
        setSavedVoucher(null);
        await generateInvoiceNumber();
      }
    } catch (error) {
      console.error(`Error ${isEditMode ? 'updating' : 'creating'} ${invoiceLabel.toLowerCase()}:`, error);
      toast({
        title: "Error",
        description: `Failed to ${isEditMode ? 'update' : 'create'} ${invoiceLabel.toLowerCase()}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = (voucherArg?: any) => {
    const voucherToPrint = voucherArg || savedVoucher || (isEditMode ? formData : null);
    if (!voucherToPrint) {
      toast({
        title: "Error", 
        description: "Please save the invoice first",
        variant: "destructive"
      });
      return;
    }
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const numberToWords = (value: number) => {
      const ones = [
        'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
        'Seventeen', 'Eighteen', 'Nineteen',
      ];
      const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

      const integerToWords = (num: number): string => {
        if (num < 20) return ones[num];
        if (num < 100) {
          const rem = num % 10;
          return `${tens[Math.floor(num / 10)]}${rem ? ` ${ones[rem]}` : ''}`;
        }
        if (num < 1000) {
          const rem = num % 100;
          return `${ones[Math.floor(num / 100)]} Hundred${rem ? ` ${integerToWords(rem)}` : ''}`;
        }
        if (num < 100000) {
          const rem = num % 1000;
          return `${integerToWords(Math.floor(num / 1000))} Thousand${rem ? ` ${integerToWords(rem)}` : ''}`;
        }
        if (num < 10000000) {
          const rem = num % 100000;
          return `${integerToWords(Math.floor(num / 100000))} Lakh${rem ? ` ${integerToWords(rem)}` : ''}`;
        }
        const rem = num % 10000000;
        return `${integerToWords(Math.floor(num / 10000000))} Crore${rem ? ` ${integerToWords(rem)}` : ''}`;
      };

      const abs = Math.abs(Number(value) || 0);
      const rupees = Math.floor(abs);
      const paise = Math.round((abs - rupees) * 100);
      const sign = value < 0 ? 'Minus ' : '';
      const rupeesWords = rupees === 0 ? 'Zero' : integerToWords(rupees);
      const paiseWords = paise > 0 ? ` and ${integerToWords(paise)} Paise` : '';
      return `${sign}${rupeesWords} Rupees${paiseWords} Only`;
    };

    const printableAdditionalLedgers = additionalLedgers
      .filter((entry) => entry.ledger_id)
      .map((entry) => {
        const ledger = ledgers.find((l) => l.id === entry.ledger_id);
        const isTaxLedger =
          ledger?.group_name === 'Duties & Taxes' &&
          ledger?.tax_type &&
          ['IGST', 'CGST', 'SGST', 'VAT'].includes(ledger.tax_type);
        return { entry, ledger, isTaxLedger };
      });

    const formatAmount = (value: number, withSymbol = false, bracketNegative = false) => {
      const numeric = Number(value || 0);
      const abs = Math.abs(numeric);
      const formatted = abs.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const prefixed = `${withSymbol ? `${currencySymbol} ` : ''}${formatted}`;
      if (numeric < 0 && bracketNegative) {
        return `(${prefixed})`;
      }
      return numeric < 0 ? `-${prefixed}` : prefixed;
    };

    const itemsAmountTotal = salesItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const itemsTaxTotal = salesItems.reduce((sum, item) => sum + Number(item.tax_amount || 0), 0);
    const additionalAmountTotal = printableAdditionalLedgers.reduce(
      (sum, x) => sum + Number(x.entry.amount || 0),
      0
    );
    const additionalTaxTotal = printableAdditionalLedgers
      .filter((x) => x.isTaxLedger)
      .reduce((sum, x) => sum + Number(x.entry.amount || 0), 0);

    // Keep totals and in-words in sync with the visible Amount column.
    const columnTotalAmount = itemsAmountTotal + additionalAmountTotal;
    const effectiveTaxTotal = additionalTaxTotal !== 0 ? additionalTaxTotal : itemsTaxTotal;

    const finalAmountWords = numberToWords(columnTotalAmount);
    const taxAmountWords = numberToWords(effectiveTaxTotal);

    const additionalLedgerRows = printableAdditionalLedgers
      .map(({ entry, ledger }) => {
        const amount = Number(entry.amount || 0);
        const isNegative = amount < 0;
        const labelPrefix = isNegative ? '<span class="less">Less :</span>' : '';
        return `
          <tr>
            <td></td>
            <td class="desc-cell">${labelPrefix}<span class="adj-ledger">${ledger?.name || ''}</span></td>
            <td class="num"></td>
            <td class="num"></td>
            <td class="unit"></td>
            <td class="num">${formatAmount(amount, false, true)}</td>
          </tr>
        `;
      })
      .join('');

    const partyLedgerId = voucherToPrint.ledger_id || voucherToPrint.ledgerId || formData.ledger_id || '';
    const partyLedger = ledgers.find((l) => l.id === partyLedgerId);
    const partyLedgerName =
      partyLedger?.name ||
      voucherToPrint.ledger_name ||
      voucherToPrint.party_name ||
      voucherToPrint.partyName ||
      voucherToPrint.customer_name ||
      voucherToPrint.customerName ||
      '';
    const companyState = selectedCompany?.state || '';
    const companyCode = selectedCompany?.state_code || '';
    const companyEmail = selectedCompany?.email || '';
    const printableVoucherNumber =
      voucherToPrint.voucher_number ||
      voucherToPrint.voucherNumber ||
      voucherToPrint.bill_number ||
      voucherToPrint.invoice_number ||
      formData.voucher_number ||
      '';
    const printableVoucherDate =
      voucherToPrint.voucher_date ||
      voucherToPrint.voucherDate ||
      voucherToPrint.transaction_date ||
      voucherToPrint.date ||
      formData.voucher_date ||
      '';
    const printableNarration =
      voucherToPrint.narration ||
      voucherToPrint.notes ||
      formData.narration ||
      '';

    const itemRows = salesItems
      .filter((item) => item.item_id)
      .map((item, idx) => {
        const itemMaster = items.find((i) => i.id === item.item_id);
        const unit = itemMaster?.uom_master?.symbol || itemMaster?.uom_master?.name || '';
        return `
          <tr>
            <td class="num">${idx + 1}</td>
            <td class="desc-cell"><strong>${itemMaster?.name || ''}</strong></td>
            <td class="num">${Number(item.quantity || 0).toFixed(2)} ${unit}</td>
            <td class="num">${formatAmount(Number(item.rate || 0), false)}</td>
            <td class="unit">${unit}</td>
            <td class="num"><strong>${formatAmount(Number(item.amount || 0), false)}</strong></td>
          </tr>
        `;
      })
      .join('');

    const totalQty = salesItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const firstUnit = (() => {
      const firstItem = salesItems.find((item) => item.item_id);
      const master = firstItem ? items.find((i) => i.id === firstItem.item_id) : null;
      return master?.uom_master?.symbol || master?.uom_master?.name || '';
    })();

    printWindow.document.write(`
      <html>
        <head>
          <title>${actualVoucherType === 'credit-note' ? 'Credit Note' : 'Sales Invoice'} - ${printableVoucherNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 10px; color: #000; }
            .title { text-align: center; font-size: 30px; font-weight: 700; margin-bottom: 8px; letter-spacing: 0.5px; }
            .outer, .items, .bottom { width: 100%; border-collapse: collapse; }
            .outer td, .outer th, .items td, .items th, .bottom td { border: 1px solid #000; vertical-align: top; }
            .cell-pad { padding: 6px; }
            .label { font-size: 12px; }
            .value { font-size: 28px; font-weight: 700; }
            .small { font-size: 11px; }
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
            .muted { font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="title">INVOICE</div>
          <table class="outer">
            <tr>
              <td style="width:50%" class="cell-pad" rowspan="2">
                <div class="value">${selectedCompany?.name || ''}</div>
                <div>State Name : ${companyState}, Code : ${companyCode}</div>
                <div>E-Mail : ${companyEmail}</div>
              </td>
              <td style="width:25%" class="cell-pad"><div class="label">Invoice No.</div><div>${printableVoucherNumber}</div></td>
              <td style="width:25%" class="cell-pad"><div class="label">Dated</div><div>${printableVoucherDate}</div></td>
            </tr>
            <tr>
              <td class="cell-pad"><div class="label">Supplier Invoice No. & Date.</div></td>
              <td class="cell-pad"><div class="label">Other References</div></td>
            </tr>
            <tr>
              <td class="cell-pad" style="height:90px">
                <div class="label">Customer (Bill to)</div>
                <div class="value">${partyLedgerName}</div>
                <div>State Name : ${companyState}, Code : ${companyCode}</div>
              </td>
              <td colspan="2"></td>
            </tr>
          </table>
          <table class="items">
            <tr>
              <th style="width:5%">Sl<br/>No.</th>
              <th style="width:54%">Description of<br/>Goods and Services</th>
              <th style="width:10%">Quantity</th>
              <th style="width:10%">Rate</th>
              <th style="width:5%">per</th>
              <th style="width:16%">Amount</th>
            </tr>
            ${itemRows}
            ${additionalLedgerRows}
            <tr class="totals">
              <td></td>
              <td class="num">Total</td>
              <td class="num">${Number(totalQty).toFixed(2)} ${firstUnit}</td>
              <td></td>
              <td></td>
              <td class="num">${formatAmount(columnTotalAmount, true)}</td>
            </tr>
          </table>
          <table class="bottom">
            <tr>
              <td colspan="2" class="cell-pad">
                <div class="label">Narration</div>
                <div>${printableNarration || '-'}</div>
              </td>
            </tr>
            <tr>
              <td style="width:70%" class="cell-pad">
                <div class="label">Amount Chargeable (in words)</div>
                <div class="amount-words">INR ${finalAmountWords}</div>
              </td>
              <td style="width:30%" class="cell-pad num">E. & O.E</td>
            </tr>
            <tr>
              <td class="cell-pad"><div class="label">Tax Amount (in words): INR ${taxAmountWords}</div></td>
              <td class="cell-pad sign-box">
                <div><strong>for ${partyLedgerName || selectedCompany?.name || ''}</strong></div>
                <div style="margin-top:38px">Authorised Signatory</div>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `);
    
    const restoreFocus = () => {
      setTimeout(() => {
        window.focus();
      }, 0);
    };

    printWindow.onafterprint = () => {
      try {
        printWindow.close();
      } catch {
        // ignore close failures
      }
      restoreFocus();
    };

    printWindow.onbeforeunload = () => {
      restoreFocus();
    };

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      try {
        printWindow.print();
      } catch {
        restoreFocus();
      }
    }, 100);
  };

  if (!selectedCompany) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mt-10">
            <h2 className="text-xl font-semibold text-muted-foreground">
              Please select a company to create sales invoices
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
            <h1 className="text-2xl font-bold">{formTitle}</h1>
          </div>
          {savedVoucher && (
            <Button onClick={handlePrint} variant="outline">
              <Printer className="h-4 w-4 mr-2" />
              Print Invoice
            </Button>
          )}
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

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{actualVoucherType === 'credit-note' ? 'Credit Note Details' : 'Invoice Details'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Customer</Label>
                  <div className="flex gap-2">
                    <SearchableDropdown
                      value={formData.ledger_id}
                      onValueChange={(value) => setFormData({ ...formData, ledger_id: value })}
                      placeholder="Select Customer"
                      options={ledgers
                        .filter((ledger) => {
                          const directGroup = ledger.group_name;
                          const parentGroup = ledger.ledger_groups?.parent_group?.name;
                          const targetGroups = ['Sundry Debtors', 'Sundry Creditors', 'Cash-in-Hand', 'Current Liabilities'];
                          return targetGroups.includes(directGroup) || targetGroups.includes(parentGroup);
                        })
                        .map((ledger) => ({
                          value: ledger.id,
                          label: `${ledger.name} (${ledger.group_name})`,
                        }))}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => {
                      const returnPath = window.location.pathname;
                      navigate('/ledger-master', { 
                        state: { 
                          returnTo: returnPath,
                          action: 'create',
                          type: 'customer' 
                        } 
                      });
                    }}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div>
                  <Label>Sales Ledger *</Label>
                  <div className="flex gap-2">
                    <SearchableDropdown
                      value={selectedSalesLedgerId}
                      onValueChange={setSelectedSalesLedgerId}
                      placeholder="Select Sales Ledger"
                      options={ledgers
                        .filter(
                          (ledger) =>
                            ledger.ledger_groups?.name === 'Sales Accounts' ||
                            ledger.ledger_groups?.name === 'Income'
                        )
                        .map((ledger) => ({
                          value: ledger.id,
                          label: ledger.name,
                        }))}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => {
                      const returnPath = window.location.pathname + window.location.search;
                      navigate('/ledger-master', {
                        state: {
                          returnTo: returnPath,
                          action: 'create',
                          type: 'ledger'
                        }
                      });
                    }}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div>
                  <Label>{actualVoucherType === 'credit-note' ? 'Note Number' : 'Invoice Number'}</Label>
                  <Input 
                    value={formData.voucher_number}
                    onChange={(e) => setFormData({...formData, voucher_number: e.target.value})}
                    placeholder="Enter invoice number"
                    required
                  />
                </div>
                
                <div>
                  <Label>{actualVoucherType === 'credit-note' ? 'Note Date' : 'Invoice Date'}</Label>
                  <Input 
                    type="date"
                    value={formData.voucher_date}
                    onChange={(e) => setFormData({...formData, voucher_date: e.target.value})}
                    required
                  />
                </div>

                <div>
                  <Label>Reference Number</Label>
                  <Input 
                    value={formData.reference_number}
                    onChange={(e) => setFormData({...formData, reference_number: e.target.value})}
                    placeholder="Enter reference number"
                  />
                </div>

                <div>
                  <Label>Reference Date</Label>
                  <Input 
                    type="date"
                    value={formData.reference_date}
                    onChange={(e) => setFormData({...formData, reference_date: e.target.value})}
                  />
                </div>
              </div>
              
              <div>
                <Label>Narration</Label>
                <Textarea 
                  value={formData.narration}
                  onChange={(e) => setFormData({...formData, narration: e.target.value})}
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
                <Button type="button" onClick={addSalesItem} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {salesItems.map((item, index) => {
                  const selectedItemMaster = items.find(i => i.id === item.item_id);
                  const isBatchEnabled = selectedItemMaster?.enable_batches === true;
                  const isReadOnly = !!(
                    isBatchEnabled &&
                    Array.isArray(item.batch_allocations) &&
                    item.batch_allocations.length > 0
                  );
                  
                  return (
                  <div
                    key={item.id}
                    className="p-4 border rounded-lg space-y-3"
                  >
                    {/* 🟦 First Row: Item Selection (Full Width) */}
                    <div>
                      <Label>Item</Label>
                      <div className="flex gap-1">
                        <Input
                          className="w-full"
                          list="sales-items-datalist"
                          placeholder="Type or select item"
                          value={itemSearchByRow[item.id] ?? selectedItemMaster?.name ?? ''}
                          onChange={(e) => handleSalesItemSearchChange(index, item.id, e.target.value)}
                          onBlur={() => handleSalesItemSearchBlur(index, item.id)}
                        />
                        <datalist id="sales-items-datalist">
                          {items.map((product) => (
                            <option key={product.id} value={product.name} />
                          ))}
                        </datalist>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const returnPath = window.location.pathname;
                            navigate('/item-master', { state: { returnTo: returnPath, autoShowForm: true } });
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        
                        <Button
                          type="button"
                          variant={item.batch_id ? "default" : "outline"}
                          size="sm"
                          onClick={() => openBatchSelection(index)}
                          disabled={!item.item_id || !isBatchEnabled}
                          title={!isBatchEnabled ? "Batches disabled for this item" : (item.batch_id ? "Batch selected" : "Select batch")}
                        >
                          <Package className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    {/* 🟩 Second Row: Other Fields */}
                    <div
                      className={`grid gap-2 items-end ${
                        showDiscountColumn
                          ? 'grid-cols-[repeat(9,1fr)]'
                          : 'grid-cols-[repeat(7,1fr)]'
                      }`}
                    >
                      <div>
                        <Label>Qty</Label>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateSalesItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                          min="0"
                          step="1"
                          readOnly={isReadOnly}
                          className={isReadOnly ? 'bg-muted' : ''}
                        />
                      </div>

                      <div>
                        <Label>Rate</Label>
                        <Input
                          type="number"
                          value={item.rate}
                          onChange={(e) => updateSalesItem(index, 'rate', parseFloat(e.target.value) || 0)}
                          min="0"
                          step="0.01"
                          readOnly={isReadOnly}
                          className={isReadOnly ? 'bg-muted' : ''}
                        />
                      </div>

                      {showDiscountColumn && (
                        <div>
                          <Label>Disc %</Label>
                          <Input
                            type="number"
                            value={item.discount_percent}
                            onChange={(e) => updateSalesItem(index, 'discount_percent', parseFloat(e.target.value) || 0)}
                            min="0"
                            step="0.01"
                          />
                        </div>
                      )}

                      {showDiscountColumn && (
                        <div>
                          <Label>Disc Amt</Label>
                          <Input
                            type="number"
                            value={item.discount_amount}
                            readOnly
                            className="bg-muted"
                          />
                        </div>
                      )}

                      <div>
                        <Label>Amount</Label>
                        <Input value={item.amount.toFixed(2)} readOnly className="bg-muted" />
                      </div>

                      {/* Tax % - Only show when tax is enabled */}
                      {isTaxEnabled && (
                        <div>
                          <Label>Tax %</Label>
                          <Input
                            type="number"
                            value={item.tax_percent}
                            onChange={(e) => updateSalesItem(index, 'tax_percent', parseFloat(e.target.value) || 0)}
                            min="0"
                            step="0.01"
                          />
                        </div>
                      )}

                      {/* Tax Amount - Only show when tax is enabled */}
                      {isTaxEnabled && (
                        <div>
                          <Label>{taxLabel}</Label>
                          <Input value={item.tax_amount.toFixed(2)} readOnly className="bg-muted" />
                        </div>
                      )}

                      {isTaxEnabled && (
                        <div>
                          <Label>Net Amt</Label>
                          <Input value={item.net_amount.toFixed(2)} readOnly className="bg-muted" />
                        </div>
                      )}

                      <div className="flex items-end justify-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeSalesItem(index)}
                          disabled={salesItems.length === 1}
                        >
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
                            options={ledgers.map((ledger) => ({
                              value: ledger.id,
                              label: `${ledger.name} (${ledger.group_name})`,
                            }))}
                          />
                          <Button type="button" variant="outline" size="sm" onClick={() => {
                            const returnPath = window.location.pathname + window.location.search;
                            navigate('/ledger-master', {
                              state: {
                                returnTo: returnPath,
                                action: 'create',
                                type: 'ledger'
                              }
                            });
                          }}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="w-48">
                        <Label>Amount</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={entry.amount}
                          onChange={(e) => handleAdditionalAmountChange(entry.id, parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeAdditionalLedger(entry.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No additional ledger entries. Click "Add Ledger" to add expense/income entries.</p>
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
            <Button type="button" variant="outline" onClick={() => navigate('/dashboard')}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : `${isEditMode ? 'Update' : 'Save'} ${invoiceLabel}`}
            </Button>
            {savedVoucher && (
              <Button type="button" onClick={handlePrint} variant="outline">
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
            onClose={() => {
              setBatchDialogOpen(false);
              setSelectedItemForBatch(null);
            }}
            itemId={selectedItemForBatch.itemId}
            itemName={selectedItemForBatch.itemName}
            requiredQuantity={selectedItemForBatch.quantity}
            companyId={selectedCompany.id}
            onBatchSelect={handleBatchSelect}
          />

          <BatchAllocationDialog
            open={batchAllocationDialogOpen}
            onClose={() => {
              setBatchAllocationDialogOpen(false);
              setSelectedItemForBatch(null);
            }}
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
    </div>
  );
};

export default SalesForm;