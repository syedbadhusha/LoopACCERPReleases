import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { format, isValid, parseISO } from 'date-fns';

const NEAR_ZERO = 0.000001;

const money = (value: any) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[\s,₹$]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return Number(value || 0) || 0;
};

type ItemStockState = { qty: number; value: number };

const INWARD_VOUCHER_TYPES = new Set(['purchase', 'receipt', 'credit-note']);
const OUTWARD_VOUCHER_TYPES = new Set(['sales', 'issue', 'debit-note']);

const normalizeVoucherDate = (value: any) => String(value || '').slice(0, 10);

const getInventoryLines = (voucher: any) => {
  if (Array.isArray(voucher?.inventory) && voucher.inventory.length > 0)
    return voucher.inventory.filter((line: any) => line?.item_id);
  if (Array.isArray(voucher?.details) && voucher.details.length > 0)
    return voucher.details.filter((line: any) => line?.item_id);
  return [];
};

const computeInventoryLineAmount = (line: any) => {
  const a = Math.abs(money(line?.amount));
  if (a > 0) return a;
  const n = Math.abs(money(line?.net_amount));
  if (n > 0) return n;
  return Math.abs(money(line?.quantity)) * Math.abs(money(line?.rate));
};

const computeInventoryLineQty = (line: any) => Math.abs(money(line?.quantity));

// Tally-style group ordering: BS groups first, then P&L groups
const GROUP_ORDER = [
  'Capital Account',
  'Reserves & Surplus',
  'Loans (Liability)',
  'Current Liabilities',
  'Fixed Assets',
  'Investments',
  'Current Assets',
  'Misc. Expenses (ASSET)',
  'Sales Accounts',
  'Purchase Accounts',
  'Direct Incomes',
  'Direct Expenses',
  'Indirect Incomes',
  'Indirect Expenses',
];

type TrialLine = {
  groupName: string;
  debit: number;
  credit: number;
  groupId?: string;
  isDifference?: boolean;
};

