import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Edit, Trash2 } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

// ─── helpers (same logic as StockSummaryReport) ─────────────────────────────

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

const fmtDate = (d: string) => String(d || '').slice(0, 10);

const getLines = (voucher: any): any[] => {
  if (Array.isArray(voucher?.inventory) && voucher.inventory.length > 0)
    return voucher.inventory.filter((l: any) => l?.item_id);
  if (Array.isArray(voucher?.details) && voucher.details.length > 0)
    return voucher.details.filter((l: any) => l?.item_id);
  return [];
};

const toBatchId = (value: any): string => {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const nested = value.id || value._id || value.$oid;
    return nested ? String(nested).trim() : String(value).trim();
  }
  return String(value).trim();
};

const getBatchMovesForLine = (line: any, selectedBatchId?: string) => {
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
          const batchId = toBatchId(a?.batch_id || a?.batchId || a?.id || a?._id);
          if (!batchId) return null;
          const qty = Math.abs(money(a?.qty ?? a?.batch_qty ?? a?.quantity));
          const amount = Math.abs(money(a?.amount || a?.net_amount || (qty * money(a?.rate))));
          return {
            batchId,
            qty,
            amount,
          };
        })
        .filter((m: any) => m && m.qty > 0)
    : (() => {
        const lineBatchId = toBatchId(line?.batch_id || line?.batchId || line?.batch?.id || line?.batch?._id);
        if (!lineBatchId) return [];
        const qty = Math.abs(money(line?.batch_qty ?? line?.quantity));
        if (qty <= 0) return [];
        return [
          {
            batchId: lineBatchId,
            qty,
            amount: Math.abs(money(line?.amount || line?.net_amount || (qty * money(line?.rate)))),
          },
        ];
      })();

  if (!selectedBatchId) {
    return moves;
  }

  const normalizedSelectedBatchId = toBatchId(selectedBatchId);
  return moves.filter((m: any) => toBatchId(m.batchId) === normalizedSelectedBatchId);
};

const lineQty = (l: any) => Math.abs(money(l?.quantity));
const lineAmount = (l: any) => {
  const a = Math.abs(money(l?.amount));
  if (a > 0) return a;
  const na = Math.abs(money(l?.net_amount));
  if (na > 0) return na;
  return Math.abs(money(l?.quantity)) * Math.abs(money(l?.rate));
};

const fmt2 = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

const calcRate = (qty: number, value: number) => {
  if (!Number.isFinite(qty) || Math.abs(qty) < 0.000001) return 0;
  const r = value / qty;
  return Number.isFinite(r) ? r : 0;
};

const qtyColumnStyle = { minWidth: '120px', whiteSpace: 'nowrap' as const };
const rateColumnStyle = { minWidth: '130px', whiteSpace: 'nowrap' as const };
const valueColumnStyle = { minWidth: '170px', whiteSpace: 'nowrap' as const };
const voucherTypeColumnStyle = { minWidth: '170px', whiteSpace: 'nowrap' as const };
const voucherNoColumnStyle = { minWidth: '140px', whiteSpace: 'nowrap' as const };
const dateColumnStyle = { minWidth: '110px', whiteSpace: 'nowrap' as const };

// ─── types ───────────────────────────────────────────────────────────────────

type RunState = { qty: number; value: number };

type VoucherRow = {
  isOpening?: boolean;
  voucherId?: string;
  rawVoucherType?: string;
  date: string;
  particulars: string;
  voucherType: string;
  voucherNumber: string;
  inwardQty: number;
  inwardValue: number;
  outwardQty: number;
  outwardValue: number;   // at sales price for display
  closingQty: number;
  closingValue: number;   // at weighted-avg cost
};

// ─── component ───────────────────────────────────────────────────────────────

