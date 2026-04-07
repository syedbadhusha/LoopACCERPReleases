import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { format, isValid, parseISO } from 'date-fns';

type ReportLine = {
  particular: string;
  amount: number;
  groupId?: string;
  drilldownTarget?: 'stock-summary';
  showZero?: boolean;
};

type ProfitLossData = {
  leftTrading: ReportLine[];
  rightTrading: ReportLine[];
  leftPnL: ReportLine[];
  rightPnL: ReportLine[];
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
};

type ItemStockState = {
  qty: number;
  value: number;
};

const NEAR_ZERO = 0.000001;

const money = (value: any) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/[,\s₹$]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const INWARD_VOUCHER_TYPES = new Set(['purchase', 'receipt', 'credit-note']);
const OUTWARD_VOUCHER_TYPES = new Set(['sales', 'issue', 'debit-note']);
const EXPENSE_GROUP_ORDER = ['Direct Expenses', 'Indirect Expenses'];
const INCOME_GROUP_ORDER = ['Direct Incomes', 'Indirect Incomes'];

const getFiscalYearStart = (referenceDate = new Date()) => {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const fiscalStartYear = month < 3 ? year - 1 : year;
  return format(new Date(fiscalStartYear, 3, 1), 'yyyy-MM-dd');
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

const computeInventoryLineQty = (line: any) => Math.abs(money(line?.quantity));

const ProfitLossReport = () => {
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const currencySymbol = selectedCompany?.currency === 'INR' ? '₹' : selectedCompany?.currency === 'USD' ? '$' : selectedCompany?.currency || '₹';  
  const [dateFrom, setDateFrom] = useState(() => {
    const saved = localStorage.getItem('profitLoss_dateFrom');
    if (saved) return saved;
    return getFiscalYearStart();
  });
  const [dateTo, setDateTo] = useState(() => {
    const saved = localStorage.getItem('profitLoss_dateTo');
    return saved || format(new Date(), 'yyyy-MM-dd');
  });

  const [reportData, setReportData] = useState<ProfitLossData>({
    leftTrading: [],
    rightTrading: [],
    leftPnL: [],
    rightPnL: [],
    grossProfit: 0,
    grossLoss: 0,
    netProfit: 0,
  });

  useEffect(() => {
    localStorage.setItem('profitLoss_dateFrom', dateFrom);
    localStorage.setItem('profitLoss_dateTo', dateTo);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (selectedCompany && dateFrom && dateTo) {
      fetchProfitLossData();
    }
  }, [selectedCompany, dateFrom, dateTo]);

  const fetchProfitLossData = async () => {
    try {
      const normalizedDateFrom = dateFrom <= dateTo ? dateFrom : dateTo;
      const normalizedDateTo = dateFrom <= dateTo ? dateTo : dateFrom;

      const params = new URLSearchParams({
        companyId: selectedCompany?.id || '',
        dateFrom: normalizedDateFrom,
        dateTo: normalizedDateTo,
      });
      const [vResp, iResp, lResp, gResp] = await Promise.all([
        fetch(`http://localhost:5000/api/vouchers?${params}`),
        fetch(`http://localhost:5000/api/items?companyId=${selectedCompany?.id || ''}`),
        fetch(`http://localhost:5000/api/ledgers/report/balance-sheet?${params}`),
        fetch(`http://localhost:5000/api/groups?companyId=${selectedCompany?.id || ''}`),
      ]);

      if (!vResp.ok) throw new Error('Failed to fetch vouchers');
      if (!iResp.ok) throw new Error('Failed to fetch items');
      if (!lResp.ok) throw new Error('Failed to fetch ledgers');
      if (!gResp.ok) throw new Error('Failed to fetch groups');

      const vouchersJson = await vResp.json();
      const itemsJson = await iResp.json();
      const ledgersJson = await lResp.json();
      const groupsJson = await gResp.json();

      const vouchers = vouchersJson?.data || [];
      const items = itemsJson?.data || [];
      const ledgers = ledgersJson?.data || [];
      const groups = groupsJson?.data || [];

      const groupById = new Map<string, any>(groups.map((g: any) => [String(g?.id || ''), g]));
      const primaryGroups = groups.filter((g: any) => !g?.parent_id);
      const topGroupIdByName = new Map<string, string>();
      for (const group of primaryGroups) {
        const groupName = String(group?.name || '').trim();
        const groupId = String(group?.id || '');
        if (groupName && groupId) {
          topGroupIdByName.set(groupName, groupId);
        }
      }

      const resolvePrimaryGroup = (group: any) => {
        if (!group) return null;
        let current = group;
        while (current?.parent_id) {
          const parent = groupById.get(String(current.parent_id));
          if (!parent) break;
          current = parent;
        }
        return current;
      };

      const vouchersSorted = [...vouchers].sort((a: any, b: any) => {
        const d1 = normalizeVoucherDate(a?.voucher_date);
        const d2 = normalizeVoucherDate(b?.voucher_date);
        return d1.localeCompare(d2);
      });

      const fromDateObj = new Date(`${normalizedDateFrom}T00:00:00`);
      fromDateObj.setDate(fromDateObj.getDate() - 1);
      const fromMinusOne = format(fromDateObj, 'yyyy-MM-dd');

      const buildStockValueAsOf = (cutoffDate: string) => {
        const stockByItem = new Map<string, ItemStockState>();

        for (const item of items) {
          const itemId = String(item?.id || '');
          if (!itemId) continue;
          const openingQty = money(item?.opening_stock ?? item?.opening_qty);
          const openingValue = money(item?.opening_value);
          stockByItem.set(itemId, {
            qty: openingQty,
            value: openingValue,
          });
        }

        for (const voucher of vouchersSorted) {
          const voucherDate = normalizeVoucherDate(voucher?.voucher_date);
          if (!voucherDate || voucherDate > cutoffDate) {
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

            const qty = computeInventoryLineQty(line);
            if (qty <= 0) continue;

            const current = stockByItem.get(itemId) || { qty: 0, value: 0 };

            if (isInward) {
              const inwardValue = computeInventoryLineAmount(line);
              current.qty += qty;
              current.value += inwardValue;
            } else if (isOutward) {
              const avgRate = current.qty > 0 ? current.value / current.qty : 0;
              const qtyToReduce = Math.min(current.qty, qty);
              const outwardValue = qtyToReduce * avgRate;
              current.qty = Math.max(0, current.qty - qtyToReduce);
              current.value = Math.max(0, current.value - outwardValue);
            }

            stockByItem.set(itemId, current);
          }
        }

        return Array.from(stockByItem.values()).reduce(
          (sum, itemState) => sum + Math.max(0, money(itemState.value)),
          0,
        );
      };

      const openingStock = buildStockValueAsOf(fromMinusOne);
      const closingStock = buildStockValueAsOf(normalizedDateTo);

      let salesAccounts = 0;
      let purchaseAccounts = 0;

      const primaryExpenseTotals = new Map<string, number>();
      const primaryIncomeTotals = new Map<string, number>();

      for (const ledger of ledgers) {
        const ledgerGroup =
          ledger?.group ||
          groupById.get(String(ledger?.group_id || '')) ||
          groupById.get(String(ledger?.ledger_group_id || ''));

        const primaryGroup = resolvePrimaryGroup(ledgerGroup);
        const groupName = String(primaryGroup?.name || ledgerGroup?.name || '').trim();
        const nature = String(primaryGroup?.nature || ledgerGroup?.nature || '').toLowerCase();
        const closing = money(ledger?.closing);

        if (!groupName || Math.abs(closing) <= NEAR_ZERO) {
          continue;
        }

        if (groupName === 'Purchase Accounts') {
          if (closing < 0) {
            purchaseAccounts += Math.abs(closing);
          } else {
            salesAccounts += closing;
          }
          continue;
        }

        if (groupName === 'Sales Accounts') {
          if (closing > 0) {
            salesAccounts += closing;
          } else {
            purchaseAccounts += Math.abs(closing);
          }
          continue;
        }

        if (nature === 'expense') {
          if (closing < 0) {
            primaryExpenseTotals.set(groupName, (primaryExpenseTotals.get(groupName) || 0) + Math.abs(closing));
          } else {
            primaryIncomeTotals.set(groupName, (primaryIncomeTotals.get(groupName) || 0) + closing);
          }
        }

        if (nature === 'income') {
          if (closing > 0) {
            primaryIncomeTotals.set(groupName, (primaryIncomeTotals.get(groupName) || 0) + closing);
          } else {
            primaryExpenseTotals.set(groupName, (primaryExpenseTotals.get(groupName) || 0) + Math.abs(closing));
          }
        }
      }

      if (salesAccounts < 0) {
        // Defensive fallback: keep statement stable even if returns exceed sales.
        salesAccounts = 0;
      }

      if (purchaseAccounts < 0) {
        // Defensive fallback: keep statement stable even if returns exceed purchase.
        purchaseAccounts = 0;
      }

      const normalizedDirectExpenses = Math.max(0, primaryExpenseTotals.get('Direct Expenses') || 0);
      const normalizedDirectIncomes = Math.max(0, primaryIncomeTotals.get('Direct Incomes') || 0);

      const tradingDebitTotal = openingStock + purchaseAccounts + normalizedDirectExpenses;
      const tradingCreditTotal = salesAccounts + closingStock + normalizedDirectIncomes;
      const grossResult = tradingCreditTotal - tradingDebitTotal;

      const grossProfit = grossResult > 0 ? grossResult : 0;
      const grossLoss = grossResult < 0 ? Math.abs(grossResult) : 0;

      const leftTrading: ReportLine[] = [];
      const rightTrading: ReportLine[] = [];

      if (openingStock > NEAR_ZERO) {
        leftTrading.push({ particular: 'Opening Stock', amount: openingStock });
      }
      if (purchaseAccounts > NEAR_ZERO) {
        leftTrading.push({ particular: 'Purchase Accounts', amount: purchaseAccounts, groupId: topGroupIdByName.get('Purchase Accounts') });
      }
      if (normalizedDirectExpenses > 0) {
        leftTrading.push({ particular: 'Direct Expenses', amount: normalizedDirectExpenses, groupId: topGroupIdByName.get('Direct Expenses') });
      }

      if (salesAccounts > NEAR_ZERO) {
        rightTrading.push({ particular: 'Sales Accounts', amount: salesAccounts, groupId: topGroupIdByName.get('Sales Accounts') });
      }
      if (closingStock > NEAR_ZERO) {
        rightTrading.push({ particular: 'Closing Stock', amount: closingStock, drilldownTarget: 'stock-summary' });
      }
      if (normalizedDirectIncomes > 0) {
        rightTrading.push({ particular: 'Direct Income', amount: normalizedDirectIncomes, groupId: topGroupIdByName.get('Direct Incomes') });
      }

      if (grossProfit > NEAR_ZERO) {
        leftTrading.push({ particular: 'Gross Profit c/o', amount: grossProfit });
      } else if (grossLoss > NEAR_ZERO) {
        rightTrading.push({ particular: 'Gross Loss c/o', amount: grossLoss });
      }

      const leftPnL: ReportLine[] = [];
      const rightPnL: ReportLine[] = [];

      if (grossProfit > NEAR_ZERO) {
        rightPnL.push({ particular: 'Gross Profit b/f', amount: grossProfit });
      } else if (grossLoss > NEAR_ZERO) {
        leftPnL.push({ particular: 'Gross Loss b/f', amount: grossLoss });
      }

      const sortedExpenseEntries = Array.from(primaryExpenseTotals.entries()).sort((a, b) => {
        const ai = EXPENSE_GROUP_ORDER.indexOf(a[0]);
        const bi = EXPENSE_GROUP_ORDER.indexOf(b[0]);
        const ar = ai === -1 ? 999 : ai;
        const br = bi === -1 ? 999 : bi;
        if (ar !== br) return ar - br;
        return a[0].localeCompare(b[0]);
      });

      const sortedIncomeEntries = Array.from(primaryIncomeTotals.entries()).sort((a, b) => {
        const ai = INCOME_GROUP_ORDER.indexOf(a[0]);
        const bi = INCOME_GROUP_ORDER.indexOf(b[0]);
        const ar = ai === -1 ? 999 : ai;
        const br = bi === -1 ? 999 : bi;
        if (ar !== br) return ar - br;
        return a[0].localeCompare(b[0]);
      });

      const pnlExpenseEntries = sortedExpenseEntries.filter(([groupName]) => groupName !== 'Direct Expenses');
      const pnlIncomeEntries = sortedIncomeEntries.filter(([groupName]) => groupName !== 'Direct Incomes');

      for (const [groupName, amount] of pnlExpenseEntries) {
        if (amount <= NEAR_ZERO) continue;
        leftPnL.push({
          particular: groupName,
          amount,
          groupId: topGroupIdByName.get(groupName),
        });
      }

      for (const [groupName, amount] of pnlIncomeEntries) {
        if (amount <= NEAR_ZERO) continue;
        rightPnL.push({
          particular: groupName,
          amount,
          groupId: topGroupIdByName.get(groupName),
        });
      }

      const totalLeftPnL = leftPnL.reduce((sum, line) => sum + money(line.amount), 0);
      const totalRightPnL = rightPnL.reduce((sum, line) => sum + money(line.amount), 0);
      const netResult = totalRightPnL - totalLeftPnL;

      const netProfit = netResult > 0 ? netResult : -Math.abs(netResult);

      if (netResult > NEAR_ZERO) {
        leftPnL.push({ particular: 'Net Profit', amount: netResult });
      } else if (netResult < -NEAR_ZERO) {
        rightPnL.push({ particular: 'Net Loss', amount: Math.abs(netResult) });
      }

      setReportData({
        leftTrading,
        rightTrading,
        leftPnL,
        rightPnL,
        grossProfit,
        grossLoss,
        netProfit,
      });
    } catch (error) {
      console.error('Error fetching P&L data:', error);
    }
  };

  const handleBack = () => {
    localStorage.removeItem('profitLoss_dateFrom');
    localStorage.removeItem('profitLoss_dateTo');
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

  const openStockSummary = () => {
    const normalizedDateFrom = dateFrom <= dateTo ? dateFrom : dateTo;
    const normalizedDateTo = dateFrom <= dateTo ? dateTo : dateFrom;
    navigate(`/reports/stock-summary?dateFrom=${encodeURIComponent(normalizedDateFrom)}&dateTo=${encodeURIComponent(normalizedDateTo)}`);
  };

  const renderStatementSide = (lines: ReportLine[]) => {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/30">
            <th className="text-left py-2 px-2 tracking-[0.2em]">Particulars</th>
            <th className="text-right py-2 px-2 w-40">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => (
            <tr
              key={`${line.particular}-${idx}`}
              className={`border-b border-black/10 ${line.groupId || line.drilldownTarget ? 'cursor-pointer hover:bg-muted/40' : ''}`}
              onClick={() => {
                if (line.drilldownTarget === 'stock-summary') {
                  openStockSummary();
                  return;
                }
                if (!line.groupId) return;
                openGroupSummary(line.groupId);
              }}
            >
              <td className="py-1.5 px-2 font-medium">{line.particular}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{formatMoney(line.amount, line.showZero === true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const tradingLeftTotal = reportData.leftTrading.reduce((sum, line) => sum + money(line.amount), 0);
  const tradingRightTotal = reportData.rightTrading.reduce((sum, line) => sum + money(line.amount), 0);
  const tradingDisplayTotal = Math.max(tradingLeftTotal, tradingRightTotal);

  const pnlLeftTotal = reportData.leftPnL.reduce((sum, line) => sum + money(line.amount), 0);
  const pnlRightTotal = reportData.rightPnL.reduce((sum, line) => sum + money(line.amount), 0);
  const pnlDisplayTotal = Math.max(pnlLeftTotal, pnlRightTotal);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Button variant="ghost" onClick={handleBack} className="mr-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">Profit & Loss Statement</h1>
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
              <span className="text-lg font-normal">Profit & Loss Account</span>
              <br />
              <span className="text-sm font-normal">
                Period: {formatDateStr(dateFrom)} to {formatDateStr(dateTo)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="border border-black/30">
              <div className="grid md:grid-cols-2 divide-x divide-black/30">
                <div>{renderStatementSide(reportData.leftTrading)}</div>
                <div>{renderStatementSide(reportData.rightTrading)}</div>
              </div>

              <div className="grid md:grid-cols-2 divide-x divide-black/30 border-t border-black/30 text-sm font-semibold">
                <div className="flex justify-between px-2 py-2">
                  <span>Total</span>
                  <span className="tabular-nums">{formatMoney(tradingDisplayTotal)}</span>
                </div>
                <div className="flex justify-between px-2 py-2">
                  <span>Total</span>
                  <span className="tabular-nums">{formatMoney(tradingDisplayTotal)}</span>
                </div>
              </div>
            </div>

            <div className="border border-black/30">
              <div className="grid md:grid-cols-2 divide-x divide-black/30">
                <div>{renderStatementSide(reportData.leftPnL)}</div>
                <div>{renderStatementSide(reportData.rightPnL)}</div>
              </div>

              <div className="grid md:grid-cols-2 divide-x divide-black/30 border-t border-black/30 text-sm font-semibold">
                <div className="flex justify-between px-2 py-2">
                  <span>Total</span>
                  <span className="tabular-nums">{formatMoney(pnlDisplayTotal)}</span>
                </div>
                <div className="flex justify-between px-2 py-2">
                  <span>Total</span>
                  <span className="tabular-nums">{formatMoney(pnlDisplayTotal)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProfitLossReport;