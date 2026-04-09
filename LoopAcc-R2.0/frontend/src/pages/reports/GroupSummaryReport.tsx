import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Calculator, Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompany } from '@/contexts/CompanyContext';

type SummaryLine = {
  id: string;
  name: string;
  type: 'group' | 'ledger';
  openingDebit: number;
  openingCredit: number;
  closingDebit: number;
  closingCredit: number;
  hasChildren?: boolean;
};

const NEAR_ZERO = 0.000001;

const toAmount = (value: unknown) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const normalizeVoucherDate = (value: unknown) => String(value || '').slice(0, 10);

const getEntryAmounts = (entry: any) => {
  const explicitDebit = Math.abs(toAmount(entry?.debit_amount));
  const explicitCredit = Math.abs(toAmount(entry?.credit_amount));
  const amount = Math.abs(toAmount(entry?.amount));
  const isDeemedPositive = String(entry?.isDeemedPositive || '').toLowerCase() === 'yes';

  const debit = explicitDebit > 0
    ? explicitDebit
    : explicitCredit === 0 && isDeemedPositive
      ? amount
      : 0;

  const credit = explicitCredit > 0
    ? explicitCredit
    : explicitDebit === 0 && !isDeemedPositive
      ? amount
      : 0;

  return { debit, credit };
};

const splitSignedToDrCr = (signedAmount: number) => {
  if (Math.abs(signedAmount) <= NEAR_ZERO) {
    return { debit: 0, credit: 0 };
  }
  return signedAmount < 0
    ? { debit: Math.abs(signedAmount), credit: 0 }
    : { debit: 0, credit: Math.abs(signedAmount) };
};

