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
  const { selectedCompany } = useCompany();

  const queryItemId = searchParams.get('itemId') || '';
  const queryDateFrom = searchParams.get('dateFrom') || '';
  const queryDateTo = searchParams.get('dateTo') || '';

  const [selectedItemId, setSelectedItemId] = useState(queryItemId);
  const [dateFrom, setDateFrom] = useState(
    queryDateFrom || format(new Date(new Date().getFullYear(), 3, 1), 'yyyy-MM-dd'),
  );
  const [dateTo, setDateTo] = useState(queryDateTo || format(new Date(), 'yyyy-MM-dd'));

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

  const buildBatchSummary = async () => {
    if (!selectedCompany || !selectedItemId) return;
    setLoading(true);

    try {
      const [batchResp, voucherResp] = await Promise.all([
        fetch(`http://localhost:5000/api/batch-allocations?itemId=${encodeURIComponent(selectedItemId)}&companyId=${encodeURIComponent(selectedCompany.id)}`),
        fetch(`http://localhost:5000/api/vouchers?companyId=${encodeURIComponent(selectedCompany.id)}`),
      ]);

      if (!batchResp.ok || !voucherResp.ok) {
        throw new Error('Failed to fetch batch summary data');
      }

      const batchJson = await batchResp.json();
      const voucherJson = await voucherResp.json();

      const batches = Array.isArray(batchJson?.data) ? batchJson.data : [];
      const vouchers = Array.isArray(voucherJson?.data) ? voucherJson.data : [];

      const stateByBatch = new Map<string, BatchState>();
      for (const batch of batches) {
        const batchId = String(batch?.id || '');
        if (!batchId) continue;

        const openingQty = money(batch?.opening_qty);
        const openingValue = money(batch?.opening_value);

        stateByBatch.set(batchId, {
          batchId,
          batchName: String(batch?.batch_number || batch?.name || 'Unnamed Batch'),
          openingQty,
          openingValue,
          purchaseQty: 0,
          purchaseValue: 0,
          salesQty: 0,
          salesValue: 0,
          closingQty: openingQty,
          closingValue: openingValue,
        });
      }

      const normalizedDateFrom = dateFrom <= dateTo ? dateFrom : dateTo;
      const normalizedDateTo = dateFrom <= dateTo ? dateTo : dateFrom;
      const sortedVouchers = [...vouchers].sort((a: any, b: any) => fmtDate(a?.voucher_date).localeCompare(fmtDate(b?.voucher_date)));

      const applyOutward = (state: BatchState, qty: number) => {
        const avgRate = state.closingQty > 0 ? state.closingValue / state.closingQty : 0;
        const qtyToReduce = Math.min(state.closingQty, qty);
        state.closingQty = Math.max(0, state.closingQty - qtyToReduce);
        state.closingValue = Math.max(0, state.closingValue - (qtyToReduce * avgRate));
      };

      const applyOutwardOpening = (state: BatchState, qty: number) => {
        const avgRate = state.openingQty > 0 ? state.openingValue / state.openingQty : 0;
        const qtyToReduce = Math.min(state.openingQty, qty);
        state.openingQty = Math.max(0, state.openingQty - qtyToReduce);
        state.openingValue = Math.max(0, state.openingValue - (qtyToReduce * avgRate));
      };

      for (const voucher of sortedVouchers) {
        const voucherDate = fmtDate(voucher?.voucher_date);
        if (!voucherDate || voucherDate > normalizedDateTo) continue;

        const voucherType = String(voucher?.voucher_type || '').toLowerCase();
        const isInward = INWARD_TYPES.has(voucherType);
        const isOutward = OUTWARD_TYPES.has(voucherType);
        if (!isInward && !isOutward) continue;

        const isBeforePeriod = voucherDate < normalizedDateFrom;
        const isInPeriod = voucherDate >= normalizedDateFrom && voucherDate <= normalizedDateTo;

        const lines = Array.isArray(voucher?.inventory) && voucher.inventory.length > 0
          ? voucher.inventory
          : Array.isArray(voucher?.details)
            ? voucher.details
            : [];

        for (const line of lines) {
          if (String(line?.item_id || '') !== selectedItemId) continue;

          const moves = Array.isArray(line?.batch_allocations) && line.batch_allocations.length > 0
            ? line.batch_allocations
                .filter((a: any) => a?.batch_id)
                .map((a: any) => ({
                  batchId: String(a?.batch_id || ''),
                  batchName: String(a?.batch_number || ''),
                  qty: Math.abs(money(a?.qty)),
                  amount: Math.abs(money(a?.amount || a?.net_amount || (money(a?.qty) * money(a?.rate)))),
                }))
            : line?.batch_id
              ? [{
                  batchId: String(line?.batch_id || ''),
                  batchName: String(line?.batch_number || ''),
                  qty: Math.abs(money(line?.batch_qty ?? line?.quantity)),
                  amount: Math.abs(money(line?.amount || line?.net_amount || (money(line?.batch_qty ?? line?.quantity) * money(line?.rate)))),
                }]
              : [];

          for (const move of moves) {
            if (!move.batchId || move.qty <= 0) continue;

            const existing = stateByBatch.get(move.batchId) || {
              batchId: move.batchId,
              batchName: move.batchName || 'Unnamed Batch',
              openingQty: 0,
              openingValue: 0,
              purchaseQty: 0,
              purchaseValue: 0,
              salesQty: 0,
              salesValue: 0,
              closingQty: 0,
              closingValue: 0,
            };

            if (isInward) {
              if (isBeforePeriod) {
                existing.openingQty += move.qty;
                existing.openingValue += move.amount;
              }
              if (isInPeriod) {
                existing.purchaseQty += move.qty;
                existing.purchaseValue += move.amount;
              }
              existing.closingQty += move.qty;
              existing.closingValue += move.amount;
            } else if (isOutward) {
              if (isBeforePeriod) {
                applyOutwardOpening(existing, move.qty);
              }
              if (isInPeriod) {
                existing.salesQty += move.qty;
                existing.salesValue += move.amount;
              }
              applyOutward(existing, move.qty);
            }

            stateByBatch.set(move.batchId, existing);
          }
        }
      }

      const builtRows: BatchLine[] = Array.from(stateByBatch.values())
        .filter((row) => {
          const total =
            Math.abs(row.openingQty) +
            Math.abs(row.openingValue) +
            Math.abs(row.purchaseQty) +
            Math.abs(row.purchaseValue) +
            Math.abs(row.salesQty) +
            Math.abs(row.salesValue) +
            Math.abs(row.closingQty) +
            Math.abs(row.closingValue);
          return total > 0.000001;
        })
        .sort((a, b) => String(a.batchName).localeCompare(String(b.batchName)))
        .map((row) => ({
          batchId: row.batchId,
          batchName: row.batchName,
          openingQty: row.openingQty,
          openingValue: row.openingValue,
          purchaseQty: row.purchaseQty,
          purchaseValue: row.purchaseValue,
          salesQty: row.salesQty,
          salesValue: row.salesValue,
          closingQty: row.closingQty,
          closingValue: row.closingValue,
        }));

      setRows(builtRows);
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
  const totalClosingQty = rows.reduce((sum, row) => sum + row.closingQty, 0);
  const totalClosingValue = rows.reduce((sum, row) => sum + row.closingValue, 0);

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
              <Table className="border border-border">
                <TableHeader>
                  <TableRow>
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
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
};

export default BatchSummaryReport;
