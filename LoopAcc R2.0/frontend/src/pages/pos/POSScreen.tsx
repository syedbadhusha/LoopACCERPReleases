import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CreditCard,
  Banknote,
  Smartphone,
  CheckCircle2,
  Loader2,
  Package,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { API_BASE_URL } from '@/config/runtime';
import { isCompanyTaxEnabled, getCompanyTaxType, isCompanyBatchesEnabled } from '@/lib/companyTax';
import QuickCreateItemDialog from '@/components/QuickCreateItemDialog';
import { BatchSelectionDialog } from '@/components/BatchSelectionDialog';
import { BatchAllocationDialog } from '@/components/BatchAllocationDialog';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PosVoucherType {
  id: string;
  name: string;
  base_type: string;
  prefix: string;
  suffix: string;
  starting_number: number;
  is_system: boolean;
  is_pos: boolean;
  pos_sales_ledger_id?: string;
  pos_cash_ledger_id?: string;
  pos_card_ledger_id?: string;
  pos_online_ledger_id?: string;
  pos_tax_ledger_id?: string;
  pos_cgst_ledger_id?: string;
  pos_sgst_ledger_id?: string;
}

interface ItemMaster {
  id: string;
  name: string;
  sales_rate: number;
  tax_rate: number;
  igst_rate: number;
  cgst_rate: number;
  sgst_rate: number;
  enable_batches?: boolean;
  image?: string;
  uom_master?: { name: string; symbol: string };
  stock_groups?: { id: string; name: string };
  stock_categories?: { id: string; name: string };
  standard_rates?: { date: string; cost: number; rate: number }[];
}

interface CartItem {
  id: string; // cart line id
  item: ItemMaster;
  qty: number;
  rate: number;
  discount_percent: number;
  discount_amount: number;
  tax_percent: number;
  tax_amount: number;
  amount: number; // qty * rate - discount
  net_amount: number; // amount + tax
  batch_id?: string | null;
  batch_number?: string | null; // display label
  batch_allocations?: any[];
}

type PaymentMethod = 'cash' | 'card' | 'online';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Returns the effective sales rate for an item as of the given date (YYYY-MM-DD).
 *  Falls back to item.sales_rate for backward compatibility. */
function getEffectiveRate(item: ItemMaster, forDate?: string): number {
  const dateStr = forDate || new Date().toISOString().split('T')[0];
  if (item.standard_rates && item.standard_rates.length > 0) {
    const applicable = item.standard_rates
      .filter(r => r.date <= dateStr)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (applicable.length > 0) return Number(applicable[0].rate) || 0;
    // If all rates are future, take the earliest
    const sorted = [...item.standard_rates].sort((a, b) => a.date.localeCompare(b.date));
    return Number(sorted[0].rate) || 0;
  }
  return item.sales_rate || 0;
}

function buildCartLine(item: ItemMaster, qty = 1, voucherDate?: string): CartItem {
  const rate = getEffectiveRate(item, voucherDate);
  const taxPct = item.igst_rate || item.tax_rate || 0;
  const gross = qty * rate;
  const discountAmt = 0; // no discount on initial add
  const amount = gross - discountAmt; // taxable base (post-discount)
  const taxAmount = (amount * taxPct) / 100;
  return {
    id: `${item.id}-${Date.now()}`,
    item,
    qty,
    rate,
    discount_percent: 0,
    discount_amount: discountAmt,
    tax_percent: taxPct,
    tax_amount: taxAmount,
    amount,
    net_amount: amount + taxAmount,
  };
}

function recalcLine(line: CartItem): CartItem {
  const gross = line.qty * line.rate;
  const discountAmt = (gross * line.discount_percent) / 100;
  const taxable = gross - discountAmt;
  const taxAmount = (taxable * line.tax_percent) / 100;
  return {
    ...line,
    discount_amount: discountAmt,
    amount: taxable,
    tax_amount: taxAmount,
    net_amount: taxable + taxAmount,
  };
}