const GroupSummaryReport = () => {
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const [searchParams] = useSearchParams();

  const [dateFrom, setDateFrom] = useState(() => {
    const fromQuery = searchParams.get('dateFrom');
    if (fromQuery) return fromQuery;
    const saved = localStorage.getItem('groupSummary_dateFrom');
    if (saved) return saved;
    const today = new Date();
    const year = today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear();
    return format(new Date(year, 3, 1), 'yyyy-MM-dd');
  });
  const [dateTo, setDateTo] = useState(() => {
    const toQuery = searchParams.get('dateTo');
    if (toQuery) return toQuery;
    const saved = localStorage.getItem('groupSummary_dateTo');
    return saved || format(new Date(), 'yyyy-MM-dd');
  });

  const [groups, setGroups] = useState<any[]>([]);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState(() =>
    searchParams.get('groupId') || localStorage.getItem('groupSummary_groupId') || '',
  );
  const [lines, setLines] = useState<SummaryLine[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem('groupSummary_dateFrom', dateFrom);
    localStorage.setItem('groupSummary_dateTo', dateTo);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const nextGroupId = searchParams.get('groupId') || '';
    const nextDateFrom = searchParams.get('dateFrom') || '';
    const nextDateTo = searchParams.get('dateTo') || '';

    if (nextGroupId && nextGroupId !== selectedGroupId) {
      setSelectedGroupId(nextGroupId);
    }

    if (nextDateFrom && nextDateFrom !== dateFrom) {
      setDateFrom(nextDateFrom);
    }

    if (nextDateTo && nextDateTo !== dateTo) {
      setDateTo(nextDateTo);
    }
  }, [searchParams, selectedGroupId, dateFrom, dateTo]);

  useEffect(() => {
    if (selectedGroupId) {
      localStorage.setItem('groupSummary_groupId', selectedGroupId);
    }
  }, [selectedGroupId]);

  useEffect(() => {
    if (selectedCompany && dateFrom && dateTo) {
      fetchData();
    }
  }, [selectedCompany, dateFrom, dateTo]);

  useEffect(() => {
    buildSummary();
  }, [selectedGroupId, groups, ledgers, vouchers, dateFrom, dateTo]);

  const fetchData = async () => {
    if (!selectedCompany) return;

    try {
      setLoading(true);
      const normalizedDateFrom = dateFrom <= dateTo ? dateFrom : dateTo;
      const normalizedDateTo = dateFrom <= dateTo ? dateTo : dateFrom;

      const params = new URLSearchParams({
        companyId: selectedCompany.id,
        dateFrom: normalizedDateFrom,
        dateTo: normalizedDateTo,
      });

      const [groupResp, ledgerResp, voucherResp] = await Promise.all([
        fetch(`http://localhost:5000/api/groups?companyId=${selectedCompany.id}`),
        fetch(`http://localhost:5000/api/ledgers/report/balance-sheet?${params}`),
        fetch(`http://localhost:5000/api/vouchers?companyId=${selectedCompany.id}`),
      ]);

      if (!groupResp.ok) throw new Error('Failed to fetch groups');
      if (!ledgerResp.ok) throw new Error('Failed to fetch ledger balances');
      if (!voucherResp.ok) throw new Error('Failed to fetch vouchers');

      const groupJson = await groupResp.json();
      const ledgerJson = await ledgerResp.json();
      const voucherJson = await voucherResp.json();

      const fetchedGroups = Array.isArray(groupJson?.data) ? groupJson.data : [];
      const fetchedLedgers = Array.isArray(ledgerJson?.data) ? ledgerJson.data : [];
      const fetchedVouchers = Array.isArray(voucherJson?.data) ? voucherJson.data : [];

      setGroups(fetchedGroups);
      setLedgers(fetchedLedgers);
      setVouchers(fetchedVouchers);

      if (!selectedGroupId && fetchedGroups.length > 0) {
        const sorted = [...fetchedGroups].sort((a, b) =>
          String(a?.name || '').localeCompare(String(b?.name || '')),
        );
        const firstGroupId = String(sorted[0]?.id || '');
        if (firstGroupId) {
          setSelectedGroupId(firstGroupId);
        }
      }
    } catch (error) {
      console.error('Error fetching group summary data:', error);
      setGroups([]);
      setLedgers([]);
      setVouchers([]);
      setLines([]);
    } finally {
      setLoading(false);
    }
  };

  const buildSummary = () => {
    if (!selectedGroupId || groups.length === 0) {
      setLines([]);
      return;
    }

    const normalizedDateFrom = dateFrom <= dateTo ? dateFrom : dateTo;
    const normalizedDateTo = dateFrom <= dateTo ? dateTo : dateFrom;

    const childrenByParent = new Map<string, any[]>();
    for (const group of groups) {
      const parentKey = String(group?.parent_id || 'ROOT');
      if (!childrenByParent.has(parentKey)) {
        childrenByParent.set(parentKey, []);
      }
      childrenByParent.get(parentKey)?.push(group);
    }

    const getChildren = (groupId: string) => childrenByParent.get(String(groupId)) || [];

    const getLedgerGroupId = (ledger: any) =>
      String(ledger?.group?.id || ledger?.group_id || ledger?.ledger_group_id || '');

    const getSubtreeGroupIds = (groupId: string) => {
      const result = new Set<string>();
      const queue = [String(groupId)];
      while (queue.length > 0) {
        const current = queue.shift();
        if (!current || result.has(current)) continue;
        result.add(current);
        const children = getChildren(current);
        for (const child of children) {
          if (child?.id) queue.push(String(child.id));
        }
      }
      return result;
    };

    const ledgerBalanceById = new Map<string, {
      id: string;
      name: string;
      groupId: string;
      openingSigned: number;
      closingSigned: number;
      masterOpening: number;
      preFromMovement: number;
      upToToMovement: number;
    }>();

    for (const ledger of ledgers) {
      const ledgerId = String(ledger?.id || '');
      const ledgerGroupId = getLedgerGroupId(ledger);
      if (!ledgerId || !ledgerGroupId) continue;

      ledgerBalanceById.set(ledgerId, {
        id: ledgerId,
        name: String(ledger?.name || ''),
        groupId: ledgerGroupId,
        openingSigned: 0,
        closingSigned: 0,
        masterOpening: toAmount(ledger?.opening),
        preFromMovement: 0,
        upToToMovement: 0,
      });
    }

    for (const voucher of vouchers) {
      const voucherDate = normalizeVoucherDate(voucher?.voucher_date);
      if (!voucherDate || voucherDate > normalizedDateTo) {
        continue;
      }

      const entries = Array.isArray(voucher?.ledger_entries) ? voucher.ledger_entries : [];
      for (const entry of entries) {
        const ledgerId = String(entry?.ledger_id || '');
        const target = ledgerBalanceById.get(ledgerId);
        if (!target) continue;

        const { debit, credit } = getEntryAmounts(entry);
        const signed = credit - debit;

        target.upToToMovement += signed;
        if (voucherDate < normalizedDateFrom) {
          target.preFromMovement += signed;
        }
      }
    }

    for (const state of ledgerBalanceById.values()) {
      state.openingSigned = state.masterOpening + state.preFromMovement;
      state.closingSigned = state.masterOpening + state.upToToMovement;
    }

    const getSignedBalancesForSubtree = (groupId: string) => {
      const subtreeIds = getSubtreeGroupIds(groupId);
      let openingSigned = 0;
      let closingSigned = 0;

      for (const ledgerState of ledgerBalanceById.values()) {
        if (!subtreeIds.has(ledgerState.groupId)) {
          continue;
        }
        openingSigned += ledgerState.openingSigned;
        closingSigned += ledgerState.closingSigned;
      }

      return { openingSigned, closingSigned };
    };

    const immediateChildren = getChildren(selectedGroupId);
    if (immediateChildren.length > 0) {
      const groupLines: SummaryLine[] = immediateChildren
        .map((group) => {
          const { openingSigned, closingSigned } = getSignedBalancesForSubtree(String(group.id));
          const openingSides = splitSignedToDrCr(openingSigned);
          const closingSides = splitSignedToDrCr(closingSigned);
          return {
            id: String(group.id),
            name: String(group?.name || ''),
            type: 'group' as const,
            openingDebit: openingSides.debit,
            openingCredit: openingSides.credit,
            closingDebit: closingSides.debit,
            closingCredit: closingSides.credit,
            hasChildren: getChildren(String(group.id)).length > 0,
          };
        })
        .filter(
          (line) =>
            line.openingDebit > NEAR_ZERO ||
            line.openingCredit > NEAR_ZERO ||
            line.closingDebit > NEAR_ZERO ||
            line.closingCredit > NEAR_ZERO,
        )
        .sort((left, right) => left.name.localeCompare(right.name));

      setLines(groupLines);
      return;
    }

    const ledgerLines: SummaryLine[] = Array.from(ledgerBalanceById.values())
      .filter((ledgerState) => ledgerState.groupId === String(selectedGroupId))
      .map((ledgerState) => {
        const openingSides = splitSignedToDrCr(ledgerState.openingSigned);
        const closingSides = splitSignedToDrCr(ledgerState.closingSigned);
        return {
          id: ledgerState.id,
          name: ledgerState.name,
          type: 'ledger' as const,
          openingDebit: openingSides.debit,
          openingCredit: openingSides.credit,
          closingDebit: closingSides.debit,
          closingCredit: closingSides.credit,
        };
      })
      .filter(
        (line) =>
          line.id &&
          (
            line.openingDebit > NEAR_ZERO ||
            line.openingCredit > NEAR_ZERO ||
            line.closingDebit > NEAR_ZERO ||
            line.closingCredit > NEAR_ZERO
          ),
      )
      .sort((left, right) => left.name.localeCompare(right.name));

    setLines(ledgerLines);
  };

  const selectedGroup = useMemo(
    () => groups.find((group) => String(group?.id || '') === String(selectedGroupId)) || null,
    [groups, selectedGroupId],
  );

  const grandTotals = useMemo(
    () =>
      lines.reduce(
        (sum, line) => ({
          openingDebit: sum.openingDebit + line.openingDebit,
          openingCredit: sum.openingCredit + line.openingCredit,
          closingDebit: sum.closingDebit + line.closingDebit,
          closingCredit: sum.closingCredit + line.closingCredit,
        }),
        { openingDebit: 0, openingCredit: 0, closingDebit: 0, closingCredit: 0 },
      ),
    [lines],
  );

  const formatAmount = (amount: number) =>
    amount > NEAR_ZERO
      ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '';

  const handleLineClick = (line: SummaryLine) => {
    const normalizedDateFrom = dateFrom <= dateTo ? dateFrom : dateTo;
    const normalizedDateTo = dateFrom <= dateTo ? dateTo : dateFrom;

    if (line.type === 'group') {
      navigate(
        `/reports/group-summary?groupId=${encodeURIComponent(line.id)}&dateFrom=${encodeURIComponent(normalizedDateFrom)}&dateTo=${encodeURIComponent(normalizedDateTo)}`,
      );
      return;
    }

    navigate(
      `/reports/ledger?ledgerId=${encodeURIComponent(line.id)}&dateFrom=${encodeURIComponent(normalizedDateFrom)}&dateTo=${encodeURIComponent(normalizedDateTo)}`,
    );
  };

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/reports');
  };

  return (
    <div className="bg-background h-screen flex flex-col overflow-hidden">
      <div className="flex-shrink-0 bg-background border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Button variant="ghost" onClick={handleBack} className="mr-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">Group Summary</h1>
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
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Filter Options
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4 flex-wrap">
            <div className="min-w-[260px]">
              <Label>Select Group</Label>
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a group" />
                </SelectTrigger>
                <SelectContent>
                  {groups
                    .slice()
                    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')))
                    .map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="group-summary-date-from">From Date</Label>
              <Input
                id="group-summary-date-from"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="group-summary-date-to">To Date</Label>
              <Input
                id="group-summary-date-to"
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">
              {selectedCompany?.name}
              <br />
              <span className="text-lg font-normal">Group Summary - {selectedGroup?.name || 'Select Group'}</span>
              <br />
              <span className="text-sm font-normal">{format(new Date(dateFrom), 'dd/MM/yyyy')} to {format(new Date(dateTo), 'dd/MM/yyyy')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-6">Loading...</div>
            ) : (
              <Table className="border border-border">
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2}>Particulars</TableHead>
                    <TableHead className="text-center" colSpan={2}>Opening Balance</TableHead>
                    <TableHead className="text-center" colSpan={2}>Closing Balance</TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow
                      key={`${line.type}-${line.id}`}
                      className="cursor-pointer"
                      onClick={() => handleLineClick(line)}
                    >
                      <TableCell className="font-medium">
                        {line.name}
                      </TableCell>
                      <TableCell className="text-right">{formatAmount(line.openingDebit)}</TableCell>
                      <TableCell className="text-right">{formatAmount(line.openingCredit)}</TableCell>
                      <TableCell className="text-right">{formatAmount(line.closingDebit)}</TableCell>
                      <TableCell className="text-right">{formatAmount(line.closingCredit)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-bold">
                    <TableCell>Grand Total</TableCell>
                    <TableCell className="text-right">{formatAmount(grandTotals.openingDebit)}</TableCell>
                    <TableCell className="text-right">{formatAmount(grandTotals.openingCredit)}</TableCell>
                    <TableCell className="text-right">{formatAmount(grandTotals.closingDebit)}</TableCell>
                    <TableCell className="text-right">{formatAmount(grandTotals.closingCredit)}</TableCell>
                  </TableRow>
                  {lines.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No data found for selected group.
                      </TableCell>
                    </TableRow>
                  )}
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

export default GroupSummaryReport;