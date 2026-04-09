import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { format, isValid, parseISO } from 'date-fns';

type StatementLine = {
  particular: string;
  amount: number;
  groupId?: string;
  showZero?: boolean;
  isSubLine?: boolean;
};

type BalanceSheetData = {
  assetLines: StatementLine[];
  liabilityLines: StatementLine[];
  totalAssets: number;
  totalLiabilities: number;
};

type ItemStockState = {
  qty: number;
  value: number;
};

const NEAR_ZERO = 0.000001;

const INWARD_VOUCHER_TYPES = new Set(['purchase', 'receipt', 'credit-note']);
const OUTWARD_VOUCHER_TYPES = new Set(['sales', 'issue', 'debit-note']);

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

const computeInventoryLineAmount = (line: any) => {
  const explicitAmount = Math.abs(money(line?.amount));
  if (explicitAmount > 0) return explicitAmount;
  const explicitNetAmount = Math.abs(money(line?.net_amount));
  if (explicitNetAmount > 0) return explicitNetAmount;
  return Math.abs(money(line?.quantity)) * Math.abs(money(line?.rate));
};

const computeInventoryLineQty = (line: any) => Math.abs(money(line?.quantity));

const LIABILITY_ORDER = [
  'Capital Account',
  'Loans (Liability)',
  'Current Liabilities',
  'Suspense A/c',
];

const ASSET_ORDER = [
  'Fixed Assets',
  'Investments',
  'Current Assets',
  'Misc. Expenses (ASSET)',
];

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

const getFiscalYearStart = (referenceDate = new Date()) => {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const fiscalStartYear = month < 3 ? year - 1 : year;
  return format(new Date(fiscalStartYear, 3, 1), 'yyyy-MM-dd');
};