// Recalc when user types a discount amount directly (back-computes percent)
function recalcLineByAmount(line: CartItem, discountAmt: number): CartItem {
  const gross = line.qty * line.rate;
  const safeAmt = Math.min(Math.max(discountAmt, 0), gross);
  const discountPct = gross > 0 ? (safeAmt / gross) * 100 : 0;
  const taxable = gross - safeAmt;
  const taxAmount = (taxable * line.tax_percent) / 100;
  return {
    ...line,
    discount_percent: discountPct,
    discount_amount: safeAmt,
    amount: taxable,
    tax_amount: taxAmount,
    net_amount: taxable + taxAmount,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

const POSScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const isTaxEnabled = isCompanyTaxEnabled(selectedCompany);
  const taxType = getCompanyTaxType(selectedCompany);
  const isBatchEnabled = isCompanyBatchesEnabled(selectedCompany);
  const currencySymbol = selectedCompany?.currency === 'INR' ? '₹' : selectedCompany?.currency || '₹';
  const showDiscountColumn = selectedCompany?.settings?.show_discount_column === 'true';
  const discountEntryMode: 'percent' | 'amount' =
    selectedCompany?.settings?.discount_entry_mode === 'amount' ? 'amount' : 'percent';

  // ── Edit mode (from URL ?edit=voucherId)
  const editVoucherId = new URLSearchParams(location.search).get('edit') || null;
  const isEditMode = !!editVoucherId;

  // ── Data state
  const [posTypes, setPosTypes] = useState<PosVoucherType[]>([]);
  const [selectedType, setSelectedType] = useState<PosVoucherType | null>(null);
  const [items, setItems] = useState<ItemMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── UI state
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [voucherDate, setVoucherDate] = useState(new Date().toISOString().split('T')[0]);
  const [voucherNumber, setVoucherNumber] = useState('');
  const [narration, setNarration] = useState('');

  // ── Payment dialog
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [splitAmounts, setSplitAmounts] = useState<{ cash: string; card: string; online: string }>({ cash: '', card: '', online: '' });
  const [cashTendered, setCashTendered] = useState('');
  const [cardRef, setCardRef] = useState('');
  const [onlineRef, setOnlineRef] = useState('');

  // ── Success dialog
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [lastVoucherNo, setLastVoucherNo] = useState('');

  // ── Quick create item
  const [quickCreateItemOpen, setQuickCreateItemOpen] = useState(false);
  // ── Return against original POS
  const [originalDocId, setOriginalDocId] = useState('');
  const [posOriginalVouchers, setPosOriginalVouchers] = useState<any[]>([]);

  // ── Hold / Retake
  const [isHold, setIsHold] = useState(false);
  const [retakeDialogOpen, setRetakeDialogOpen] = useState(false);
  const [holdVouchers, setHoldVouchers] = useState<any[]>([]);

  // ── Batch selection dialog
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchAllocationDialogOpen, setBatchAllocationDialogOpen] = useState(false);
  const [pendingBatchItem, setPendingBatchItem] = useState<ItemMaster | null>(null);
  // For re-allocating a cart line that already has a batch
  const [editingBatchCartLineId, setEditingBatchCartLineId] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  // ── Derived: which payment methods are available for the selected type
  const availablePayMethods: { key: PaymentMethod; label: string; icon: any }[] = [
    ...(selectedType?.pos_cash_ledger_id   ? [{ key: 'cash'   as PaymentMethod, label: 'Cash',   icon: Banknote   }] : []),
    ...(selectedType?.pos_card_ledger_id   ? [{ key: 'card'   as PaymentMethod, label: 'Card',   icon: CreditCard }] : []),
    ...(selectedType?.pos_online_ledger_id ? [{ key: 'online' as PaymentMethod, label: 'Online', icon: Smartphone }] : []),
  ];
  const isPosConfigured = !!(selectedType?.pos_sales_ledger_id && availablePayMethods.length > 0);
  // Credit-note mode: reverse all ledger entry debit/credit directions
  const isReturnMode = selectedType?.base_type === 'credit-note';

  // ── Load data
  useEffect(() => {
    if (!selectedCompany) return;
    const load = async () => {
      setLoading(true);
      try {
        const [vtRes, itemsRes, vouchersRes] = await Promise.all([
          fetch(`${API_BASE_URL}/voucher-types?companyId=${selectedCompany.id}`).then(r => r.json()),
          fetch(`${API_BASE_URL}/items?companyId=${selectedCompany.id}`).then(r => r.json()),
          fetch(`${API_BASE_URL}/vouchers?companyId=${selectedCompany.id}`).then(r => r.json()),
        ]);

        const allVoucherTypes: PosVoucherType[] = vtRes.data || [];
        const posList = allVoucherTypes.filter(vt => vt.is_pos);
        setPosTypes(posList);

        const allVouchers: any[] = vouchersRes.data || [];

        if (posList.length > 0) {
          // Default to the type used in the most recently created POS voucher
          const lastPosVoucher = allVouchers
            .filter(v => v.is_pos && posList.some(pt => pt.id === v.voucher_type_id))
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
          const lastType = lastPosVoucher ? posList.find(pt => pt.id === lastPosVoucher.voucher_type_id) : null;
          // Fallback: prefer a non-return (sales) type over credit-note
          const defaultType = lastType
            || posList.find(pt => pt.base_type !== 'credit-note')
            || posList[0];
          setSelectedType(defaultType);
        }

        const allItems: ItemMaster[] = itemsRes.data || [];
        setItems(allItems);

        // POS sales vouchers for return-against selector
        const posSalesVouchers = allVouchers.filter(v => v.is_pos && v.voucher_type === 'sales');
        setPosOriginalVouchers(posSalesVouchers);
      } catch (err) {
        console.error(err);
        toast({ title: 'Error', description: 'Failed to load POS data', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedCompany]);



  // ── Generate voucher number when type changes (skip in edit mode)
  useEffect(() => {
    if (!selectedType || !selectedCompany || isEditMode) return;
    const prefix = selectedType.prefix || '';
    const suffix = selectedType.suffix || '';
    const startingNumber = selectedType.starting_number || 1;

    fetch(`${API_BASE_URL}/vouchers?companyId=${selectedCompany.id}`)
      .then(r => r.json())
      .then(json => {
        const allVouchers: any[] = json.data || [];
        // Filter by this exact voucher type id so different voucher types don't share numbering
        const typeVouchers = allVouchers.filter(v => v.voucher_type_id === selectedType.id);
        let nextNumber = startingNumber;
        if (typeVouchers.length > 0) {
          const last = typeVouchers.sort(
            (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0];
          let stripped = String(last.voucher_number || '');
          if (prefix && stripped.startsWith(prefix)) stripped = stripped.slice(prefix.length);
          if (suffix && stripped.endsWith(suffix)) stripped = stripped.slice(0, stripped.length - suffix.length);
          const parsed = parseInt(stripped);
          if (!isNaN(parsed)) nextNumber = Math.max(startingNumber, parsed + 1);
        }
        setVoucherNumber(`${prefix}${String(nextNumber).padStart(4, '0')}${suffix}`);
      })
      .catch(() => {
        const pad = String(startingNumber).padStart(4, '0');
        setVoucherNumber(`${prefix}${pad}${suffix}`);
      });
  }, [selectedType, selectedCompany]);

  // ── Load existing voucher in edit mode (once items + posTypes are ready)
  useEffect(() => {
    if (!isEditMode || !editVoucherId || !items.length || !posTypes.length) return;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/vouchers/${editVoucherId}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Failed to load voucher');
        const v = json.data;
        // Set matching POS type
        const vtMatch = posTypes.find(t => t.id === v.voucher_type_id);
        if (vtMatch) setSelectedType(vtMatch);
        // Header fields
        setVoucherDate(v.voucher_date ? String(v.voucher_date).split('T')[0] : new Date().toISOString().split('T')[0]);
        setVoucherNumber(v.voucher_number || '');
        setNarration(v.narration || '');
        if (v.original_doc_id) setOriginalDocId(v.original_doc_id);
        setIsHold(v.optional === true);
        setSplitAmounts({
          cash: v.pos_cash_amount ? String(v.pos_cash_amount) : '',
          card: v.pos_card_amount ? String(v.pos_card_amount) : '',
          online: v.pos_online_amount ? String(v.pos_online_amount) : '',
        });
        if (v.pos_cash_tendered) setCashTendered(String(v.pos_cash_tendered));
        if (v.pos_card_ref) setCardRef(v.pos_card_ref);
        if (v.pos_online_ref) setOnlineRef(v.pos_online_ref);
        // Rebuild cart from saved details
        const itemDetails = (v.details || []).filter((d: any) => !!d.item_id);
        const cartLines: CartItem[] = itemDetails
          .map((d: any, idx: number) => {
            const itemMaster = items.find(i => i.id === d.item_id);
            if (!itemMaster) return null;
            return {
              id: `edit-${d.item_id}-${idx}`,
              item: itemMaster,
              qty: Number(d.quantity || 1),
              rate: Number(d.rate || 0),
              discount_percent: Number(d.discount_percent || 0),
              discount_amount: Number(d.discount_amount || 0),
              tax_percent: Number(d.tax_percent || 0),
              tax_amount: Number(d.tax_amount || 0),
              amount: Number(d.amount || 0),
              net_amount: Number(d.net_amount || 0),
              batch_id: d.batch_id || null,
              batch_number: d.batch_number || null,
              batch_allocations: d.batch_allocations || [],
            } as CartItem;
          })
          .filter(Boolean) as CartItem[];
        setCart(cartLines);
      } catch (err: any) {
        toast({ title: 'Error', description: err.message || 'Failed to load voucher', variant: 'destructive' });
      }
    };
    load();
  }, [isEditMode, editVoucherId, items.length, posTypes.length]);

  // ── Cart helpers
  const addToCart = (item: ItemMaster) => {
    // If the item has batch tracking enabled and company supports batches,
    // always open batch dialog so user picks a batch + qty
    if (isBatchEnabled && item.enable_batches) {
      setPendingBatchItem(item);
      setEditingBatchCartLineId(null);
      setBatchAllocationDialogOpen(true);
      return;
    }
    // No batch needed — add/increment normally
    setCart(prev => {
      const existing = prev.find(l => l.item.id === item.id && !l.batch_id);
      if (existing) {
        return prev.map(l =>
          l.id === existing.id ? recalcLine({ ...l, qty: l.qty + 1 }) : l
        );
      }
      return [...prev, buildCartLine(item, 1, voucherDate)];
    });
  };

  const handleBatchAllocationsSelect = (summary: any) => {
    if (!pendingBatchItem) return;
    const item = pendingBatchItem;
    setPendingBatchItem(null);
    setBatchAllocationDialogOpen(false);

    if (!summary.allocations || summary.allocations.length === 0) return;

    if (editingBatchCartLineId) {
      // Re-allocating an existing cart line — update in place
      setCart(prev => prev.map(l => {
        if (l.id !== editingBatchCartLineId) return l;
        if (summary.allocations.length === 1) {
          const a = summary.allocations[0];
          return recalcLine({
            ...l,
            qty: a.qty,
            rate: a.rate || l.rate,
            batch_id: a.batch_id,
            batch_number: a.batch_number || a.batch_id,
            batch_allocations: summary.allocations,
          });
        }
        // Multi-batch: collapse into first allocation (POS keeps 1 line per batch)
        const a = summary.allocations[0];
        return recalcLine({ ...l, qty: a.qty, rate: a.rate || l.rate, batch_id: a.batch_id, batch_number: a.batch_number || a.batch_id, batch_allocations: summary.allocations });
      }));
      setEditingBatchCartLineId(null);
      return;
    }

    // New cart lines — one line per batch allocation
    const newLines: CartItem[] = summary.allocations.map((a: any) => {
      const base = buildCartLine(item, a.qty, voucherDate);
      return {
        ...base,
        id: `${item.id}-${a.batch_id}-${Date.now()}-${Math.random()}`,
        qty: a.qty,
        rate: a.rate || getEffectiveRate(item, voucherDate),
        batch_id: a.batch_id,
        batch_number: a.batch_number || a.batch_id,
        batch_allocations: [a],
      };
    });

    setCart(prev => {
      let updated = [...prev];
      for (const newLine of newLines) {
        const existing = updated.find(l => l.item.id === item.id && l.batch_id === newLine.batch_id);
        if (existing) {
          updated = updated.map(l =>
            l.id === existing.id ? recalcLine({ ...l, qty: l.qty + newLine.qty }) : l
          );
        } else {
          updated = [...updated, recalcLine(newLine)];
        }
      }
      return updated;
    });
  };

  // Called from BatchSelectionDialog (simple select for non-enable_batches items — currently unused in POS)
  const handleBatchSelect = (batchId: string | null, _allocationMethod?: string, qty?: number) => {
    if (!pendingBatchItem) return;
    const item = pendingBatchItem;
    setPendingBatchItem(null);
    setBatchDialogOpen(false);

    if (!batchId) {
      setCart(prev => {
        const existing = prev.find(l => l.item.id === item.id && !l.batch_id);
        if (existing) return prev.map(l => l.id === existing.id ? recalcLine({ ...l, qty: l.qty + 1 }) : l);
        return [...prev, buildCartLine(item, 1, voucherDate)];
      });
      return;
    }
    const lineQty = qty && qty > 0 ? qty : 1;
    fetch(`${API_BASE_URL}/batch-allocations?itemId=${item.id}&companyId=${selectedCompany?.id}`)
      .then(r => r.json())
      .then(json => {
        const allBatches = json.data || json.batches || [];
        const batchRecord = allBatches.find((b: any) => b.id === batchId);
        const batchNumber = batchRecord?.batch_number || batchId;
        setCart(prev => {
          const existing = prev.find(l => l.item.id === item.id && l.batch_id === batchId);
          if (existing) return prev.map(l => l.id === existing.id ? recalcLine({ ...l, qty: l.qty + lineQty }) : l);
          const line = buildCartLine(item, lineQty, voucherDate);
          return [...prev, { ...line, batch_id: batchId, batch_number: batchNumber, batch_allocations: [{ batch_id: batchId, quantity: lineQty }] }];
        });
      })
      .catch(() => {
        setCart(prev => [...prev, { ...buildCartLine(item, lineQty, voucherDate), batch_id: batchId, batch_number: batchId }]);
      });
  };

  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(l => l.id !== id));
      return;
    }
    setCart(prev => prev.map(l => l.id === id ? recalcLine({ ...l, qty }) : l));
  };

  const updateDiscount = (id: string, pct: number) => {
    setCart(prev => prev.map(l => l.id === id ? recalcLine({ ...l, discount_percent: pct }) : l));
  };

  const updateDiscountAmt = (id: string, amt: number) => {
    setCart(prev => prev.map(l => l.id === id ? recalcLineByAmount(l, amt) : l));
  };

  const removeFromCart = (id: string) => setCart(prev => prev.filter(l => l.id !== id));

  const clearCart = () => setCart([]);

  // ── Totals
  const subtotal = cart.reduce((s, l) => s + l.amount, 0);
  const totalDiscount = cart.reduce((s, l) => s + l.discount_amount, 0);
  const totalTax  = cart.reduce((s, l) => s + l.tax_amount, 0);
  const grandTotal = cart.reduce((s, l) => s + l.net_amount, 0);
  const splitCash = parseFloat(splitAmounts.cash || '0');
  const splitCard = parseFloat(splitAmounts.card || '0');
  const splitOnline = parseFloat(splitAmounts.online || '0');
  const splitTotal = splitCash + splitCard + splitOnline;
  const splitRemaining = grandTotal - splitTotal;
  const isSettled = Math.abs(splitRemaining) < 0.01;
  const cashTenderedNum = parseFloat(cashTendered || '0');
  const cashChange = Math.max(0, cashTenderedNum - splitCash);

  // ── Item list (filtered)
  const groups = Array.from(new Set(items.map(i => i.stock_groups?.name).filter(Boolean))) as string[];
  const categories = Array.from(new Set(items.map(i => i.stock_categories?.name).filter(Boolean))) as string[];
  const filteredItems = items.filter(i => {
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase());
    const matchGroup = !groupFilter || i.stock_groups?.name === groupFilter;
    const matchCategory = !categoryFilter || i.stock_categories?.name === categoryFilter;
    return matchSearch && matchGroup && matchCategory;
  });

  // ── Open settle dialog (auto-fill the first available method if nothing entered yet)
  const openSettleDialog = () => {
    const currentTotal = parseFloat(splitAmounts.cash || '0') + parseFloat(splitAmounts.card || '0') + parseFloat(splitAmounts.online || '0');
    if (Math.abs(currentTotal) < 0.01 && availablePayMethods.length > 0) {
      setSplitAmounts({ cash: '', card: '', online: '', [availablePayMethods[0].key]: grandTotal.toFixed(2) });
    }
    setPayDialogOpen(true);
  };

  // ── Save as Hold (optional voucher — no ledger/stock/batch side-effects)
  const handleHold = async () => {
    if (!selectedCompany || !selectedType) return;
    if (cart.length === 0) {
      toast({ title: 'Validation', description: 'Cart is empty', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const details = cart.map(l => ({
        item_id: l.item.id,
        batch_id: l.batch_id || null,
        batch_number: l.batch_number || null,
        batch_allocations: l.batch_allocations || [],
        quantity: l.qty,
        rate: l.rate,
        amount: l.amount,
        discount_percent: l.discount_percent,
        discount_amount: l.discount_amount,
        tax_percent: l.tax_percent,
        tax_amount: l.tax_amount,
        net_amount: l.net_amount,
      }));

      // Held voucher: no payment, no ledger entries needed
      const holdPayload = {
        company_id: selectedCompany.id,
        voucher_type: selectedType.base_type,
        voucher_type_id: selectedType.id,
        is_pos: true,
        optional: true,
        voucher_number: voucherNumber,
        voucher_date: voucherDate,
        ledger_id: null,
        narration: narration,
        original_doc_id: originalDocId || null,
        total_amount: subtotal,
        tax_amount: totalTax,
        net_amount: grandTotal,
        details,
        ledger_entries: [],
      };

      const res = await fetch(
        isEditMode ? `${API_BASE_URL}/vouchers/${editVoucherId}` : `${API_BASE_URL}/vouchers`,
        {
          method: isEditMode ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(holdPayload),
        }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to hold');

      toast({ title: 'Held', description: `POS bill ${voucherNumber} put on hold.` });
      clearCart();
      setNarration('');
      setOriginalDocId('');
      setIsHold(false);
      setSelectedType(t => t ? { ...t } : t); // refresh voucher number
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── Submit voucher
  const handleSettle = async () => {
    if (!selectedCompany || !selectedType) return;

    // Validate configuration
    if (!selectedType.pos_sales_ledger_id) {
      toast({ title: 'Configuration Error', description: 'Sales ledger not configured. Please edit this voucher type in Voucher Type Master.', variant: 'destructive' });
      return;
    }
    if (cart.length === 0) {
      toast({ title: 'Validation', description: 'Cart is empty', variant: 'destructive' });
      return;
    }

    // Validate split amounts sum equals bill total
    if (Math.abs(splitRemaining) > 0.01) {
      toast({ title: 'Validation', description: `Payment amounts must equal bill amount (${currencySymbol}${fmt(grandTotal)}). Current total: ${currencySymbol}${fmt(splitTotal)}`, variant: 'destructive' });
      return;
    }

    // Validate cash tendered is not less than cash split amount
    if (splitCash > 0 && cashTenderedNum > 0 && cashTenderedNum < splitCash) {
      toast({ title: 'Validation', description: `Cash tendered (${currencySymbol}${fmt(cashTenderedNum)}) cannot be less than cash payment amount (${currencySymbol}${fmt(splitCash)})`, variant: 'destructive' });
      return;
    }

    // Validate ledger configured for each method used
    if (splitCash > 0 && !selectedType.pos_cash_ledger_id) {
      toast({ title: 'Configuration Error', description: 'Cash ledger not configured in this voucher type.', variant: 'destructive' });
      return;
    }
    if (splitCard > 0 && !selectedType.pos_card_ledger_id) {
      toast({ title: 'Configuration Error', description: 'Card ledger not configured in this voucher type.', variant: 'destructive' });
      return;
    }
    if (splitOnline > 0 && !selectedType.pos_online_ledger_id) {
      toast({ title: 'Configuration Error', description: 'Online transfer ledger not configured in this voucher type.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      // Determine tax split
      const isGST = taxType === 'GST';
      const splitTaxGST = isGST && isTaxEnabled && totalTax > 0 &&
        (!!selectedType.pos_cgst_ledger_id || !!selectedType.pos_sgst_ledger_id);
      const splitTaxVAT = !isGST && isTaxEnabled && totalTax > 0 && !!selectedType.pos_tax_ledger_id;
      const hasTaxSplit = splitTaxGST || splitTaxVAT;
      const salesCredit = hasTaxSplit ? subtotal : grandTotal;

      const ledgerEntries: any[] = [];
      const txLabel = isReturnMode ? `POS Return ${voucherNumber}` : `POS Sale ${voucherNumber}`;

      // Payment method ledger entries:
      // Sale: DEBIT payment ledgers (cash/card/online) — money comes in
      // Credit Note: CREDIT payment ledgers — money goes out (refund)
      if (splitCash > 0 && selectedType.pos_cash_ledger_id) {
        ledgerEntries.push({
          company_id: selectedCompany.id,
          ledger_id: selectedType.pos_cash_ledger_id,
          transaction_date: voucherDate,
          debit_amount: isReturnMode ? 0 : splitCash,
          credit_amount: isReturnMode ? splitCash : 0,
          narration: txLabel,
        });
      }
      if (splitCard > 0 && selectedType.pos_card_ledger_id) {
        ledgerEntries.push({
          company_id: selectedCompany.id,
          ledger_id: selectedType.pos_card_ledger_id,
          transaction_date: voucherDate,
          debit_amount: isReturnMode ? 0 : splitCard,
          credit_amount: isReturnMode ? splitCard : 0,
          narration: txLabel,
        });
      }
      if (splitOnline > 0 && selectedType.pos_online_ledger_id) {
        ledgerEntries.push({
          company_id: selectedCompany.id,
          ledger_id: selectedType.pos_online_ledger_id,
          transaction_date: voucherDate,
          debit_amount: isReturnMode ? 0 : splitOnline,
          credit_amount: isReturnMode ? splitOnline : 0,
          narration: txLabel,
        });
      }

      // Sales/Return account:
      // Sale: CREDIT (income) — Credit Note: DEBIT (income reversal)
      ledgerEntries.push({
        company_id: selectedCompany.id,
        ledger_id: selectedType.pos_sales_ledger_id,
        transaction_date: voucherDate,
        debit_amount: isReturnMode ? salesCredit : 0,
        credit_amount: isReturnMode ? 0 : salesCredit,
        narration: txLabel,
      });

      // Tax ledger entries:
      // Sale: CREDIT tax (tax liability) — Credit Note: DEBIT (tax liability reversal)
      if (splitTaxGST) {
        const halfTax = totalTax / 2;
        if (selectedType.pos_cgst_ledger_id) {
          const cgstAmt = selectedType.pos_sgst_ledger_id ? halfTax : totalTax;
          ledgerEntries.push({
            company_id: selectedCompany.id,
            ledger_id: selectedType.pos_cgst_ledger_id,
            transaction_date: voucherDate,
            debit_amount: isReturnMode ? cgstAmt : 0,
            credit_amount: isReturnMode ? 0 : cgstAmt,
            narration: `CGST on ${txLabel}`,
          });
        }
        if (selectedType.pos_sgst_ledger_id) {
          const sgstAmt = selectedType.pos_cgst_ledger_id ? halfTax : totalTax;
          ledgerEntries.push({
            company_id: selectedCompany.id,
            ledger_id: selectedType.pos_sgst_ledger_id,
            transaction_date: voucherDate,
            debit_amount: isReturnMode ? sgstAmt : 0,
            credit_amount: isReturnMode ? 0 : sgstAmt,
            narration: `SGST on ${txLabel}`,
          });
        }
      } else if (splitTaxVAT) {
        ledgerEntries.push({
          company_id: selectedCompany.id,
          ledger_id: selectedType.pos_tax_ledger_id,
          transaction_date: voucherDate,
          debit_amount: isReturnMode ? totalTax : 0,
          credit_amount: isReturnMode ? 0 : totalTax,
          narration: `Tax on ${txLabel}`,
        });
      }

      // Validate balance
      const totalDebit  = ledgerEntries.reduce((s, e) => s + (e.debit_amount  || 0), 0);
      const totalCredit = ledgerEntries.reduce((s, e) => s + (e.credit_amount || 0), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        toast({
          title: 'Balance Error',
          description: `Ledger entries are not balanced. Debit: ${totalDebit.toFixed(2)}, Credit: ${totalCredit.toFixed(2)}`,
          variant: 'destructive',
        });
        setSaving(false);
        return;
      }

      const details = cart.map(l => ({
        item_id: l.item.id,
        batch_id: l.batch_id || null,
        batch_number: l.batch_number || null,
        batch_allocations: l.batch_allocations || [],
        quantity: l.qty,
        rate: l.rate,
        amount: l.amount,
        discount_percent: l.discount_percent,
        discount_amount: l.discount_amount,
        tax_percent: l.tax_percent,
        tax_amount: l.tax_amount,
        net_amount: l.net_amount,
      }));

      // Primary ledger_id: first payment method used (for backward compat / ledger balance tracking)
      const primaryLedgerId =
        (splitCash > 0 ? selectedType.pos_cash_ledger_id : null) ||
        (splitCard > 0 ? selectedType.pos_card_ledger_id : null) ||
        (splitOnline > 0 ? selectedType.pos_online_ledger_id : null);

      const payload = {
        company_id: selectedCompany.id,
        voucher_type: selectedType.base_type,
        voucher_type_id: selectedType.id,
        is_pos: true,
        voucher_number: voucherNumber,
        voucher_date: voucherDate,
        ledger_id: primaryLedgerId,
        narration: narration,
        original_doc_id: originalDocId || null,
        optional: false,
        total_amount: subtotal,
        tax_amount: totalTax,
        net_amount: grandTotal,
        pos_cash_amount: splitCash || null,
        pos_card_amount: splitCard || null,
        pos_online_amount: splitOnline || null,
        pos_cash_tendered: splitCash > 0 && cashTenderedNum > 0 ? cashTenderedNum : null,
        pos_card_ref: splitCard > 0 && cardRef.trim() ? cardRef.trim() : null,
        pos_online_ref: splitOnline > 0 && onlineRef.trim() ? onlineRef.trim() : null,
        details,
        ledger_entries: ledgerEntries,
      };

      const res = await fetch(
        isEditMode ? `${API_BASE_URL}/vouchers/${editVoucherId}` : `${API_BASE_URL}/vouchers`,
        {
          method: isEditMode ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to save');

      setLastVoucherNo(voucherNumber);
      setPayDialogOpen(false);
      setSuccessDialogOpen(true);
      if (!isEditMode) {
        clearCart();
        setSplitAmounts({ cash: '', card: '', online: '' });
        setCashTendered('');
        setCardRef('');
        setOnlineRef('');
        setNarration('');
        setOriginalDocId('');
        setIsHold(false);
        // Refresh voucher number
        setSelectedType(t => t ? { ...t } : t);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── No POS types configured
  if (!loading && posTypes.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 text-muted-foreground">
        <Package className="h-12 w-12" />
        <p className="text-lg font-semibold">No POS Voucher Types Configured</p>
        <p className="text-sm">Go to Voucher Type Master and enable POS on a Sales or Credit Note type.</p>
        <Button onClick={() => navigate('/voucher-types')}>Manage Voucher Types</Button>
        <Button variant="outline" onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Ledger options (removed — ledgers now come from Voucher Type config)

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* ── Top bar */}
      <header className="flex-shrink-0 flex items-center gap-3 px-4 py-2 border-b bg-card shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <span className="font-semibold text-lg">POS</span>
          {selectedCompany && <span className="text-muted-foreground text-sm">— {selectedCompany.name}</span>}
        </div>

        {/* Voucher type selector */}
        {posTypes.length > 1 && (
          <Select
            value={selectedType?.id || ''}
            onValueChange={id => {
              const t = posTypes.find(p => p.id === id);
              if (t) setSelectedType(t);
            }}
          >
            <SelectTrigger className="w-44 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {posTypes.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {posTypes.length === 1 && (
          <Badge variant="outline">{selectedType?.name}</Badge>
        )}

        {/* Against original POS — shown inline when return mode */}
        {isReturnMode && (
          <div className="flex items-center gap-1">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Against POS #</Label>
            <Select
              value={originalDocId || '__none__'}
              onValueChange={async (id) => {
                const realId = id === '__none__' ? '' : id;
                setOriginalDocId(realId);
                if (!realId) { setCart([]); return; }
                try {
                  const res = await fetch(`${API_BASE_URL}/vouchers/${realId}`);
                  const json = await res.json();
                  const orig = json?.data;
                  if (!orig) return;
                  const itemDetails = (orig.details || []).filter((d: any) => !!d.item_id);
                  const cartLines: CartItem[] = itemDetails.map((d: any, idx: number) => {
                    const itemMaster = items.find(i => i.id === d.item_id);
                    if (!itemMaster) return null;
                    return {
                      id: `ret-${d.item_id}-${idx}`,
                      item: itemMaster,
                      qty: Number(d.quantity || 1),
                      rate: Number(d.rate || 0),
                      discount_percent: Number(d.discount_percent || 0),
                      discount_amount: Number(d.discount_amount || 0),
                      tax_percent: Number(d.tax_percent || 0),
                      tax_amount: Number(d.tax_amount || 0),
                      amount: Number(d.amount || 0),
                      net_amount: Number(d.net_amount || 0),
                      batch_id: null,
                      batch_number: null,
                      batch_allocations: [],
                    } as CartItem;
                  }).filter(Boolean) as CartItem[];
                  setCart(cartLines);
                } catch (e) {
                  console.error('Failed to load original POS voucher', e);
                }
              }}
            >
              <SelectTrigger className="h-8 w-52 text-sm">
                <SelectValue placeholder="Select original POS bill…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Manual Return —</SelectItem>
                {posOriginalVouchers.map(v => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.voucher_number} — {v.voucher_date}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {originalDocId && (
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => { setOriginalDocId(''); setCart([]); }}>
                Clear
              </Button>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          {/* Hold Bills button: show list of held POS bills */}
          {!isReturnMode && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs border-amber-400 text-amber-600 hover:bg-amber-50"
              onClick={async () => {
                try {
                  const res = await fetch(`${API_BASE_URL}/vouchers/report/held-pos?companyId=${selectedCompany?.id}`);
                  const json = await res.json();
                  setHoldVouchers(json.data || []);
                  setRetakeDialogOpen(true);
                } catch {
                  toast({ title: 'Error', description: 'Could not load held bills', variant: 'destructive' });
                }
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Hold Bills
            </Button>
          )}
          <Label className="text-xs">Date</Label>
          <Input
            type="date"
            value={voucherDate}
            onChange={e => setVoucherDate(e.target.value)}
            className="h-8 w-36 text-sm"
          />
          <Label className="text-xs">Voucher No.</Label>
          <Input
            value={voucherNumber}
            readOnly
            className="h-8 w-32 text-sm bg-muted cursor-not-allowed"
          />
        </div>
      </header>

      {/* ── Main area: items grid + cart */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Item grid */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r">
          {/* Search bar */}
          <div className="flex-shrink-0 flex gap-2 px-3 pt-3 pb-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search or Scan Barcode…"
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs flex-shrink-0"
              onClick={() => setQuickCreateItemOpen(true)}
              title="Create new item"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              New Item
            </Button>
          </div>

          {/* Stock Group filter pills */}
          {groups.length > 0 && (
            <div className="flex-shrink-0 flex items-center gap-1.5 px-3 pb-1.5 flex-wrap">
              <button
                onClick={() => setGroupFilter('')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors border ${
                  groupFilter === ''
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-border hover:bg-muted'
                }`}
              >
                ALL
              </button>
              {groups.map(g => (
                <button
                  key={g}
                  onClick={() => { setGroupFilter(g === groupFilter ? '' : g); setCategoryFilter(''); }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors border ${
                    groupFilter === g
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-border hover:bg-muted'
                  }`}
                >
                  {g.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* Stock Category filter pills */}
          {categories.length > 0 && (
            <div className="flex-shrink-0 flex items-center gap-1.5 px-3 pb-2 flex-wrap border-b">
              <span className="text-[10px] text-muted-foreground mr-0.5">Category:</span>
              <button
                onClick={() => setCategoryFilter('')}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors border ${
                  categoryFilter === ''
                    ? 'bg-secondary text-secondary-foreground border-secondary'
                    : 'bg-background text-foreground border-border hover:bg-muted'
                }`}
              >
                All
              </button>
              {categories.map(c => (
                <button
                  key={c}
                  onClick={() => setCategoryFilter(c === categoryFilter ? '' : c)}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors border ${
                    categoryFilter === c
                      ? 'bg-secondary text-secondary-foreground border-secondary'
                      : 'bg-background text-foreground border-border hover:bg-muted'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* If neither groups nor categories, still show the bottom border */}
          {groups.length === 0 && categories.length === 0 && (
            <div className="flex-shrink-0 border-b" />
          )}

          {/* Grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                <Package className="h-8 w-8" />
                <p className="text-sm">No items found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {filteredItems.map(item => {
                  const inCart = cart.find(l => l.item.id === item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => addToCart(item)}
                      className={`group relative flex flex-col rounded-lg border overflow-hidden text-left transition-all hover:shadow-md hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30
                        ${inCart ? 'border-primary/60 bg-primary/5' : 'bg-card'}`}
                    >
                      {/* Image / placeholder */}
                      <div className="relative h-24 bg-muted/40 flex items-center justify-center overflow-hidden">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Package className="h-8 w-8 text-muted-foreground/40" />
                        )}
                        {inCart && (
                          <div className="absolute top-1 right-1 bg-primary text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                            {inCart.qty}
                          </div>
                        )}
                        {isBatchEnabled && item.enable_batches && (
                          <div className="absolute bottom-1 left-1 bg-blue-600 text-white text-[9px] font-semibold rounded px-1 py-0.5 leading-none">
                            Batch
                          </div>
                        )}
                      </div>
                      {/* Info */}
                      <div className="p-2 flex-1 flex flex-col gap-0.5">
                        <p className="text-xs font-medium line-clamp-2 leading-tight">{item.name}</p>
                        <p className="text-xs text-primary font-semibold mt-auto">
                          {currencySymbol}{fmt(getEffectiveRate(item, voucherDate))}
                        </p>
                        {item.uom_master && (
                          <p className="text-[10px] text-muted-foreground">/{item.uom_master.symbol || item.uom_master.name}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Cart + payment */}
        <div className="w-80 xl:w-96 flex-shrink-0 flex flex-col overflow-hidden bg-card">
          {/* Cart header */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">
                {isReturnMode ? 'Return' : 'Bill'} ({cart.length} item{cart.length !== 1 ? 's' : ''})
              </span>
            </div>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs text-destructive h-6 px-2" onClick={clearCart}>
                Clear
              </Button>
            )}
          </div>

          {/* Party + Sales ledger quick-select removed — ledgers come from Voucher Type config */}
          {/* Configuration warning if voucher type not fully configured */}
          {!isPosConfigured && (
            <div className="flex-shrink-0 px-3 py-2 border-b bg-orange-50 dark:bg-orange-950/20">
              <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">⚠️ Ledgers not configured</p>
              <p className="text-[10px] text-muted-foreground">
                {!selectedType?.pos_sales_ledger_id
                  ? 'Sales ledger missing.'
                  : 'No payment ledger configured.'}{' '}
                <button className="underline" onClick={() => navigate('/voucher-types')}>Configure in Voucher Type Master</button>
              </p>
            </div>
          )}

          {/* Cart lines */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                <ShoppingCart className="h-8 w-8" />
                <p className="text-sm">Cart is empty</p>
                <p className="text-xs">Tap items to add them</p>
              </div>
            ) : (
              <div className="divide-y">
                {cart.map(line => (
                  <div key={line.id} className="px-3 py-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{line.item.name}</p>
                        {line.batch_number && (
                          <button
                            className="text-[10px] text-blue-600 dark:text-blue-400 font-medium hover:underline text-left"
                            onClick={() => {
                              setPendingBatchItem(line.item);
                              setEditingBatchCartLineId(line.id);
                              setBatchAllocationDialogOpen(true);
                            }}
                            title="Click to change batch"
                          >
                            Batch: {line.batch_number} ✎
                          </button>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          {currencySymbol}{fmt(line.rate)} × {line.qty} = {currencySymbol}{fmt(line.qty * line.rate)}
                        </p>
                        {line.discount_amount > 0 && (
                          <p className="text-[10px] text-orange-500">
                            Disc: -{currencySymbol}{fmt(line.discount_amount)} → {currencySymbol}{fmt(line.amount)}
                          </p>
                        )}
                        {line.tax_percent > 0 && (
                          <p className="text-[10px] text-muted-foreground">
                            Tax {line.tax_percent}% = {currencySymbol}{fmt(line.tax_amount)}
                          </p>
                        )}
                      </div>
                      {/* Qty controls */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => updateQty(line.id, line.qty - 1)}
                          disabled={!!(isBatchEnabled && line.item.enable_batches && line.batch_id)}
                          className="w-6 h-6 rounded border flex items-center justify-center hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                          title={isBatchEnabled && line.item.enable_batches && line.batch_id ? 'Change qty via batch (click batch label)' : undefined}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-xs w-5 text-center font-medium">{line.qty}</span>
                        <button
                          onClick={() => updateQty(line.id, line.qty + 1)}
                          disabled={!!(isBatchEnabled && line.item.enable_batches && line.batch_id)}
                          className="w-6 h-6 rounded border flex items-center justify-center hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                          title={isBatchEnabled && line.item.enable_batches && line.batch_id ? 'Change qty via batch (click batch label)' : undefined}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => removeFromCart(line.id)}
                          className="w-6 h-6 rounded border flex items-center justify-center hover:bg-destructive/10 text-destructive ml-1"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    {/* Discount */}
                    <div className="flex items-center gap-1 mt-1">
                      {showDiscountColumn && (
                        <>
                          <Label className="text-[10px] text-muted-foreground">Disc%</Label>
                          <Input
                            type="number"
                            value={parseFloat(line.discount_percent.toFixed(4))}
                            min={0}
                            max={100}
                            step={0.5}
                            onChange={e => updateDiscount(line.id, parseFloat(e.target.value) || 0)}
                            className={`h-5 w-14 text-xs px-1${discountEntryMode === 'amount' ? ' bg-muted' : ''}`}
                            readOnly={discountEntryMode === 'amount'}
                          />
                          <Label className="text-[10px] text-muted-foreground ml-1">Amt</Label>
                          <Input
                            type="number"
                            value={parseFloat(line.discount_amount.toFixed(2))}
                            min={0}
                            step={0.01}
                            onChange={e => updateDiscountAmt(line.id, parseFloat(e.target.value) || 0)}
                            className={`h-5 w-16 text-xs px-1${discountEntryMode === 'percent' ? ' bg-muted' : ''}`}
                            readOnly={discountEntryMode === 'percent'}
                          />
                        </>
                      )}
                      <span className="text-[10px] text-primary font-semibold ml-auto">
                        {currencySymbol}{fmt(line.net_amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Totals + pay button */}
          <div className="flex-shrink-0 border-t bg-card">
            <div className="px-4 py-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{currencySymbol}{fmt(subtotal + totalDiscount)}</span>
              </div>
              {showDiscountColumn && totalDiscount > 0 && (
                <div className="flex justify-between text-sm text-orange-500">
                  <span>Discount</span>
                  <span>-{currencySymbol}{fmt(totalDiscount)}</span>
                </div>
              )}
              {isTaxEnabled && totalTax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax ({taxType})</span>
                  <span>{currencySymbol}{fmt(totalTax)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold border-t pt-1 mt-1">
                <span>Total</span>
                <span className="text-primary">{currencySymbol}{fmt(grandTotal)}</span>
              </div>
            </div>

            {/* Against original POS moved to header */}

            {/* Narration */}
            <div className="px-3 pb-2">
              <Input
                value={narration}
                onChange={e => setNarration(e.target.value)}
                placeholder="Narration (optional)"
                className="h-7 text-xs"
              />
            </div>

            <div className="px-3 pb-3 flex flex-col gap-2">
              {/* Hold button: save without payment — sales mode only */}
              {!isReturnMode && (
                <Button
                  variant="outline"
                  className="w-full h-9 text-sm font-medium border-amber-400 text-amber-600 hover:bg-amber-50"
                  disabled={cart.length === 0 || saving}
                  onClick={handleHold}
                >
                  {saving && isHold ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Hold Bill — {currencySymbol}{fmt(grandTotal)}
                </Button>
              )}
              <Button
                className="w-full h-10 text-base font-semibold"
                disabled={cart.length === 0 || saving || !isPosConfigured}
                onClick={openSettleDialog}
                variant={isReturnMode ? 'destructive' : 'default'}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {isReturnMode ? 'Process Return' : 'Settle Bill'} — {currencySymbol}{fmt(grandTotal)}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Payment Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{isReturnMode ? 'Refund Settlement' : 'Payment Settlement'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Amount due */}
            <div className="rounded-lg bg-primary/10 p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">{isReturnMode ? 'Refund Amount' : 'Amount Due'}</p>
              <p className="text-3xl font-bold text-primary">{currencySymbol}{fmt(grandTotal)}</p>
            </div>

            {/* Split payment amount inputs */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Payment Amounts</Label>
              {availablePayMethods.map(({ key, label, icon: Icon }) => (
                <div key={key} className="space-y-1.5">
                  {/* Amount row */}
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <Label className="text-sm flex-1">{label}</Label>
                    <Input
                      type="number"
                      value={splitAmounts[key]}
                      onChange={e => setSplitAmounts(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder="0.00"
                      min={0}
                      step={0.01}
                      className="h-8 w-32 text-sm"
                    />
                  </div>

                  {/* Cash sub-rows — tendered + balance */}
                  {key === 'cash' && splitCash > 0 && (
                    <div className="pl-6 space-y-1">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground flex-1">Tendered</Label>
                        <Input
                          type="number"
                          value={cashTendered}
                          onChange={e => setCashTendered(e.target.value)}
                          placeholder={splitAmounts.cash}
                          min={0}
                          step={0.01}
                          className={`h-8 w-32 text-sm ${cashTenderedNum > 0 && cashTenderedNum < splitCash ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                        />
                      </div>
                      {cashTenderedNum > 0 && (
                        <div className="flex items-center justify-between">
                          {cashTenderedNum < splitCash ? (
                            <span className="text-xs text-destructive">Tendered is less than cash amount</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Balance (Change)</span>
                          )}
                          <span className={`text-xs font-semibold ${cashChange >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                            {currencySymbol}{fmt(cashChange)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Card — last 4 digits / card number ref */}
                  {key === 'card' && splitCard > 0 && (
                    <div className="flex items-center gap-2 pl-6">
                      <Label className="text-xs text-muted-foreground flex-1">Card No. (last 4)</Label>
                      <Input
                        type="text"
                        value={cardRef}
                        onChange={e => setCardRef(e.target.value)}
                        placeholder="e.g. 4321"
                        maxLength={20}
                        className="h-8 w-32 text-sm"
                      />
                    </div>
                  )}

                  {/* Online — reference / UTR number */}
                  {key === 'online' && splitOnline > 0 && (
                    <div className="flex items-center gap-2 pl-6">
                      <Label className="text-xs text-muted-foreground flex-1">Reference / UTR</Label>
                      <Input
                        type="text"
                        value={onlineRef}
                        onChange={e => setOnlineRef(e.target.value)}
                        placeholder="e.g. UTR123456"
                        maxLength={50}
                        className="h-8 w-32 text-sm"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Running total / remaining indicator */}
            <div className={`flex justify-between items-center rounded-md p-2.5 text-sm font-medium
              ${isSettled
                ? 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400'
                : 'bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400'}`}>
              <span>Total Entered</span>
              <div className="text-right">
                <span className="font-bold">{currencySymbol}{fmt(splitTotal)}</span>
                {!isSettled && (
                  <p className="text-xs font-normal mt-0.5">
                    {splitRemaining > 0
                      ? `Remaining: ${currencySymbol}${fmt(splitRemaining)}`
                      : `Excess: ${currencySymbol}${fmt(-splitRemaining)}`}
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSettle}
              disabled={saving || !isSettled}
              className="min-w-24"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm & Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Batch Allocation Dialog (for enable_batches items — same as InventoryVchForms) */}
      {pendingBatchItem && (
        <BatchAllocationDialog
          open={batchAllocationDialogOpen}
          onClose={() => {
            setBatchAllocationDialogOpen(false);
            setPendingBatchItem(null);
            setEditingBatchCartLineId(null);
          }}
          itemId={pendingBatchItem.id}
          itemName={pendingBatchItem.name}
          requiredQuantity={
            editingBatchCartLineId
              ? (cart.find(l => l.id === editingBatchCartLineId)?.qty ?? 1)
              : 1
          }
          companyId={selectedCompany?.id || ''}
          onBatchAllocationsSelect={handleBatchAllocationsSelect}
          batchesEnabled={true}
          maxAllocations={1}
          initialAllocations={
            editingBatchCartLineId
              ? (cart.find(l => l.id === editingBatchCartLineId)?.batch_allocations ?? [])
              : []
          }
          companySettings={selectedCompany}
          itemData={{
            cgst_rate: pendingBatchItem.cgst_rate,
            sgst_rate: pendingBatchItem.sgst_rate,
            igst_rate: pendingBatchItem.igst_rate,
            tax_rate: pendingBatchItem.tax_rate,
          }}
        />
      )}

      {/* ── Batch Selection Dialog (simple pick — fallback, not used for enable_batches items) */}
      {pendingBatchItem && (
        <BatchSelectionDialog
          open={batchDialogOpen}
          onClose={() => { setBatchDialogOpen(false); setPendingBatchItem(null); }}
          itemId={pendingBatchItem.id}
          itemName={pendingBatchItem.name}
          requiredQuantity={1}
          companyId={selectedCompany?.id || ''}
          onBatchSelect={handleBatchSelect}
        />
      )}

      {/* ── Quick Create Item Dialog */}
      <QuickCreateItemDialog
        open={quickCreateItemOpen}
        onClose={() => setQuickCreateItemOpen(false)}
        onCreated={(item) => {
          setItems(prev => [...prev, item as ItemMaster]);
          addToCart(item as ItemMaster);
        }}
      />

      {/* ── Hold Bills Dialog: list of held (optional) POS vouchers */}
      <Dialog open={retakeDialogOpen} onOpenChange={setRetakeDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-amber-500" /> Hold Bills
            </DialogTitle>
          </DialogHeader>
          {holdVouchers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No held bills found.</p>
          ) : (
            <div className="divide-y max-h-80 overflow-y-auto">
              {holdVouchers.map((v: any) => (
                <div key={v.id} className="flex items-center justify-between py-2 px-1 hover:bg-muted/50 rounded">
                  <div>
                    <p className="text-sm font-medium">{v.voucher_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.voucher_date} · {v.net_amount?.toFixed(2)} · {v.details?.length || (v.inventory?.length) || 0} item(s)
                    </p>
                    {v.narration && <p className="text-xs text-muted-foreground italic">{v.narration}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => {
                      setRetakeDialogOpen(false);
                      navigate(`/pos?edit=${v.id}`);
                    }}
                  >
                    Open
                  </Button>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRetakeDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Success Dialog */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent className="max-w-sm text-center">
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <div>
              <p className="text-xl font-bold text-green-700">
                {isEditMode ? 'Voucher Updated!' : 'Payment Successful!'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">Voucher: <strong>{lastVoucherNo}</strong></p>
            </div>
            <div className="flex gap-2 w-full">
              {!isEditMode && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setSuccessDialogOpen(false); searchRef.current?.focus(); }}
                >
                  New Sale
                </Button>
              )}
              <Button
                className="flex-1"
                onClick={() => navigate(isEditMode ? -1 as any : '/dashboard')}
              >
                {isEditMode ? 'Back' : 'Dashboard'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default POSScreen;