const TrialBalanceReport = () => {
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();

  const [dateFrom, setDateFrom] = useState(() => {
    const saved = localStorage.getItem('trialBalance_dateFrom');
    if (saved) return saved;
    const today = new Date();
    const year = today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear();
    return format(new Date(year, 3, 1), 'yyyy-MM-dd');
  });
  const [dateTo, setDateTo] = useState(() => {
    const saved = localStorage.getItem('trialBalance_dateTo');
    return saved || format(new Date(), 'yyyy-MM-dd');
  });

  const [lines, setLines] = useState<TrialLine[]>([]);
  const [grandTotal, setGrandTotal] = useState({ debit: 0, credit: 0 });

  useEffect(() => {
    localStorage.setItem('trialBalance_dateFrom', dateFrom);
    localStorage.setItem('trialBalance_dateTo', dateTo);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (selectedCompany && dateFrom && dateTo) {
      fetchTrialBalanceData();
    }
  }, [selectedCompany, dateFrom, dateTo]);

  const fetchTrialBalanceData = async () => {
    try {
      const normalizedDateFrom = dateFrom <= dateTo ? dateFrom : dateTo;
      const normalizedDateTo = dateFrom <= dateTo ? dateTo : dateFrom;

      const params = new URLSearchParams({
        companyId: selectedCompany?.id || '',
        dateFrom: normalizedDateFrom,
        dateTo: normalizedDateTo,
      });

      // Fetch ledgers, groups, vouchers and items (same as Balance Sheet)
      const [ledgerResp, groupResp, voucherResp, itemResp] = await Promise.all([
        fetch(`http://localhost:5000/api/ledgers/report/balance-sheet?${params}`),
        fetch(`http://localhost:5000/api/groups?companyId=${selectedCompany?.id || ''}`),
        fetch(`http://localhost:5000/api/vouchers?${params}`),
        fetch(`http://localhost:5000/api/items?companyId=${selectedCompany?.id || ''}`),
      ]);

      if (!ledgerResp.ok) throw new Error('Failed to fetch data');
      if (!groupResp.ok) throw new Error('Failed to fetch groups');

      const ledgerJson = await ledgerResp.json();
      const groupJson = await groupResp.json();
      const vouchersJson = voucherResp.ok ? await voucherResp.json() : { data: [] };
      const itemsJson = itemResp.ok ? await itemResp.json() : { data: [] };

      const ledgers = ledgerJson?.data || [];
      const groups = groupJson?.data || [];
      const vouchers = vouchersJson?.data || [];
      const items = itemsJson?.data || [];

      const groupById = new Map<string, any>(
        groups.map((g: any) => [String(g?.id || ''), g])
      );
      const primaryGroups = groups.filter((g: any) => !g?.parent_id);
      const topGroupIdByName = new Map<string, string>();
      for (const group of primaryGroups) {
        const name = String(group?.name || '').trim();
        const id = String(group?.id || '');
        if (name && id) {
          topGroupIdByName.set(name, id);
        }
      }
      // Resolve primary group name by walking to the root parent.
      const resolveTopGroupName = (group: any): string => {
        if (!group) return 'Ungrouped';
        let current = group;
        while (current?.parent_id) {
          const parent = groupById.get(String(current.parent_id));
          if (!parent) break;
          current = parent;
        }
        return String(current?.name || group?.name || 'Ungrouped');
      };

      // --- Compute closing stock (same as Balance Sheet) ---
      const vouchersSorted = [...vouchers].sort((a: any, b: any) => {
        const d1 = normalizeVoucherDate(a?.voucher_date);
        const d2 = normalizeVoucherDate(b?.voucher_date);
        return d1.localeCompare(d2);
      });

      const buildStockValueAsOf = (cutoffDate: string) => {
        const stockByItem = new Map<string, ItemStockState>();
        for (const item of items) {
          const itemId = String(item?.id || '');
          if (!itemId) continue;
          const openingQty = money(item?.opening_stock ?? item?.opening_qty);
          const openingValue = money(item?.opening_value);
          stockByItem.set(itemId, { qty: openingQty, value: openingValue });
        }
        for (const voucher of vouchersSorted) {
          const voucherDate = normalizeVoucherDate(voucher?.voucher_date);
          if (!voucherDate || voucherDate > cutoffDate) continue;
          const voucherType = String(voucher?.voucher_type || '').toLowerCase();
          const isInward = INWARD_VOUCHER_TYPES.has(voucherType);
          const isOutward = OUTWARD_VOUCHER_TYPES.has(voucherType);
          if (!isInward && !isOutward) continue;
          const invLines = getInventoryLines(voucher);
          for (const line of invLines) {
            const itemId = String(line?.item_id || '');
            if (!itemId) continue;
            const qty = computeInventoryLineQty(line);
            if (qty <= 0) continue;
            const current = stockByItem.get(itemId) || { qty: 0, value: 0 };
            if (isInward) {
              current.qty += qty;
              current.value += computeInventoryLineAmount(line);
            } else {
              const avgRate = current.qty > 0 ? current.value / current.qty : 0;
              const qtyToReduce = Math.min(current.qty, qty);
              current.qty = Math.max(0, current.qty - qtyToReduce);
              current.value = Math.max(0, current.value - qtyToReduce * avgRate);
            }
            stockByItem.set(itemId, current);
          }
        }
        return Array.from(stockByItem.values()).reduce(
          (sum, s) => sum + Math.max(0, money(s.value)),
          0,
        );
      };

      const closingStock = buildStockValueAsOf(normalizedDateTo);

      // Aggregate by primary group using CLOSING balance (includes opening)
      // Backend convention: positive closing = credit balance, negative closing = debit balance
      const groupClosing = new Map<string, number>();

      for (const primary of primaryGroups) {
        const name = String(primary?.name || '').trim();
        if (!name) continue;
        groupClosing.set(name, 0);
      }

      for (const ledger of ledgers) {
        const ledgerGroup =
          ledger?.group ||
          groupById.get(String(ledger?.group_id || '')) ||
          groupById.get(String(ledger?.ledger_group_id || ''));

        const topGroupName = resolveTopGroupName(ledgerGroup);

        // Use closing field which includes opening balance
        const closing = money(ledger?.closing);
        if (Math.abs(closing) <= NEAR_ZERO) continue;

        groupClosing.set(topGroupName, (groupClosing.get(topGroupName) || 0) + closing);
      }

      // Add closing stock to Current Assets (same as Balance Sheet)
      if (closingStock > NEAR_ZERO) {
        groupClosing.set('Current Assets', (groupClosing.get('Current Assets') || 0) - closingStock);
      }

      // Build trial balance lines
      // Sign convention: negative closing = debit balance, positive closing = credit balance
      const trialLines: TrialLine[] = [];

      const sortedEntries = Array.from(groupClosing.entries()).sort((a, b) => {
        const ai = GROUP_ORDER.indexOf(a[0]);
        const bi = GROUP_ORDER.indexOf(b[0]);
        const aRank = ai === -1 ? 999 : ai;
        const bRank = bi === -1 ? 999 : bi;
        if (aRank !== bRank) return aRank - bRank;
        return a[0].localeCompare(b[0]);
      });

      let totalDebit = 0;
      let totalCredit = 0;

      for (const [groupName, closingVal] of sortedEntries) {
        if (Math.abs(closingVal) <= NEAR_ZERO) {
          continue;
        }

        if (closingVal < 0) {
          // Negative closing = debit balance
          const absVal = Math.abs(closingVal);
          trialLines.push({ groupName, debit: absVal, credit: 0, groupId: topGroupIdByName.get(groupName) });
          totalDebit += absVal;
        } else {
          // Positive closing = credit balance
          const creditVal = Math.abs(closingVal) <= NEAR_ZERO ? 0 : closingVal;
          trialLines.push({ groupName, debit: 0, credit: creditVal, groupId: topGroupIdByName.get(groupName) });
          totalCredit += creditVal;
        }
      }

      // If totals don't match, add Difference in opening balances
      const imbalance = Math.abs(totalDebit - totalCredit);
      if (imbalance > NEAR_ZERO) {
        if (totalDebit > totalCredit) {
          trialLines.push({ groupName: 'Difference in opening balances', debit: 0, credit: imbalance, isDifference: true });
          totalCredit += imbalance;
        } else {
          trialLines.push({ groupName: 'Difference in opening balances', debit: imbalance, credit: 0, isDifference: true });
          totalDebit += imbalance;
        }
      }

      setLines(trialLines);
      setGrandTotal({ debit: totalDebit, credit: totalCredit });
    } catch (error) {
      console.error('Error fetching Trial Balance data:', error);
    }
  };

  const handleBack = () => {
    localStorage.removeItem('trialBalance_dateFrom');
    localStorage.removeItem('trialBalance_dateTo');
    if (window.history.length > 1) navigate(-1);
    else navigate('/reports');
  };

  const formatDateStr = (s: string) => {
    if (!s) return '';
    const d = parseISO(s);
    return isValid(d) ? format(d, 'dd-MMM-yy') : '';
  };

  const formatAmount = (amount: number) =>
    amount > NEAR_ZERO
      ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '';

  const openGroupSummary = (groupId: string) => {
    if (!groupId) return;
    const normalizedDateFrom = dateFrom <= dateTo ? dateFrom : dateTo;
    const normalizedDateTo = dateFrom <= dateTo ? dateTo : dateFrom;
    navigate(`/reports/group-summary?groupId=${encodeURIComponent(groupId)}&dateFrom=${encodeURIComponent(normalizedDateFrom)}&dateTo=${encodeURIComponent(normalizedDateTo)}`);
  };

  return (
    <div className="bg-background h-screen flex flex-col overflow-hidden">
      <div className="flex-shrink-0 bg-background border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Button variant="ghost" onClick={handleBack} className="mr-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">Trial Balance</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filter Options</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4">
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
            <CardTitle className="text-center">
              {selectedCompany?.name}
              <br />
              <span className="text-lg font-normal">
                {formatDateStr(dateFrom)} to {formatDateStr(dateTo)}
              </span>
              <br />
              <span className="text-sm font-normal">Closing Balance</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table className="border border-border">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/2 font-bold tracking-wide">Particulars</TableHead>
                  <TableHead className="text-right w-1/4 font-bold">Debit</TableHead>
                  <TableHead className="text-right w-1/4 font-bold">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, index) => (
                  <TableRow
                    key={index}
                    className={`${line.isDifference ? 'text-muted-foreground italic' : ''} ${line.groupId ? 'cursor-pointer hover:bg-muted/40' : ''}`}
                    onClick={() => {
                      if (!line.groupId) return;
                      openGroupSummary(line.groupId);
                    }}
                  >
                    <TableCell className={`font-medium ${line.isDifference ? 'italic' : ''}`}>
                      {line.groupName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(line.debit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(line.credit)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 border-black font-bold">
                  <TableCell className="font-bold tracking-wide">Grand Total</TableCell>
                  <TableCell className="text-right tabular-nums font-bold">
                    {formatAmount(grandTotal.debit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-bold">
                    {formatAmount(grandTotal.credit)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
};

export default TrialBalanceReport;