const BalanceSheetReport = () => {
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const currencySymbol = selectedCompany?.currency === 'INR' ? '₹' : selectedCompany?.currency === 'USD' ? '$' : selectedCompany?.currency || '₹';

  const [dateFrom, setDateFrom] = useState(() => {
    const saved = localStorage.getItem('balanceSheet_dateFrom');
    if (saved) return saved;
    return getFiscalYearStart();
  });

  const [dateTo, setDateTo] = useState(() => {
    const saved = localStorage.getItem('balanceSheet_dateTo');
    return saved || format(new Date(), 'yyyy-MM-dd');
  });

  const [reportData, setReportData] = useState<BalanceSheetData>({
    assetLines: [],
    liabilityLines: [],
    totalAssets: 0,
    totalLiabilities: 0,
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    localStorage.setItem('balanceSheet_dateFrom', dateFrom);
    localStorage.setItem('balanceSheet_dateTo', dateTo);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (selectedCompany && dateFrom && dateTo) {
      fetchBalanceSheetData();
    }
  }, [selectedCompany, dateFrom, dateTo]);

  const fetchBalanceSheetData = async () => {
    try {
      const normalizedDateFrom = dateFrom <= dateTo ? dateFrom : dateTo;
      const normalizedDateTo = dateFrom <= dateTo ? dateTo : dateFrom;

      const params = new URLSearchParams({
        companyId: selectedCompany?.id || '',
        dateFrom: normalizedDateFrom,
        dateTo: normalizedDateTo,
      });

      const [ledgerResp, groupResp, voucherResp, itemResp] = await Promise.all([
        fetch(`http://localhost:5000/api/ledgers/report/balance-sheet?${params}`),
        fetch(`http://localhost:5000/api/groups?companyId=${selectedCompany?.id || ''}`),
        fetch(`http://localhost:5000/api/vouchers?${params}`),
        fetch(`http://localhost:5000/api/items?companyId=${selectedCompany?.id || ''}`),
      ]);

      if (!ledgerResp.ok) throw new Error('Failed to fetch balance sheet data');
      if (!groupResp.ok) throw new Error('Failed to fetch groups');

      const ledgerJson = await ledgerResp.json();
      const groupJson = await groupResp.json();
      const vouchersJson = voucherResp.ok ? await voucherResp.json() : { data: [] };
      const itemsJson = itemResp.ok ? await itemResp.json() : { data: [] };

      const ledgers = ledgerJson?.data || [];
      const groups = groupJson?.data || [];
      const vouchers = vouchersJson?.data || [];
      const items = itemsJson?.data || [];

      const groupById = new Map<string, any>(groups.map((group: any) => [String(group?.id || ''), group]));
      const primaryGroups = groups.filter((group: any) => !group?.parent_id);
      const primaryAssetGroups = primaryGroups.filter((group: any) => {
        const nature = String(group?.nature || '').toLowerCase();
        return nature === 'asset' || nature === 'assets';
      });
      const primaryLiabilityGroups = primaryGroups.filter((group: any) => {
        const nature = String(group?.nature || '').toLowerCase();
        return nature === 'liability' || nature === 'liabilities';
      });
      const topGroupIdByName = new Map<string, string>();
      for (const group of primaryGroups) {
        const groupName = String(group?.name || '').trim();
        const groupId = String(group?.id || '');
        if (groupName && groupId) {
          topGroupIdByName.set(groupName, groupId);
        }
      }

      const resolveTopGroupName = (group: any, fallbackName = 'Ungrouped') => {
        if (!group) return fallbackName;

        let current = group;
        while (current?.parent_id) {
          const parent = groupById.get(String(current.parent_id));
          if (!parent) break;
          current = parent;
        }

        return String(current?.name || group?.name || fallbackName);
      };

      const assetGroupTotals = new Map<string, number>();
      const liabilityGroupTotals = new Map<string, number>();
      for (const group of primaryAssetGroups) {
        const name = String(group?.name || '').trim();
        if (!name) continue;
        assetGroupTotals.set(name, 0);
      }
      for (const group of primaryLiabilityGroups) {
        const name = String(group?.name || '').trim();
        if (!name) continue;
        liabilityGroupTotals.set(name, 0);
      }
      let incomeTotal = 0;
      let expenseTotal = 0;

      const addAmount = (target: Map<string, number>, key: string, amount: number) => {
        if (amount <= NEAR_ZERO) return;
        target.set(key, (target.get(key) || 0) + amount);
      };

      for (const ledger of ledgers) {
        const ledgerGroup =
          ledger?.group ||
          groupById.get(String(ledger?.group_id || '')) ||
          groupById.get(String(ledger?.ledger_group_id || ''));
        const nature = String(ledgerGroup?.nature || '').toLowerCase();
        const topGroupName = resolveTopGroupName(ledgerGroup);

        // Use closing field which includes opening balance
        const closing = money(ledger?.closing);

        if (Math.abs(closing) <= NEAR_ZERO) {
          continue;
        }

        // Backend sign convention: negative closing = debit balance, positive closing = credit balance
        if (nature === 'assets' || nature === 'asset') {
          // Assets normally have debit (negative closing) balance
          if (closing < 0) {
            addAmount(assetGroupTotals, topGroupName, Math.abs(closing));
          } else {
            addAmount(liabilityGroupTotals, topGroupName, closing);
          }
          continue;
        }

        if (nature === 'liability' || nature === 'liabilities') {
          // Liabilities normally have credit (positive closing) balance
          if (closing > 0) {
            addAmount(liabilityGroupTotals, topGroupName, closing);
          } else {
            addAmount(assetGroupTotals, topGroupName, Math.abs(closing));
          }
          continue;
        }

        if (nature === 'income') {
          // Income normally has credit (positive closing) balance
          if (closing > 0) {
            incomeTotal += closing;
          } else {
            expenseTotal += Math.abs(closing);
          }
          continue;
        }

        if (nature === 'expense') {
          // Expense normally has debit (negative closing) balance
          if (closing < 0) {
            expenseTotal += Math.abs(closing);
          } else {
            incomeTotal += closing;
          }
        }
      }

      const toSortedLines = (source: Map<string, number>, order: string[]): StatementLine[] => {
        return Array.from(source.entries())
          .filter(([, amount]) => amount > NEAR_ZERO)
          .sort((a, b) => {
            const ai = order.indexOf(a[0]);
            const bi = order.indexOf(b[0]);
            const aRank = ai === -1 ? 999 : ai;
            const bRank = bi === -1 ? 999 : bi;
            if (aRank !== bRank) return aRank - bRank;
            return a[0].localeCompare(b[0]);
          })
          .map(([particular, amount]) => ({
            particular,
            amount,
            groupId: topGroupIdByName.get(particular),
          }));
      };

      // --- Compute closing stock from inventory ---
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
          const lines = getInventoryLines(voucher);
          for (const line of lines) {
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

      // Add closing stock to Current Assets
      if (closingStock > NEAR_ZERO) {
        assetGroupTotals.set('Current Assets', (assetGroupTotals.get('Current Assets') || 0) + closingStock);
      }

      const liabilityLines = toSortedLines(liabilityGroupTotals, LIABILITY_ORDER);
      const assetLines = toSortedLines(assetGroupTotals, ASSET_ORDER);

      const netProfit = incomeTotal - expenseTotal;
      if (netProfit > NEAR_ZERO) {
        liabilityLines.push({ particular: 'Profit & Loss A/c', amount: netProfit, showZero: true });
      } else if (netProfit < -NEAR_ZERO) {
        assetLines.push({ particular: 'Profit & Loss A/c', amount: Math.abs(netProfit), showZero: true });
      }

      let totalLiabilities = liabilityLines.reduce((sum, line) => sum + money(line.amount), 0);
      let totalAssets = assetLines.reduce((sum, line) => sum + money(line.amount), 0);

      const difference = Math.abs(totalLiabilities - totalAssets);
      if (difference > NEAR_ZERO) {
        if (totalLiabilities > totalAssets) {
          assetLines.push({ particular: 'Difference in opening balances', amount: difference, showZero: true });
          totalAssets += difference;
        } else {
          liabilityLines.push({ particular: 'Difference in opening balances', amount: difference, showZero: true });
          totalLiabilities += difference;
        }
      }

      setReportData({
        liabilityLines,
        assetLines,
        totalLiabilities,
        totalAssets,
      });
    } catch (error) {
      console.error('Error fetching Balance Sheet data:', error);
      setReportData({
        liabilityLines: [],
        assetLines: [],
        totalLiabilities: 0,
        totalAssets: 0,
      });
    }
  };

  const handleBack = () => {
    localStorage.removeItem('balanceSheet_dateFrom');
    localStorage.removeItem('balanceSheet_dateTo');
    if (window.history.length > 1) navigate(-1);
    else navigate('/reports');
  };

  const formatDateStr = (s: string) => {
    if (!s) return '';
    const d = parseISO(s);
    return isValid(d) ? format(d, 'dd/MM/yyyy') : '';
  };

  const formatMoney = (amount: number, showZero = false) =>
    amount > 0 || showZero
      ? `${currencySymbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '';

  const openGroupSummary = (groupId: string) => {
    if (!groupId) return;
    const normalizedDateFrom = dateFrom <= dateTo ? dateFrom : dateTo;
    const normalizedDateTo = dateFrom <= dateTo ? dateTo : dateFrom;
    navigate(`/reports/group-summary?groupId=${encodeURIComponent(groupId)}&dateFrom=${encodeURIComponent(normalizedDateFrom)}&dateTo=${encodeURIComponent(normalizedDateTo)}`);
  };

  const renderStatementSide = (title: string, lines: StatementLine[]) => {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/30">
            <th className="text-left py-2 px-2 tracking-[0.2em]">{title}</th>
            <th className="text-right py-2 px-2 w-40">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => (
            <tr
              key={`${line.particular}-${idx}`}
              className={`border-b border-black/10 ${line.groupId ? 'cursor-pointer hover:bg-muted/40' : ''}`}
              onClick={() => {
                if (!line.groupId) return;
                openGroupSummary(line.groupId);
              }}
            >
              <td className={`py-1.5 px-2 font-medium ${line.isSubLine ? 'pl-6 italic text-muted-foreground font-normal' : ''}`}>
                {line.particular}
              </td>
              <td className="py-1.5 px-2 text-right tabular-nums">{formatMoney(line.amount, line.showZero === true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const displayTotal = Math.max(reportData.totalAssets, reportData.totalLiabilities);

  return (
    <div className="bg-background h-screen flex flex-col overflow-hidden">
      <div className="flex-shrink-0 bg-background border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Button variant="ghost" onClick={handleBack} className="mr-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">Balance Sheet</h1>
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
              <span className="text-lg font-normal">Balance Sheet</span>
              <br />
              <span className="text-sm font-normal">
                As at {formatDateStr(dateTo)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border border-black/30">
              <div className="grid md:grid-cols-2 divide-x divide-black/30">
                <div>{renderStatementSide('Liabilities', reportData.liabilityLines)}</div>
                <div>{renderStatementSide('Assets', reportData.assetLines)}</div>
              </div>

              <div className="grid md:grid-cols-2 divide-x divide-black/30 border-t border-black/30 text-sm font-semibold">
                <div className="flex justify-between px-2 py-2">
                  <span>Total</span>
                  <span className="tabular-nums">{formatMoney(displayTotal, true)}</span>
                </div>
                <div className="flex justify-between px-2 py-2">
                  <span>Total</span>
                  <span className="tabular-nums">{formatMoney(displayTotal, true)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
};

export default BalanceSheetReport;
