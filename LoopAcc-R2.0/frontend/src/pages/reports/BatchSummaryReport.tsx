import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompany } from '@/contexts/CompanyContext';

const INWARD_TYPES = new Set(['purchase', 'receipt', 'credit-note']);
const OUTWARD_TYPES = new Set(['sales', 'issue', 'debit-note']);

const money = (v: any): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[\s,₹$]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
};

const fmtDate = (d: any) => String(d || '').slice(0, 10);
const fmt2 = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';

const calcRate = (qty: number, value: number) => {
  if (!Number.isFinite(qty) || Math.abs(qty) < 0.000001) return 0;
  const rate = value / qty;
  return Number.isFinite(rate) ? rate : 0;
};

type BatchLine = {
  batchId: string;
  batchName: string;
  openingQty: number;
  openingValue: number;
  purchaseQty: number;
  purchaseValue: number;
  salesQty: number;
  salesValue: number;
  closingQty: number;
  closingValue: number;
};

type BatchState = {
  batchId: string;
  batchName: string;
  openingQty: number;
  openingValue: number;
  purchaseQty: number;
  purchaseValue: number;
  salesQty: number;
  salesValue: number;
  closingQty: number;
  closingValue: number;
};

const qtyColumnStyle = { minWidth: '130px', whiteSpace: 'nowrap' as const };
const rateColumnStyle = { minWidth: '130px', whiteSpace: 'nowrap' as const };
const valueColumnStyle = { minWidth: '170px', whiteSpace: 'nowrap' as const };