const StockItemVouchersReport = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();

  const queryItemId   = searchParams.get('itemId')   || '';
  const queryBatchId  = searchParams.get('batchId')  || '';
  const queryDateFrom = searchParams.get('dateFrom') || '';
  const queryDateTo   = searchParams.get('dateTo')   || '';

  const [selectedItemId, setSelectedItemId] = useState(queryItemId);
  const [dateFrom, setDateFrom] = useState(
    queryDateFrom || format(new Date(new Date().getFullYear(), 3, 1), 'yyyy-MM-dd'),
  );
  const [dateTo, setDateTo] = useState(
    queryDateTo || format(new Date(), 'yyyy-MM-dd'),
  );

  const [items, setItems]       = useState<any[]>([]);
  const [rows, setRows]         = useState<VoucherRow[]>([]);
  const [openingRow, setOpeningRow] = useState<RunState>({ qty: 0, value: 0 });
  const [loading, setLoading]   = useState(false);
  const [selectedBatchName, setSelectedBatchName] = useState('');

  const currencySymbol = selectedCompany?.currency === 'INR' ? '₹'
    : selectedCompany?.currency === 'USD' ? '$'
    : selectedCompany?.currency || '₹';

  // ── sync if navigated here via query params ────────────────────────────────
  useEffect(() => {
    if (queryItemId && queryItemId !== selectedItemId) setSelectedItemId(queryItemId);
    if (queryDateFrom && queryDateFrom !== dateFrom)   setDateFrom(queryDateFrom);
    if (queryDateTo   && queryDateTo   !== dateTo)     setDateTo(queryDateTo);
  }, [queryItemId, queryDateFrom, queryDateTo]);

  // ── fetch item list ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedCompany) return;
    fetch(`http://localhost:5000/api/items?companyId=${selectedCompany.id}`)
      .then((r) => r.json())
      .then((j) => setItems(Array.isArray(j?.data) ? j.data : []))
      .catch(console.error);
  }, [selectedCompany]);

  // ── build report whenever item / dates change ──────────────────────────────
  useEffect(() => {
    if (!selectedCompany || !selectedItemId) return;
    buildReport();
  }, [selectedCompany, selectedItemId, queryBatchId, dateFrom, dateTo]);

  useEffect(() => {
    if (!selectedCompany || !selectedItemId || !queryBatchId) {
      setSelectedBatchName('');
      return;
    }

    fetch(
      `http://localhost:5000/api/batch-allocations?itemId=${encodeURIComponent(selectedItemId)}&companyId=${encodeURIComponent(selectedCompany.id)}`,
    )
      .then((resp) => resp.json())
      .then((json) => {
        const batches = Array.isArray(json?.data) ? json.data : [];
        const selectedBatch = batches.find((batch: any) => String(batch?.id || '') === queryBatchId);
        setSelectedBatchName(String(selectedBatch?.batch_number || selectedBatch?.name || ''));
      })
      .catch(() => setSelectedBatchName(''));
  }, [selectedCompany, selectedItemId, queryBatchId]);

  const buildReport = async () => {
    if (!selectedCompany || !selectedItemId) return;
    setLoading(true);
    try {
      const [itemResp, voucherResp, batchResp] = await Promise.all([
        fetch(`http://localhost:5000/api/items?companyId=${selectedCompany.id}`),
        fetch(`http://localhost:5000/api/vouchers?companyId=${selectedCompany.id}`),
        queryBatchId
          ? fetch(
              `http://localhost:5000/api/batch-allocations?itemId=${encodeURIComponent(selectedItemId)}&companyId=${encodeURIComponent(selectedCompany.id)}`,
            )
          : Promise.resolve(null),
      ]);
      if (!itemResp.ok || !voucherResp.ok || (queryBatchId && batchResp && !batchResp.ok)) throw new Error('Fetch failed');

      const itemJson    = await itemResp.json();
      const voucherJson = await voucherResp.json();
      const allItems: any[]   = Array.isArray(itemJson?.data)    ? itemJson.data    : [];
      const allVouchers: any[] = Array.isArray(voucherJson?.data) ? voucherJson.data : [];
      const batchJson = batchResp ? await batchResp.json() : null;

      setItems(allItems);

      const item = allItems.find((i: any) => String(i?.id || '') === selectedItemId);
      if (!item) { setRows([]); setLoading(false); return; }

      // opening source:
      // - batch drill-down: selected batch opening
      // - item drill-down: item master opening
      let masterQty = money(item?.opening_stock ?? item?.opening_qty);
      let masterValue = (() => {
        const v = money(item?.opening_value);
        return v !== 0 ? v : masterQty * money(item?.rate);
      })();

      if (queryBatchId) {
        const batches = Array.isArray(batchJson?.data) ? batchJson.data : [];
        const selectedBatch = batches.find((batch: any) => String(batch?.id || '') === queryBatchId);
        masterQty = money(selectedBatch?.opening_qty);
        masterValue = (() => {
          const openingValue = money(selectedBatch?.opening_value);
          if (openingValue !== 0) return openingValue;
          const fallbackRate = money(item?.rate);
          return masterQty * fallbackRate;
        })();
      }

      // running state
      const state: RunState = { qty: masterQty, value: masterValue };

      const applyInward  = (qty: number, val: number) => {
        state.qty   += qty;
        state.value += val;
      };
      const applyOutward = (qty: number) => {
        const avgRate    = state.qty > 0 ? state.value / state.qty : 0;
        const reduce     = Math.min(state.qty, qty);
        state.qty        = Math.max(0, state.qty   - reduce);
        state.value      = Math.max(0, state.value - reduce * avgRate);
      };

      const normalDateFrom = dateFrom <= dateTo ? dateFrom : dateTo;
      const normalDateTo   = dateFrom <= dateTo ? dateTo   : dateFrom;

      // sort all vouchers chronologically
      const sorted = [...allVouchers].sort((a: any, b: any) =>
        fmtDate(a?.voucher_date).localeCompare(fmtDate(b?.voucher_date)),
      );

      // ── pass 1: apply pre-period movements to get opening at dateFrom ──────
      for (const v of sorted) {
        const vDate = fmtDate(v?.voucher_date);
        if (!vDate || vDate >= normalDateFrom) continue;
        const vType = String(v?.voucher_type || '').toLowerCase();
        const isIn  = INWARD_TYPES.has(vType);
        const isOut = OUTWARD_TYPES.has(vType);
        if (!isIn && !isOut) continue;
        for (const line of getLines(v)) {
          if (String(line?.item_id || '') !== selectedItemId) continue;
          const batchMoves = getBatchMovesForLine(line, queryBatchId || undefined);
          if (batchMoves.length === 0 && queryBatchId) continue;

          const qty = batchMoves.length > 0
            ? batchMoves.reduce((sum: number, move: any) => sum + Number(move?.qty || 0), 0)
            : lineQty(line);
          if (qty <= 0) continue;

          const amount = batchMoves.length > 0
            ? batchMoves.reduce((sum: number, move: any) => sum + Number(move?.amount || 0), 0)
            : lineAmount(line);

          if (isIn)  applyInward(qty, amount);
          if (isOut) applyOutward(qty);
        }
      }

      const opening: RunState = { qty: state.qty, value: state.value };
      setOpeningRow(opening);

      // ── pass 2: build rows for period [dateFrom, dateTo] ──────────────────
      const built: VoucherRow[] = [];

      for (const v of sorted) {
        const vDate = fmtDate(v?.voucher_date);
        if (!vDate || vDate < normalDateFrom || vDate > normalDateTo) continue;
        const vType = String(v?.voucher_type || '').toLowerCase();
        const isIn  = INWARD_TYPES.has(vType);
        const isOut = OUTWARD_TYPES.has(vType);
        if (!isIn && !isOut) continue;

        const particulars = String(
          v?.party_name || v?.ledger_name || v?.narration || '',
        );

        const displayDate = (() => {
          const d = new Date(`${vDate}T00:00:00`);
          return Number.isNaN(d.getTime()) ? vDate : format(d, 'd-MMM-yy');
        })();

        const displayType = String(v?.voucher_type || '')
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');

        for (const line of getLines(v)) {
          if (String(line?.item_id || '') !== selectedItemId) continue;
          const batchMoves = getBatchMovesForLine(line, queryBatchId || undefined);
          if (batchMoves.length === 0 && queryBatchId) continue;

          const qty  = batchMoves.length > 0
            ? batchMoves.reduce((sum: number, move: any) => sum + Number(move?.qty || 0), 0)
            : lineQty(line);
          if (qty <= 0) continue;
          const val  = batchMoves.length > 0
            ? batchMoves.reduce((sum: number, move: any) => sum + Number(move?.amount || 0), 0)
            : lineAmount(line);

          if (isIn) {
            applyInward(qty, val);
            built.push({
              voucherId: String(v?.id || ''),
              rawVoucherType: String(v?.voucher_type || '').toLowerCase(),
              date: displayDate,
              particulars,
              voucherType: displayType,
              voucherNumber: String(v?.voucher_number || ''),
              inwardQty: qty,
              inwardValue: val,
              outwardQty: 0,
              outwardValue: 0,
              closingQty: state.qty,
              closingValue: state.value,
            });
          } else {
            const outwardDisplayVal = val; // sales price for display
            applyOutward(qty);
            built.push({
              voucherId: String(v?.id || ''),
              rawVoucherType: String(v?.voucher_type || '').toLowerCase(),
              date: displayDate,
              particulars,
              voucherType: displayType,
              voucherNumber: String(v?.voucher_number || ''),
              inwardQty: 0,
              inwardValue: 0,
              outwardQty: qty,
              outwardValue: outwardDisplayVal,
              closingQty: state.qty,
              closingValue: state.value,
            });
          }
        }
      }

      setRows(built);
    } catch (err) {
      console.error('Error building stock item vouchers report:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // ── derived totals ─────────────────────────────────────────────────────────
  const totalInwardQty   = rows.reduce((s, r) => s + r.inwardQty,   0);
  const totalInwardValue = rows.reduce((s, r) => s + r.inwardValue,  0);
  const totalOutwardQty  = rows.reduce((s, r) => s + r.outwardQty,  0);
  const totalOutwardValue= rows.reduce((s, r) => s + r.outwardValue, 0);

  // Tally-style: grand inward total includes opening
  const grandInwardQty   = openingRow.qty   + totalInwardQty;
  const grandInwardValue = openingRow.value + totalInwardValue;

  const finalRow = rows.length > 0 ? rows[rows.length - 1] : null;
  const finalClosingQty   = finalRow ? finalRow.closingQty   : openingRow.qty;
  const finalClosingValue = finalRow ? finalRow.closingValue : openingRow.value;

  const selectedItem = items.find((i: any) => String(i?.id || '') === selectedItemId);

  const uom = String(selectedItem?.uom || 'PCS');

  const qtyCell = (qty: number) =>
    qty > 0
      ? `${fmt2(qty)} ${uom}`
      : '';

  const handleEditVoucher = (row: VoucherRow) => {
    const voucherId = String(row?.voucherId || '');
    if (!voucherId) return;

    const voucherType = String(row?.rawVoucherType || '').toLowerCase();
    const typeMap: Record<string, string> = {
      sales: '/vouchers?type=sales',
      'credit-note': '/vouchers?type=credit-note',
      purchase: '/vouchers?type=purchase',
      'debit-note': '/vouchers?type=debit-note',
      payment: '/vouchers?type=payment',
      receipt: '/vouchers?type=receipt',
    };

    const path = typeMap[voucherType];
    if (!path) return;
    navigate(`${path}&edit=${encodeURIComponent(voucherId)}`, {
      state: {
        returnTo: `/reports/stock-item-vouchers?itemId=${encodeURIComponent(selectedItemId)}${queryBatchId ? `&batchId=${encodeURIComponent(queryBatchId)}` : ''}&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
      },
    });
  };

  const handleDeleteVoucher = async (row: VoucherRow) => {
    const voucherId = String(row?.voucherId || '');
    if (!voucherId) return;
    if (!confirm('Are you sure you want to delete this voucher?')) return;

    try {
      const resp = await fetch(`http://localhost:5000/api/vouchers/${voucherId}`, {
        method: 'DELETE',
      });
      if (!resp.ok) throw new Error('Failed to delete voucher');
      toast({ title: 'Deleted', description: 'Voucher deleted successfully.' });
      buildReport();
    } catch (error) {
      console.error('Error deleting voucher:', error);
      toast({ title: 'Error', description: 'Failed to delete voucher', variant: 'destructive' });
    }
  };

  return (
    <div className="bg-background h-screen flex flex-col overflow-hidden">
      <div className="flex-shrink-0 bg-background border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* ── header ── */}
          <div className="flex items-center">
            <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">Stock Item Vouchers</h1>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">

        {/* ── filters ── */}
        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="flex gap-4 flex-wrap">
              <div className="min-w-[260px] flex-1">
                <Label>Stock Item</Label>
                <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an item" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((item: any) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="siv-from">From Date</Label>
                <Input
                  id="siv-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="siv-to">To Date</Label>
                <Input
                  id="siv-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── report table ── */}
        {selectedItemId && selectedItem && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-semibold">{selectedCompany?.name}</div>
                  <div className="text-base font-normal text-muted-foreground">
                    Stock Item : <span className="font-semibold text-foreground">{selectedItem?.name}</span>
                  </div>
                  {queryBatchId && (
                    <div className="text-sm font-normal text-muted-foreground">
                      Batch : <span className="font-semibold text-foreground">{selectedBatchName || queryBatchId}</span>
                    </div>
                  )}
                </div>
                <div className="text-right text-sm font-normal text-muted-foreground">
                  {format(new Date(`${dateFrom}T00:00:00`), 'd-MMM-yy')} to{' '}
                  {format(new Date(`${dateTo}T00:00:00`), 'd-MMM-yy')}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Loading...</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="border border-border">
                    <TableHeader>
                      <TableRow>
                        <TableHead rowSpan={2} className="align-middle border-r" style={dateColumnStyle}>Date</TableHead>
                        <TableHead rowSpan={2} className="align-middle border-r" style={{ minWidth: 200 }}>Particulars</TableHead>
                        <TableHead rowSpan={2} className="align-middle border-r" style={voucherTypeColumnStyle}>Vch Type</TableHead>
                        <TableHead rowSpan={2} className="align-middle border-r text-right" style={voucherNoColumnStyle}>Vch No.</TableHead>
                        <TableHead colSpan={3} className="text-center border-r border-b">Inward</TableHead>
                        <TableHead colSpan={3} className="text-center border-r border-b">Outward</TableHead>
                        <TableHead colSpan={3} className="text-center border-b">Closing</TableHead>
                        <TableHead rowSpan={2} className="align-middle text-center">Actions</TableHead>
                      </TableRow>
                      <TableRow>
                        <TableHead className="text-right text-xs" style={qtyColumnStyle}>Quantity</TableHead>
                        <TableHead className="text-right text-xs" style={rateColumnStyle}>Rate</TableHead>
                        <TableHead className="text-right text-xs border-r" style={valueColumnStyle}>Amount</TableHead>
                        <TableHead className="text-right text-xs" style={qtyColumnStyle}>Quantity</TableHead>
                        <TableHead className="text-right text-xs" style={rateColumnStyle}>Rate</TableHead>
                        <TableHead className="text-right text-xs border-r" style={valueColumnStyle}>Amount</TableHead>
                        <TableHead className="text-right text-xs" style={qtyColumnStyle}>Quantity</TableHead>
                        <TableHead className="text-right text-xs" style={rateColumnStyle}>Rate</TableHead>
                        <TableHead className="text-right text-xs" style={valueColumnStyle}>Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Opening Balance row */}
                      <TableRow className="font-medium bg-muted/30">
                        <TableCell className="border-r" style={dateColumnStyle}>{format(new Date(`${dateFrom}T00:00:00`), 'd-MMM-yy')}</TableCell>
                        <TableCell className="font-semibold border-r">Opening Balance</TableCell>
                        <TableCell className="border-r" style={voucherTypeColumnStyle}></TableCell>
                        <TableCell className="border-r" style={voucherNoColumnStyle}></TableCell>
                        {/* inwards = opening */}
                        <TableCell className="text-right" style={qtyColumnStyle}>{qtyCell(openingRow.qty)}</TableCell>
                        <TableCell className="text-right" style={rateColumnStyle}>
                          {openingRow.qty > 0 ? fmt2(calcRate(openingRow.qty, openingRow.value)) : ''}
                        </TableCell>
                        <TableCell className="text-right border-r" style={valueColumnStyle}>
                          {openingRow.qty > 0 ? `${currencySymbol} ${fmt2(openingRow.value)}` : ''}
                        </TableCell>
                        {/* outwards empty */}
                        <TableCell style={qtyColumnStyle}></TableCell>
                        <TableCell style={rateColumnStyle}></TableCell>
                        <TableCell className="border-r" style={valueColumnStyle}></TableCell>
                        {/* closing = opening */}
                        <TableCell className="text-right" style={qtyColumnStyle}>{qtyCell(openingRow.qty)}</TableCell>
                        <TableCell className="text-right" style={rateColumnStyle}>
                          {openingRow.qty > 0 ? fmt2(calcRate(openingRow.qty, openingRow.value)) : ''}
                        </TableCell>
                        <TableCell className="text-right" style={valueColumnStyle}>
                          {openingRow.qty > 0 ? `${currencySymbol} ${fmt2(openingRow.value)}` : ''}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>

                      {/* Transaction rows */}
                      {rows.map((row, idx) => (
                        <TableRow key={idx} className={row.inwardQty > 0 ? 'bg-green-50/30' : 'bg-red-50/20'}>
                          <TableCell className="border-r" style={dateColumnStyle}>{row.date}</TableCell>
                          <TableCell className="border-r">{row.particulars}</TableCell>
                          <TableCell className="border-r" style={voucherTypeColumnStyle}>{row.voucherType}</TableCell>
                          <TableCell className="text-right border-r" style={voucherNoColumnStyle}>{row.voucherNumber}</TableCell>
                          {/* inwards */}
                          <TableCell className="text-right" style={qtyColumnStyle}>
                            {row.inwardQty > 0 ? qtyCell(row.inwardQty) : ''}
                          </TableCell>
                          <TableCell className="text-right" style={rateColumnStyle}>
                            {row.inwardQty > 0 ? fmt2(calcRate(row.inwardQty, row.inwardValue)) : ''}
                          </TableCell>
                          <TableCell className="text-right border-r" style={valueColumnStyle}>
                            {row.inwardQty > 0 ? `${currencySymbol} ${fmt2(row.inwardValue)}` : ''}
                          </TableCell>
                          {/* outwards */}
                          <TableCell className="text-right" style={qtyColumnStyle}>
                            {row.outwardQty > 0 ? qtyCell(row.outwardQty) : ''}
                          </TableCell>
                          <TableCell className="text-right" style={rateColumnStyle}>
                            {row.outwardQty > 0 ? fmt2(calcRate(row.outwardQty, row.outwardValue)) : ''}
                          </TableCell>
                          <TableCell className="text-right border-r" style={valueColumnStyle}>
                            {row.outwardQty > 0 ? `${currencySymbol} ${fmt2(row.outwardValue)}` : ''}
                          </TableCell>
                          {/* closing */}
                          <TableCell className="text-right" style={qtyColumnStyle}>{qtyCell(row.closingQty)}</TableCell>
                          <TableCell className="text-right" style={rateColumnStyle}>
                            {row.closingQty > 0 ? fmt2(calcRate(row.closingQty, row.closingValue)) : ''}
                          </TableCell>
                          <TableCell className="text-right" style={valueColumnStyle}>
                            {row.closingQty > 0 ? `${currencySymbol} ${fmt2(row.closingValue)}` : ''}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex gap-1 justify-center">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditVoucher(row)}
                                disabled={!row?.voucherId}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeleteVoucher(row)}
                                disabled={!row?.voucherId}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}

                      {rows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                            No transactions found for the selected item and period.
                          </TableCell>
                        </TableRow>
                      )}

                      {/* Totals row */}
                      <TableRow className="font-bold bg-muted/50 border-t-2">
                        <TableCell colSpan={4} className="text-left border-r">
                          Totals as per &apos;Default&apos; valuation :
                        </TableCell>
                        {/* grand inward (opening + period inwards) */}
                        <TableCell className="text-right" style={qtyColumnStyle}>{qtyCell(grandInwardQty)}</TableCell>
                        <TableCell className="text-right" style={rateColumnStyle}>
                          {grandInwardQty > 0 ? fmt2(calcRate(grandInwardQty, grandInwardValue)) : ''}
                        </TableCell>
                        <TableCell className="text-right border-r" style={valueColumnStyle}>
                          {grandInwardQty > 0 ? `${currencySymbol} ${fmt2(grandInwardValue)}` : ''}
                        </TableCell>
                        {/* outward totals */}
                        <TableCell className="text-right" style={qtyColumnStyle}>{totalOutwardQty > 0 ? qtyCell(totalOutwardQty) : ''}</TableCell>
                        <TableCell className="text-right" style={rateColumnStyle}>
                          {totalOutwardQty > 0 ? fmt2(calcRate(totalOutwardQty, totalOutwardValue)) : ''}
                        </TableCell>
                        <TableCell className="text-right border-r" style={valueColumnStyle}>
                          {totalOutwardQty > 0 ? `${currencySymbol} ${fmt2(totalOutwardValue)}` : ''}
                        </TableCell>
                        {/* final closing */}
                        <TableCell className="text-right" style={qtyColumnStyle}>{qtyCell(finalClosingQty)}</TableCell>
                        <TableCell className="text-right" style={rateColumnStyle}>
                          {finalClosingQty > 0 ? fmt2(calcRate(finalClosingQty, finalClosingValue)) : ''}
                        </TableCell>
                        <TableCell className="text-right" style={valueColumnStyle}>
                          {finalClosingQty > 0 ? `${currencySymbol} ${fmt2(finalClosingValue)}` : ''}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {selectedItemId && !selectedItem && !loading && (
          <Card>
            <CardContent className="text-center py-8 text-muted-foreground">
              Item not found.
            </CardContent>
          </Card>
        )}

        {!selectedItemId && (
          <Card>
            <CardContent className="text-center py-8 text-muted-foreground">
              Please select a stock item to view the voucher report.
            </CardContent>
          </Card>
        )}
        </div>
      </div>
    </div>
  );
};

export default StockItemVouchersReport;
