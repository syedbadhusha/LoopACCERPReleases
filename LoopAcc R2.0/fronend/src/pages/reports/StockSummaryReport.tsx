import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Printer } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { format } from 'date-fns';

interface StockItem {
  item_id: string;
  item_name: string;
  stock_group_id?: string;
  stock_group_name?: string;
  stock_category_id?: string;
  stock_category_name?: string;
  uom?: string;
  opening_stock: number;
  opening_value: number;
  purchases: number;
  purchase_value: number;
  sales: number;
  sales_value: number;
  closing_stock: number;
  closing_value: number;
}

type ItemState = {
  qty: number;
  value: number;
};

type FilterOption = {
  id: string;
  name: string;
};

const INWARD_VOUCHER_TYPES = new Set(['purchase', 'receipt', 'credit-note']);
const OUTWARD_VOUCHER_TYPES = new Set(['sales', 'issue', 'debit-note']);

const calculateRate = (qty: number, value: number) => {
  if (!Number.isFinite(qty) || Math.abs(qty) < 0.000001) {
    return 0;
  }
  const rate = value / qty;
  return Number.isFinite(rate) ? rate : 0;
};

const money = (value: any) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/[\s,₹$]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeVoucherDate = (value: any) => String(value || '').slice(0, 10);

const getInventoryLines = (voucher: any) => {
  if (Array.isArray(voucher?.inventory) && voucher.inventory.length > 0) {
    return voucher.inventory.filter((line: any) => line?.item_id);
  }

  if (Array.isArray(voucher?.details) && voucher.details.length > 0) {
    return voucher.details.filter((line: any) => line?.item_id);
  }

  return [];
};

const computeInventoryLineQty = (line: any) => Math.abs(money(line?.quantity));

const computeInventoryLineAmount = (line: any) => {
  const explicitAmount = Math.abs(money(line?.amount));
  if (explicitAmount > 0) {
    return explicitAmount;
  }

  const explicitNetAmount = Math.abs(money(line?.net_amount));
  if (explicitNetAmount > 0) {
    return explicitNetAmount;
  }

  const qty = Math.abs(money(line?.quantity));
  const rate = Math.abs(money(line?.rate));
  return qty * rate;
};

const qtyColumnStyle = { minWidth: '90px', whiteSpace: 'nowrap' as const };
const rateColumnStyle = { minWidth: '110px', whiteSpace: 'nowrap' as const };
const valueColumnStyle = { minWidth: '140px', whiteSpace: 'nowrap' as const };