const BatchSummaryReport = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedCompany, periodFrom, periodTo } = useCompany();

  const queryItemId = searchParams.get('itemId') || '';
  const queryDateFrom = searchParams.get('dateFrom') || '';
  const queryDateTo = searchParams.get('dateTo') || '';

  const [selectedItemId, setSelectedItemId] = useState(queryItemId);
  const [dateFrom, setDateFrom] = useState(queryDateFrom || periodFrom);
  const [dateTo, setDateTo] = useState(queryDateTo || periodTo);

  // Sync with global period when it changes (unless URL param override)
  useEffect(() => { if (!queryDateFrom) setDateFrom(periodFrom); }, [periodFrom]);
  useEffect(() => { if (!queryDateTo) setDateTo(periodTo); }, [periodTo]);

  const [items, setItems] = useState<any[]>([]);
  const [rows, setRows] = useState<BatchLine[]>([]);
  const [loading, setLoading] = useState(false);

  const currencySymbol = selectedCompany?.currency === 'INR' ? '₹'
    : selectedCompany?.currency === 'USD' ? '$'
    : selectedCompany?.currency || '₹';

  useEffect(() => {
    if (queryItemId && queryItemId !== selectedItemId) setSelectedItemId(queryItemId);
    if (queryDateFrom && queryDateFrom !== dateFrom) setDateFrom(queryDateFrom);
    if (queryDateTo && queryDateTo !== dateTo) setDateTo(queryDateTo);
  }, [queryItemId, queryDateFrom, queryDateTo]);

  useEffect(() => {
    if (!selectedCompany) return;
    fetch(`http://localhost:5000/api/items?companyId=${selectedCompany.id}`)
      .then((resp) => resp.json())
      .then((json) => {
        const allItems = Array.isArray(json?.data) ? json.data : [];
        const batchEnabledItems = allItems.filter(
          (item: any) => item?.enable_batches === true || String(item?.enable_batches).toLowerCase() === 'true',
        );
        setItems(batchEnabledItems);
      })
      .catch((err) => {
        console.error('Error fetching items:', err);
        setItems([]);
      });
  }, [selectedCompany]);

  useEffect(() => {
    if (!selectedItemId) return;
    if (items.some((item: any) => String(item?.id || '') === selectedItemId)) return;
    setSelectedItemId('');
  }, [items, selectedItemId]);

  useEffect(() => {
    if (!selectedCompany || !selectedItemId) return;
    buildBatchSummary();
  }, [selectedCompany, selectedItemId, dateFrom, dateTo]);

  // Refactored to use StockItemVouchersReport logic for batch-wise calculation
  const buildBatchSummary = async () => {
    if (!selectedCompany || !selectedItemId) return;
    setLoading(true);
    try {
      const [batchResp, voucherResp, itemResp] = await Promise.all([
        fetch(`http://localhost:5000/api/batch-allocations?itemId=${encodeURIComponent(selectedItemId)}&companyId=${encodeURIComponent(selectedCompany.id)}`),
        fetch(`http://localhost:5000/api/vouchers?companyId=${encodeURIComponent(selectedCompany.id)}`),
        fetch(`http://localhost:5000/api/items?companyId=${encodeURIComponent(selectedCompany.id)}`),
      ]);
      if (!batchResp.ok || !voucherResp.ok || !itemResp.ok) throw new Error('Failed to fetch batch summary data');
      const batchJson = await batchResp.json();
      const voucherJson = await voucherResp.json();
      const itemJson = await itemResp.json();
      const batches = Array.isArray(batchJson?.data) ? batchJson.data : [];
      const vouchers = Array.isArray(voucherJson?.data) ? voucherJson.data : [];
      const allItems = Array.isArray(itemJson?.data) ? itemJson.data : [];
      const item = allItems.find((i: any) => String(i?.id || '') === selectedItemId);
      // For each batch, run the same logic as StockItemVouchersReport for opening, inward, outward, closing
      const normalDateFrom = dateFrom <= dateTo ? dateFrom : dateTo;
      const normalDateTo = dateFrom <= dateTo ? dateTo : dateFrom;
      // Helper to get all batch moves for a line
      const getBatchMovesForLine = (line: any, batchId: string) => {
        const allocationSource = Array.isArray(line?.batch_allocations) && line.batch_allocations.length > 0
          ? line.batch_allocations
          : Array.isArray(line?.batchallocation) && line.batchallocation.length > 0
            ? line.batchallocation
            : Array.isArray(line?.batchAllocation) && line.batchAllocation.length > 0
              ? line.batchAllocation
              : [];
        const moves = allocationSource.length > 0
          ? allocationSource
              .map((a: any) => {
                const bId = String(a?.batch_id || a?.batchId || a?.id || a?._id || '');
                if (!bId) return null;
                const qty = Math.abs(money(a?.qty ?? a?.batch_qty ?? a?.quantity));
                const amount = Math.abs(money(a?.amount || a?.net_amount || (qty * money(a?.rate))));
                return { batchId: bId, qty, amount };
              })
              .filter((m: any) => m && m.qty > 0 && m.batchId === batchId)
          : (() => {
              const bId = String(line?.batch_id || line?.batchId || line?.batch?.id || line?.batch?._id || '');
              if (!bId || bId !== batchId) return [];
              const qty = Math.abs(money(line?.batch_qty ?? line?.quantity));
              if (qty <= 0) return [];
              return [{ batchId: bId, qty, amount: Math.abs(money(line?.amount || line?.net_amount || (qty * money(line?.rate)))) }];
            })();
        return moves;
      };
      // Build for each batch
      const batchRows: BatchLine[] = [];
      for (const batch of batches) {
        const batchId = String(batch?.id || '');
        if (!batchId) continue;
        // Opening
        let openingQty = money(batch?.opening_qty);
        let openingValue = (() => {
          const v = money(batch?.opening_value);
          if (v !== 0) return v;
          const fallbackRate = money(item?.rate);
          return openingQty * fallbackRate;
        })();
        // Pass 1: apply pre-period movements to get opening at dateFrom
        const sorted = [...vouchers].sort((a: any, b: any) => fmtDate(a?.voucher_date).localeCompare(fmtDate(b?.voucher_date)));
        let preInwardQty = 0, preInwardValue = 0, preOutwardQty = 0, preOutwardValue = 0;
        for (const v of sorted) {
          const vDate = fmtDate(v?.voucher_date);
          if (!vDate || vDate >= normalDateFrom) continue;
          const vType = String(v?.voucher_type || '').toLowerCase();
          const isIn = INWARD_TYPES.has(vType);
          const isOut = OUTWARD_TYPES.has(vType);
          if (!isIn && !isOut) continue;
          const lines = Array.isArray(v?.inventory) && v.inventory.length > 0 ? v.inventory : Array.isArray(v?.details) && v.details.length > 0 ? v.details : [];
          for (const line of lines) {
            if (String(line?.item_id || '') !== selectedItemId) continue;
            const batchMoves = getBatchMovesForLine(line, batchId);
            if (batchMoves.length === 0) continue;
            const qty = batchMoves.reduce((sum: number, move: any) => sum + Number(move?.qty || 0), 0);
            if (qty <= 0) continue;
            const amount = batchMoves.reduce((sum: number, move: any) => sum + Number(move?.amount || 0), 0);
            if (isIn) {
              preInwardQty += qty;
              preInwardValue += amount;
            }
            if (isOut) {
              preOutwardQty += qty;
              preOutwardValue += amount;
            }
          }
        }
        // Opening after pre-period
        const opening = {
          qty: openingQty + preInwardQty - preOutwardQty,
          value: openingValue + preInwardValue - preOutwardValue,
        };
        // Pass 2: accumulate in-period movements
        let purchaseQty = 0, purchaseValue = 0, salesQty = 0, salesValue = 0;
        for (const v of sorted) {
          const vDate = fmtDate(v?.voucher_date);
          if (!vDate || vDate < normalDateFrom || vDate > normalDateTo) continue;
          const vType = String(v?.voucher_type || '').toLowerCase();
          const isIn = INWARD_TYPES.has(vType);
          const isOut = OUTWARD_TYPES.has(vType);
          if (!isIn && !isOut) continue;
          const lines = Array.isArray(v?.inventory) && v.inventory.length > 0 ? v.inventory : Array.isArray(v?.details) && v.details.length > 0 ? v.details : [];
          for (const line of lines) {
            if (String(line?.item_id || '') !== selectedItemId) continue;
            const batchMoves = getBatchMovesForLine(line, batchId);
            if (batchMoves.length === 0) continue;
            const qty = batchMoves.reduce((sum: number, move: any) => sum + Number(move?.qty || 0), 0);
            if (qty <= 0) continue;
            const amount = batchMoves.reduce((sum: number, move: any) => sum + Number(move?.amount || 0), 0);
            if (isIn) {
              purchaseQty += qty;
              purchaseValue += amount;
            }
            if (isOut) {
              salesQty += qty;
              salesValue += amount;
            }
          }
        }
        // Closing = opening + purchase - sales
        const closingQty = opening.qty + purchaseQty - salesQty;
        const closingValue = opening.value + purchaseValue - salesValue;
        batchRows.push({
          batchId,
          batchName: String(batch?.batch_number || batch?.name || 'Unnamed Batch'),
          openingQty: opening.qty,
          openingValue: opening.value,
          purchaseQty,
          purchaseValue,
          salesQty,
          salesValue,
          closingQty,
          closingValue,
        });
      }
      setRows(batchRows.filter(row => Math.abs(row.openingQty) + Math.abs(row.purchaseQty) + Math.abs(row.salesQty) + Math.abs(row.closingQty) > 0.000001)
        .sort((a, b) => String(a.batchName).localeCompare(String(b.batchName))));
    } catch (error) {
      console.error('Error building batch summary:', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const selectedItem = useMemo(
    () => items.find((item) => String(item?.id || '') === selectedItemId),
    [items, selectedItemId],
  );

  const uom = String(selectedItem?.uom || 'PCS');

  const totalOpeningQty = rows.reduce((sum, row) => sum + row.openingQty, 0);
  const totalOpeningValue = rows.reduce((sum, row) => sum + row.openingValue, 0);
  const totalPurchaseQty = rows.reduce((sum, row) => sum + row.purchaseQty, 0);
  const totalPurchaseValue = rows.reduce((sum, row) => sum + row.purchaseValue, 0);
  const totalSalesQty = rows.reduce((sum, row) => sum + row.salesQty, 0);
  const totalSalesValue = rows.reduce((sum, row) => sum + row.salesValue, 0);
  // Calculate closing as opening + purchase - sales (like StockSummaryReport)
  const totalClosingQty = totalOpeningQty + totalPurchaseQty - totalSalesQty;
  const totalClosingValue = totalOpeningValue + totalPurchaseValue - totalSalesValue;

  return (
    <div className="bg-background h-screen flex flex-col overflow-hidden">
      <div className="flex-shrink-0 bg-background border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={() => {
                if (window.history.length > 1) navigate(-1);
                else navigate('/reports/stock-summary');
              }}
              className="mr-4"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">Batch Summary</h1>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">

        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="flex gap-4 flex-wrap">
              <div className="min-w-[260px] flex-1">
                <Label>Stock Item</Label>
                <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select item" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((item: any) => (
                      <SelectItem key={String(item.id)} value={String(item.id)}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="batch-date-from">From Date</Label>
                <Input
                  id="batch-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="batch-date-to">To Date</Label>
                <Input
                  id="batch-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-semibold">{selectedCompany?.name}</div>
                <div className="text-base font-normal text-muted-foreground">
                  {selectedItem ? (
                    <>
                      Item: <span className="font-semibold text-foreground">{selectedItem.name}</span>
                    </>
                  ) : 'Select item to view batch summary'}
                </div>
              </div>
              <div className="text-right text-sm font-normal text-muted-foreground">
                {format(new Date(`${dateFrom}T00:00:00`), 'd-MMM-yy')} to {format(new Date(`${dateTo}T00:00:00`), 'd-MMM-yy')}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center">Loading...</div>
            ) : (
              <div className="overflow-x-auto">
              <Table className="border border-border">
                <TableHeader>
                  <TableRow className="border-0">
                    <TableHead rowSpan={2} style={{ minWidth: 260 }} className="align-middle border-r">Particulars</TableHead>
                    <TableHead colSpan={3} className="text-center border-r border-b">Opening Balance</TableHead>
                    <TableHead colSpan={3} className="text-center border-r border-b">Inward</TableHead>
                    <TableHead colSpan={3} className="text-center border-r border-b">Outward</TableHead>
                    <TableHead colSpan={3} className="text-center border-b">Closing Balance</TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead className="text-right" style={qtyColumnStyle}>Quantity</TableHead>
                    <TableHead className="text-right" style={rateColumnStyle}>Rate</TableHead>
                    <TableHead className="text-right border-r" style={valueColumnStyle}>Amount</TableHead>
                    <TableHead className="text-right" style={qtyColumnStyle}>Quantity</TableHead>
                    <TableHead className="text-right" style={rateColumnStyle}>Rate</TableHead>
                    <TableHead className="text-right border-r" style={valueColumnStyle}>Amount</TableHead>
                    <TableHead className="text-right" style={qtyColumnStyle}>Quantity</TableHead>
                    <TableHead className="text-right" style={rateColumnStyle}>Rate</TableHead>
                    <TableHead className="text-right border-r" style={valueColumnStyle}>Amount</TableHead>
                    <TableHead className="text-right" style={qtyColumnStyle}>Quantity</TableHead>
                    <TableHead className="text-right" style={rateColumnStyle}>Rate</TableHead>
                    <TableHead className="text-right" style={valueColumnStyle}>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.batchId}
                      className="cursor-pointer hover:bg-muted/60"
                      onClick={() => navigate(`/reports/stock-item-vouchers?itemId=${encodeURIComponent(selectedItemId)}&batchId=${encodeURIComponent(row.batchId)}&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`)}
                    >
                      <TableCell className="border-r">{row.batchName}</TableCell>
                      <TableCell className="text-right" style={qtyColumnStyle}>{row.openingQty > 0 ? `${fmt2(row.openingQty)} ${uom}` : ''}</TableCell>
                      <TableCell className="text-right" style={rateColumnStyle}>{row.openingQty > 0 ? fmt2(calcRate(row.openingQty, row.openingValue)) : ''}</TableCell>
                      <TableCell className="text-right border-r" style={valueColumnStyle}>{row.openingQty > 0 ? `${currencySymbol} ${fmt2(row.openingValue)}` : ''}</TableCell>
                      <TableCell className="text-right" style={qtyColumnStyle}>{row.purchaseQty > 0 ? `${fmt2(row.purchaseQty)} ${uom}` : ''}</TableCell>
                      <TableCell className="text-right" style={rateColumnStyle}>{row.purchaseQty > 0 ? fmt2(calcRate(row.purchaseQty, row.purchaseValue)) : ''}</TableCell>
                      <TableCell className="text-right border-r" style={valueColumnStyle}>{row.purchaseQty > 0 ? `${currencySymbol} ${fmt2(row.purchaseValue)}` : ''}</TableCell>
                      <TableCell className="text-right" style={qtyColumnStyle}>{row.salesQty > 0 ? `${fmt2(row.salesQty)} ${uom}` : ''}</TableCell>
                      <TableCell className="text-right" style={rateColumnStyle}>{row.salesQty > 0 ? fmt2(calcRate(row.salesQty, row.salesValue)) : ''}</TableCell>
                      <TableCell className="text-right border-r" style={valueColumnStyle}>{row.salesQty > 0 ? `${currencySymbol} ${fmt2(row.salesValue)}` : ''}</TableCell>
                      <TableCell className="text-right" style={qtyColumnStyle}>{row.closingQty > 0 ? `${fmt2(row.closingQty)} ${uom}` : ''}</TableCell>
                      <TableCell className="text-right" style={rateColumnStyle}>{row.closingQty > 0 ? fmt2(calcRate(row.closingQty, row.closingValue)) : ''}</TableCell>
                      <TableCell className="text-right" style={valueColumnStyle}>{row.closingQty > 0 ? `${currencySymbol} ${fmt2(row.closingValue)}` : ''}</TableCell>
                    </TableRow>
                  ))}

                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
                        No batch data found for selected item/date.
                      </TableCell>
                    </TableRow>
                  )}

                  <TableRow className="font-semibold bg-muted/50">
                    <TableCell className="border-r">Grand Total</TableCell>
                    <TableCell className="text-right" style={qtyColumnStyle}>{totalOpeningQty > 0 ? `${fmt2(totalOpeningQty)} ${uom}` : ''}</TableCell>
                    <TableCell className="text-right" style={rateColumnStyle}>{totalOpeningQty > 0 ? fmt2(calcRate(totalOpeningQty, totalOpeningValue)) : ''}</TableCell>
                    <TableCell className="text-right border-r" style={valueColumnStyle}>{totalOpeningQty > 0 ? `${currencySymbol} ${fmt2(totalOpeningValue)}` : ''}</TableCell>
                    <TableCell className="text-right" style={qtyColumnStyle}>{totalPurchaseQty > 0 ? `${fmt2(totalPurchaseQty)} ${uom}` : ''}</TableCell>
                    <TableCell className="text-right" style={rateColumnStyle}>{totalPurchaseQty > 0 ? fmt2(calcRate(totalPurchaseQty, totalPurchaseValue)) : ''}</TableCell>
                    <TableCell className="text-right border-r" style={valueColumnStyle}>{totalPurchaseQty > 0 ? `${currencySymbol} ${fmt2(totalPurchaseValue)}` : ''}</TableCell>
                    <TableCell className="text-right" style={qtyColumnStyle}>{totalSalesQty > 0 ? `${fmt2(totalSalesQty)} ${uom}` : ''}</TableCell>
                    <TableCell className="text-right" style={rateColumnStyle}>{totalSalesQty > 0 ? fmt2(calcRate(totalSalesQty, totalSalesValue)) : ''}</TableCell>
                    <TableCell className="text-right border-r" style={valueColumnStyle}>{totalSalesQty > 0 ? `${currencySymbol} ${fmt2(totalSalesValue)}` : ''}</TableCell>
                    <TableCell className="text-right" style={qtyColumnStyle}>{totalClosingQty > 0 ? `${fmt2(totalClosingQty)} ${uom}` : ''}</TableCell>
                    <TableCell className="text-right" style={rateColumnStyle}>{totalClosingQty > 0 ? fmt2(calcRate(totalClosingQty, totalClosingValue)) : ''}</TableCell>
                    <TableCell className="text-right" style={valueColumnStyle}>{totalClosingQty > 0 ? `${currencySymbol} ${fmt2(totalClosingValue)}` : ''}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
};

export default BatchSummaryReport;