const StockSummaryReport = () => {
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(format(new Date(new Date().getFullYear(), 3, 1), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedItemId, setSelectedItemId] = useState('all');
  const [selectedStockGroupId, setSelectedStockGroupId] = useState('all');
  const [selectedStockCategoryId, setSelectedStockCategoryId] = useState('all');
  const [itemOptions, setItemOptions] = useState<FilterOption[]>([]);
  const [stockGroupOptions, setStockGroupOptions] = useState<FilterOption[]>([]);
  const [stockCategoryOptions, setStockCategoryOptions] = useState<FilterOption[]>([]);

  useEffect(() => {
    if (selectedCompany) {
      fetchStockData();
    }
  }, [selectedCompany, dateFrom, dateTo]);

  const fetchStockData = async () => {
    if (!selectedCompany) return;

    try {
      setLoading(true);

      const normalizedDateFrom = dateFrom <= dateTo ? dateFrom : dateTo;
      const normalizedDateTo = dateFrom <= dateTo ? dateTo : dateFrom;

      const params = new URLSearchParams({
        companyId: selectedCompany.id,
      });

      const [itemResp, voucherResp] = await Promise.all([
        fetch(`http://localhost:5000/api/items?${params}`),
        fetch(`http://localhost:5000/api/vouchers?${params}`),
      ]);

      if (!itemResp.ok) throw new Error('Failed to fetch items');
      if (!voucherResp.ok) throw new Error('Failed to fetch vouchers');

      const itemJson = await itemResp.json();
      const voucherJson = await voucherResp.json();
      const items = itemJson?.data || [];
      const vouchers = voucherJson?.data || [];

      const normalizedItems = Array.isArray(items) ? items : [];

      const itemFilterData: FilterOption[] = normalizedItems
        .map((item: any) => ({
          id: String(item?.id || ''),
          name: String(item?.name || ''),
        }))
        .filter((item: FilterOption) => item.id && item.name)
        .sort((left, right) => left.name.localeCompare(right.name));

      const groupFilterMap = new Map<string, string>();
      const categoryFilterMap = new Map<string, string>();
      for (const item of normalizedItems) {
        const stockGroupId = String(item?.stock_group_id || item?.stock_groups?.id || '');
        const stockGroupName = String(item?.stock_groups?.name || '').trim();
        if (stockGroupId) {
          groupFilterMap.set(stockGroupId, stockGroupName || 'Uncategorized Group');
        }

        const stockCategoryId = String(item?.stock_category_id || item?.stock_categories?.id || '');
        const stockCategoryName = String(item?.stock_categories?.name || '').trim();
        if (stockCategoryId) {
          categoryFilterMap.set(stockCategoryId, stockCategoryName || 'Uncategorized Category');
        }
      }

      const groupFilterData: FilterOption[] = Array.from(groupFilterMap.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((left, right) => left.name.localeCompare(right.name));

      const categoryFilterData: FilterOption[] = Array.from(categoryFilterMap.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((left, right) => left.name.localeCompare(right.name));

      setItemOptions(itemFilterData);
      setStockGroupOptions(groupFilterData);
      setStockCategoryOptions(categoryFilterData);

      const itemById = new Map<string, any>();
      const openingState = new Map<string, ItemState>();
      const closingState = new Map<string, ItemState>();
      const periodMovement = new Map<string, { purchases: number; purchase_value: number; sales: number; sales_value: number }>();

      for (const item of items) {
        const itemId = String(item?.id || '');
        if (!itemId) continue;

        const openingQty = money(item?.opening_stock ?? item?.opening_qty);
        const openingValueRaw = money(item?.opening_value);
        const openingValue = openingValueRaw !== 0 ? openingValueRaw : openingQty * money(item?.rate);

        itemById.set(itemId, item);
        openingState.set(itemId, { qty: openingQty, value: openingValue });
        closingState.set(itemId, { qty: openingQty, value: openingValue });
        periodMovement.set(itemId, { purchases: 0, purchase_value: 0, sales: 0, sales_value: 0 });
      }

      const applyInward = (state: ItemState, qty: number, value: number) => {
        state.qty += qty;
        state.value += value;
      };

      const applyOutward = (state: ItemState, qty: number) => {
        const avgRate = state.qty > 0 ? state.value / state.qty : 0;
        const qtyToReduce = Math.min(state.qty, qty);
        const outwardValueAtCost = qtyToReduce * avgRate;
        state.qty = Math.max(0, state.qty - qtyToReduce);
        state.value = Math.max(0, state.value - outwardValueAtCost);
      };

      const vouchersSorted = [...vouchers].sort((a: any, b: any) => {
        const d1 = normalizeVoucherDate(a?.voucher_date);
        const d2 = normalizeVoucherDate(b?.voucher_date);
        return d1.localeCompare(d2);
      });

      for (const voucher of vouchersSorted) {
        const voucherDate = normalizeVoucherDate(voucher?.voucher_date);
        if (!voucherDate || voucherDate > normalizedDateTo) {
          continue;
        }

        const voucherType = String(voucher?.voucher_type || '').toLowerCase();
        const isInward = INWARD_VOUCHER_TYPES.has(voucherType);
        const isOutward = OUTWARD_VOUCHER_TYPES.has(voucherType);
        if (!isInward && !isOutward) {
          continue;
        }

        const lines = getInventoryLines(voucher);
        for (const line of lines) {
          const itemId = String(line?.item_id || '');
          if (!itemId) continue;
          if (!itemById.has(itemId)) continue;

          const qty = computeInventoryLineQty(line);
          if (qty <= 0) continue;
          const amount = computeInventoryLineAmount(line);
          const inPeriod = voucherDate >= normalizedDateFrom && voucherDate <= normalizedDateTo;
          const beforePeriod = voucherDate < normalizedDateFrom;

          const open = openingState.get(itemId) || { qty: 0, value: 0 };
          const close = closingState.get(itemId) || { qty: 0, value: 0 };
          const movement = periodMovement.get(itemId) || { purchases: 0, purchase_value: 0, sales: 0, sales_value: 0 };

          if (isInward) {
            if (beforePeriod) {
              applyInward(open, qty, amount);
            }
            applyInward(close, qty, amount);

            if (inPeriod) {
              movement.purchases += qty;
              movement.purchase_value += amount;
            }
          } else if (isOutward) {
            if (beforePeriod) {
              applyOutward(open, qty);
            }
            applyOutward(close, qty);

            if (inPeriod) {
              movement.sales += qty;
              movement.sales_value += amount;
            }
          }

          openingState.set(itemId, open);
          closingState.set(itemId, close);
          periodMovement.set(itemId, movement);
        }
      }

      const stockSummary: StockItem[] = items.map((item: any) => {
        const itemId = String(item?.id || '');
        const opening = openingState.get(itemId) || { qty: 0, value: 0 };
        const closing = closingState.get(itemId) || { qty: 0, value: 0 };
        const movement = periodMovement.get(itemId) || {
          purchases: 0,
          purchase_value: 0,
          sales: 0,
          sales_value: 0,
        };

        return {
          item_id: itemId,
          item_name: String(item?.name || ''),
          stock_group_id: String(item?.stock_group_id || item?.stock_groups?.id || ''),
          stock_group_name: String(item?.stock_groups?.name || '').trim() || 'Uncategorized Group',
          stock_category_id: String(item?.stock_category_id || item?.stock_categories?.id || ''),
          stock_category_name: String(item?.stock_categories?.name || '').trim() || 'Uncategorized Category',
          uom: String(item?.uom || ''),
          opening_stock: opening.qty,
          opening_value: opening.value,
          purchases: movement.purchases,
          purchase_value: movement.purchase_value,
          sales: movement.sales,
          sales_value: movement.sales_value,
          closing_stock: closing.qty,
          closing_value: closing.value,
        };
      }).filter((item) => {
        const totalMovement =
          Math.abs(item.opening_stock) +
          Math.abs(item.opening_value) +
          Math.abs(item.purchases) +
          Math.abs(item.purchase_value) +
          Math.abs(item.sales) +
          Math.abs(item.sales_value) +
          Math.abs(item.closing_stock) +
          Math.abs(item.closing_value);
        return totalMovement > 0.000001;
      });

      setStockData(stockSummary);
    } catch (error) {
      console.error('Error fetching stock data:', error);
    } finally {
      setLoading(false);
    }
  };
  const currencySymbol = selectedCompany?.currency === 'INR' ? '₹' : selectedCompany?.currency === 'USD' ? '$' : selectedCompany?.currency || '₹';

  const filteredStockData = useMemo(() => {
    return stockData.filter((item) => {
      if (selectedItemId !== 'all' && item.item_id !== selectedItemId) return false;
      if (selectedStockGroupId !== 'all' && item.stock_group_id !== selectedStockGroupId) return false;
      if (selectedStockCategoryId !== 'all' && item.stock_category_id !== selectedStockCategoryId) return false;
      return true;
    });
  }, [stockData, selectedItemId, selectedStockGroupId, selectedStockCategoryId]);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const totalOpeningValue = filteredStockData.reduce((sum, item) => sum + item.opening_value, 0);
    const totalOpeningQty = filteredStockData.reduce((sum, item) => sum + item.opening_stock, 0);
    const totalPurchaseValue = filteredStockData.reduce((sum, item) => sum + item.purchase_value, 0);
    const totalPurchaseQty = filteredStockData.reduce((sum, item) => sum + item.purchases, 0);
    const totalSalesValue = filteredStockData.reduce((sum, item) => sum + item.sales_value, 0);
    const totalSalesQty = filteredStockData.reduce((sum, item) => sum + item.sales, 0);
    const totalClosingValue = filteredStockData.reduce((sum, item) => sum + item.closing_value, 0);
    const totalClosingQty = filteredStockData.reduce((sum, item) => sum + item.closing_stock, 0);

    printWindow.document.write(`
      <html>
        <head>
          <title>Stock Summary</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            h1 { margin: 0; }
            .period { margin: 10px 0; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 11px; }
            th, td { border: 1px solid #000; padding: 6px; text-align: left; }
            th { background-color: #f0f0f0; font-weight: bold; }
            .text-right { text-align: right; }
            .total-row { font-weight: bold; background-color: #f0f0f0; }
            .qty-col { min-width: 90px; white-space: nowrap; }
            .rate-col { min-width: 110px; white-space: nowrap; }
            .value-col { min-width: 140px; white-space: nowrap; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${selectedCompany?.name}</h1>
            <h2>STOCK SUMMARY</h2>
            <div class="period">Period: ${format(new Date(dateFrom), 'dd/MM/yyyy')} to ${format(new Date(dateTo), 'dd/MM/yyyy')}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Stock Group</th>
                <th>Stock Category</th>
                <th class="text-right qty-col">Opening Qty</th>
                <th class="text-right rate-col">Opening Rate</th>
                <th class="text-right value-col">Opening Value</th>
                <th class="text-right qty-col">Inward</th>
                <th class="text-right rate-col">Inward Rate</th>
                <th class="text-right value-col">Inward Amount</th>
                <th class="text-right qty-col">Outward</th>
                <th class="text-right rate-col">Outward Rate</th>
                <th class="text-right value-col">Outward Amount</th>
                <th class="text-right qty-col">Closing Qty</th>
                <th class="text-right rate-col">Closing Rate</th>
                <th class="text-right value-col">Closing Value</th>
              </tr>
            </thead>
            <tbody>
              ${filteredStockData.map(item => `
                <tr>
                  <td>${item.item_name}</td>
                  <td>${item.stock_group_name || ''}</td>
                  <td>${item.stock_category_name || ''}</td>
                  <td class="text-right qty-col">${item.opening_stock.toFixed(2)}</td>
                  <td class="text-right rate-col">${calculateRate(item.opening_stock, item.opening_value).toFixed(2)}</td>
                  <td class="text-right value-col">${currencySymbol} ${item.opening_value.toFixed(2)}</td>
                  <td class="text-right qty-col">${item.purchases.toFixed(2)}</td>
                  <td class="text-right rate-col">${calculateRate(item.purchases, item.purchase_value).toFixed(2)}</td>
                  <td class="text-right value-col">${currencySymbol} ${item.purchase_value.toFixed(2)}</td>
                  <td class="text-right qty-col">${item.sales.toFixed(2)}</td>
                  <td class="text-right rate-col">${calculateRate(item.sales, item.sales_value).toFixed(2)}</td>
                  <td class="text-right value-col">${currencySymbol} ${item.sales_value.toFixed(2)}</td>
                  <td class="text-right qty-col">${item.closing_stock.toFixed(2)}</td>
                  <td class="text-right rate-col">${calculateRate(item.closing_stock, item.closing_value).toFixed(2)}</td>
                  <td class="text-right value-col">${currencySymbol} ${item.closing_value.toFixed(2)}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td><strong>TOTAL</strong></td>
                <td></td>
                <td></td>
                <td class="text-right qty-col"></td>
                <td class="text-right rate-col"><strong>${calculateRate(totalOpeningQty, totalOpeningValue).toFixed(2)}</strong></td>
                <td class="text-right value-col"><strong>${currencySymbol} ${totalOpeningValue.toFixed(2)}</strong></td>
                <td class="text-right qty-col"></td>
                <td class="text-right rate-col"><strong>${calculateRate(totalPurchaseQty, totalPurchaseValue).toFixed(2)}</strong></td>
                <td class="text-right value-col"><strong>${currencySymbol} ${totalPurchaseValue.toFixed(2)}</strong></td>
                <td class="text-right qty-col"></td>
                <td class="text-right rate-col"><strong>${calculateRate(totalSalesQty, totalSalesValue).toFixed(2)}</strong></td>
                <td class="text-right value-col"><strong>${currencySymbol} ${totalSalesValue.toFixed(2)}</strong></td>
                <td class="text-right qty-col"></td>
                <td class="text-right rate-col"><strong>${calculateRate(totalClosingQty, totalClosingValue).toFixed(2)}</strong></td>
                <td class="text-right value-col"><strong>${currencySymbol} ${totalClosingValue.toFixed(2)}</strong></td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  if (!selectedCompany) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">No Company Selected</h1>
          <p className="text-muted-foreground">Please select a company to view stock summary.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Button variant="ghost" onClick={() => { if (window.history.length > 1) { navigate(-1); } else { navigate('/reports'); } }} className="mr-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">Stock Summary</h1>
          </div>
          <Button onClick={handlePrint} variant="outline">
            <Printer className="h-4 w-4 mr-2" />
            Print Report
          </Button>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filter Options</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4 flex-wrap">
            <div className="min-w-[220px]">
              <Label>Stock Item</Label>
              <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="All Items" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Items</SelectItem>
                  {itemOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[220px]">
              <Label>Stock Group</Label>
              <Select value={selectedStockGroupId} onValueChange={setSelectedStockGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="All Stock Groups" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stock Groups</SelectItem>
                  {stockGroupOptions.map((group) => (
                    <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[220px]">
              <Label>Stock Category</Label>
              <Select value={selectedStockCategoryId} onValueChange={setSelectedStockCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="All Stock Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stock Categories</SelectItem>
                  {stockCategoryOptions.map((category) => (
                    <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="date-from">From Date</Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="date-to">To Date</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stock Summary Report</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-4">Loading...</div>
            ) : filteredStockData.length > 0 ? (
              <div className="overflow-x-auto">
                <Table className="border border-border">
                  <TableHeader>
                    <TableRow>
                      <TableHead rowSpan={2} className="align-middle" style={{ minWidth: '200px' }}>Item Name</TableHead>
                      <TableHead rowSpan={2} className="align-middle" style={{ minWidth: '170px' }}>Stock Group</TableHead>
                      <TableHead rowSpan={2} className="align-middle" style={{ minWidth: '170px' }}>Stock Category</TableHead>
                      <TableHead colSpan={3} className="text-center border-b">Opening</TableHead>
                      <TableHead colSpan={3} className="text-center border-b">Inward</TableHead>
                      <TableHead colSpan={3} className="text-center border-b">Outward</TableHead>
                      <TableHead colSpan={3} className="text-center border-b">Closing</TableHead>
                    </TableRow>
                    <TableRow>
                      <TableHead className="text-right" style={qtyColumnStyle}>Qty</TableHead>
                      <TableHead className="text-right" style={rateColumnStyle}>Rate</TableHead>
                      <TableHead className="text-right" style={valueColumnStyle}>Amount</TableHead>
                      <TableHead className="text-right" style={qtyColumnStyle}>Qty</TableHead>
                      <TableHead className="text-right" style={rateColumnStyle}>Rate</TableHead>
                      <TableHead className="text-right" style={valueColumnStyle}>Amount</TableHead>
                      <TableHead className="text-right" style={qtyColumnStyle}>Qty</TableHead>
                      <TableHead className="text-right" style={rateColumnStyle}>Rate</TableHead>
                      <TableHead className="text-right" style={valueColumnStyle}>Amount</TableHead>
                      <TableHead className="text-right" style={qtyColumnStyle}>Qty</TableHead>
                      <TableHead className="text-right" style={rateColumnStyle}>Rate</TableHead>
                      <TableHead className="text-right" style={valueColumnStyle}>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStockData.map((item) => (
                      <TableRow
                        key={item.item_id}
                        className="cursor-pointer hover:bg-muted/60"
                        onClick={() => navigate(`/reports/stock-item-vouchers?itemId=${encodeURIComponent(item.item_id)}&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`)}
                      >
                        <TableCell style={{ minWidth: '200px' }}>{item.item_name}</TableCell>
                        <TableCell style={{ minWidth: '170px' }}>{item.stock_group_name || ''}</TableCell>
                        <TableCell style={{ minWidth: '170px' }}>{item.stock_category_name || ''}</TableCell>
                        <TableCell className="text-right" style={qtyColumnStyle}>{item.opening_stock.toFixed(2)}</TableCell>
                        <TableCell className="text-right" style={rateColumnStyle}>{calculateRate(item.opening_stock, item.opening_value).toFixed(2)}</TableCell>
                        <TableCell className="text-right" style={valueColumnStyle}>{currencySymbol} {item.opening_value.toFixed(2)}</TableCell>
                        <TableCell className="text-right" style={qtyColumnStyle}>{item.purchases.toFixed(2)}</TableCell>
                        <TableCell className="text-right" style={rateColumnStyle}>{calculateRate(item.purchases, item.purchase_value).toFixed(2)}</TableCell>
                        <TableCell className="text-right" style={valueColumnStyle}>{currencySymbol} {item.purchase_value.toFixed(2)}</TableCell>
                        <TableCell className="text-right" style={qtyColumnStyle}>{item.sales.toFixed(2)}</TableCell>
                        <TableCell className="text-right" style={rateColumnStyle}>{calculateRate(item.sales, item.sales_value).toFixed(2)}</TableCell>
                        <TableCell className="text-right" style={valueColumnStyle}>{currencySymbol} {item.sales_value.toFixed(2)}</TableCell>
                        <TableCell className="text-right" style={qtyColumnStyle}>{item.closing_stock.toFixed(2)}</TableCell>
                        <TableCell className="text-right" style={rateColumnStyle}>{calculateRate(item.closing_stock, item.closing_value).toFixed(2)}</TableCell>
                        <TableCell className="text-right" style={valueColumnStyle}>{currencySymbol} {item.closing_value.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold bg-muted/50">
                      <TableCell>Total</TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell style={qtyColumnStyle}></TableCell>
                      <TableCell className="text-right" style={rateColumnStyle}>
                        {calculateRate(
                          filteredStockData.reduce((sum, item) => sum + item.opening_stock, 0),
                          filteredStockData.reduce((sum, item) => sum + item.opening_value, 0)
                        ).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right" style={valueColumnStyle}>
                        {currencySymbol} {filteredStockData.reduce((sum, item) => sum + item.opening_value, 0).toFixed(2)}
                      </TableCell>
                      <TableCell style={qtyColumnStyle}></TableCell>
                      <TableCell className="text-right" style={rateColumnStyle}>
                        {calculateRate(
                          filteredStockData.reduce((sum, item) => sum + item.purchases, 0),
                          filteredStockData.reduce((sum, item) => sum + item.purchase_value, 0)
                        ).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right" style={valueColumnStyle}>
                        {currencySymbol} {filteredStockData.reduce((sum, item) => sum + item.purchase_value, 0).toFixed(2)}
                      </TableCell>
                      <TableCell style={qtyColumnStyle}></TableCell>
                      <TableCell className="text-right" style={rateColumnStyle}>
                        {calculateRate(
                          filteredStockData.reduce((sum, item) => sum + item.sales, 0),
                          filteredStockData.reduce((sum, item) => sum + item.sales_value, 0)
                        ).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right" style={valueColumnStyle}>
                        {currencySymbol} {filteredStockData.reduce((sum, item) => sum + item.sales_value, 0).toFixed(2)}
                      </TableCell>
                      <TableCell style={qtyColumnStyle}></TableCell>
                      <TableCell className="text-right" style={rateColumnStyle}>
                        {calculateRate(
                          filteredStockData.reduce((sum, item) => sum + item.closing_stock, 0),
                          filteredStockData.reduce((sum, item) => sum + item.closing_value, 0)
                        ).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right" style={valueColumnStyle}>
                        {currencySymbol} {filteredStockData.reduce((sum, item) => sum + item.closing_value, 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No stock data found for the selected filters and period.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StockSummaryReport;
