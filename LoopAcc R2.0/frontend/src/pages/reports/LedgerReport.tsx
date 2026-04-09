import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Download, Edit, Printer, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { format } from 'date-fns';

const LedgerReport = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const currencySymbol = selectedCompany?.currency === 'INR' ? '₹' : selectedCompany?.currency === 'USD' ? '$' : selectedCompany?.currency || '₹';
  const queryLedgerId = searchParams.get('ledgerId') || '';
  const queryGroupId = searchParams.get('groupId') || '';
  const queryDateFrom = searchParams.get('dateFrom') || '';
  const queryDateTo = searchParams.get('dateTo') || '';
  
  const [dateFrom, setDateFrom] = useState(() => {
    if (queryDateFrom) return queryDateFrom;
    const saved = localStorage.getItem('ledgerReport_dateFrom');
    if (saved) return saved;
    const today = new Date();
    const yearStart = new Date(today.getFullYear(), 3, 1); // April 1st
    return format(yearStart, 'yyyy-MM-dd');
  });
  const [dateTo, setDateTo] = useState(() => {
    if (queryDateTo) return queryDateTo;
    const saved = localStorage.getItem('ledgerReport_dateTo');
    return saved || format(new Date(), 'yyyy-MM-dd');
  });
  
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [selectedLedger, setSelectedLedger] = useState(queryLedgerId);
  const [reportData, setReportData] = useState<any[]>([]);
  const [ledgerInfo, setLedgerInfo] = useState<any>(null);
  const [openingBalance, setOpeningBalance] = useState(0);

  useEffect(() => {
    if (selectedCompany) {
      fetchLedgers();
    }
  }, [selectedCompany]);

  useEffect(() => {
    if (queryLedgerId) {
      setSelectedLedger(queryLedgerId);
    }
  }, [queryLedgerId]);

  useEffect(() => {
    localStorage.setItem('ledgerReport_dateFrom', dateFrom);
    localStorage.setItem('ledgerReport_dateTo', dateTo);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (selectedLedger && dateFrom && dateTo) {
      fetchLedgerReport();
    }
  }, [selectedLedger, dateFrom, dateTo]);

  const fetchLedgers = async () => {
    try {
      const params = new URLSearchParams({
        companyId: selectedCompany?.id || '',
      });
      const resp = await fetch(`http://localhost:5000/api/ledgers?${params}`);
      if (!resp.ok) throw new Error('Failed to fetch ledgers');
      
      const json = await resp.json();
      const fetchedLedgers = Array.isArray(json?.data) ? json.data : [];
      setLedgers(fetchedLedgers);

      if (queryLedgerId && fetchedLedgers.some((ledger: any) => ledger?.id === queryLedgerId)) {
        setSelectedLedger(queryLedgerId);
      }
    } catch (error) {
      console.error('Error fetching ledgers:', error);
    }
  };

  const visibleLedgers = useMemo(() => {
    if (!queryGroupId) return ledgers;
    return ledgers.filter((ledger) =>
      String(ledger?.group_id || ledger?.ledger_group_id || '') === String(queryGroupId),
    );
  }, [ledgers, queryGroupId]);

  useEffect(() => {
    if (!queryGroupId) return;
    if (queryLedgerId) return;
    if (selectedLedger) return;
    if (visibleLedgers.length === 1) {
      setSelectedLedger(String(visibleLedgers[0]?.id || ''));
    }
  }, [queryGroupId, queryLedgerId, selectedLedger, visibleLedgers]);

  const fetchLedgerReport = async () => {
    try {
      const params = new URLSearchParams({
        companyId: selectedCompany?.id || '',
        ledgerId: selectedLedger,
        dateFrom,
        dateTo,
      });
      const resp = await fetch(`http://localhost:5000/api/ledgers/report/ledger?${params}`);
      if (!resp.ok) throw new Error('Failed to fetch ledger report data');
      
      const json = await resp.json();
      const ledgerData = json?.data?.ledger || null;
      const rows = Array.isArray(json?.data?.transactions) ? json.data.transactions : [];
      const openingSigned = Number(json?.data?.opening || 0);

      setLedgerInfo(ledgerData);
      setOpeningBalance(openingSigned);

      setReportData(rows);
    } catch (error) {
      console.error('Error fetching ledger report:', error);
      setReportData([]);
      setLedgerInfo(null);
      setOpeningBalance(0);
    }
  };

  const formatAmount = (value: number) =>
    value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatSignedBalance = (value: number) => {
    const numeric = Number(value || 0);
    if (numeric === 0) return '';
    return `${formatAmount(Math.abs(numeric))} ${numeric < 0 ? 'Dr' : 'Cr'}`;
  };

  const runningDebitTotal = reportData.reduce((sum, row) => sum + Number(row?.debit || 0), 0);
  const runningCreditTotal = reportData.reduce((sum, row) => sum + Number(row?.credit || 0), 0);
  const closingBalance = openingBalance + runningCreditTotal - runningDebitTotal;

  const handleDeleteVoucher = async (row: any) => {
    const voucherId = String(row?.voucherId || '');
    if (!voucherId) return;
    if (!confirm('Are you sure you want to delete this voucher?')) return;
    try {
      const resp = await fetch(`http://localhost:5000/api/vouchers/${voucherId}`, {
        method: 'DELETE',
      });
      if (!resp.ok) throw new Error('Failed to delete voucher');
      toast({ title: 'Deleted', description: 'Voucher deleted successfully.' });
      fetchLedgerReport();
    } catch (error) {
      console.error('Error deleting voucher:', error);
      toast({ title: 'Error', description: 'Failed to delete voucher', variant: 'destructive' });
    }
  };

  const handleEditVoucher = (row: any) => {
    const voucherId = String(row?.voucherId || '');
    if (!voucherId) return;

    const voucherType = String(row?.voucherType || '').toLowerCase();
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
    navigate(`${path}&edit=${encodeURIComponent(voucherId)}`, { state: { returnTo: '/reports/ledger' } });
  };

  const handleBack = () => {
    localStorage.removeItem('ledgerReport_dateFrom');
    localStorage.removeItem('ledgerReport_dateTo');
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
            <h1 className="text-2xl font-bold">Ledger Report</h1>
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
          <CardContent className="pt-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2">Select Ledger</label>
                <Select value={selectedLedger} onValueChange={setSelectedLedger}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a ledger" />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleLedgers.map(ledger => (
                      <SelectItem key={ledger.id} value={ledger.id}>
                        {ledger.name}
                      </SelectItem>
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
            </div>
          </CardContent>
        </Card>

        {selectedLedger && ledgerInfo && (
          <Card>
            <CardHeader>
              <CardTitle className="text-center">
              {selectedCompany?.name}
              <br />
              <span className="text-lg font-normal">Ledger Account - {ledgerInfo.name}</span>
              <br />
              <span className="text-sm font-normal">
                Period: {format(new Date(dateFrom), 'dd/MM/yyyy')} to {format(new Date(dateTo), 'dd/MM/yyyy')}
              </span>
            </CardTitle>
            </CardHeader>
            <CardContent>
              <Table className="border border-border">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Particulars</TableHead>
                    <TableHead>Voucher Type</TableHead>
                    <TableHead>Vch No.</TableHead>
                    <TableHead className="text-right">DR ({currencySymbol})</TableHead>
                    <TableHead className="text-right">CR ({currencySymbol})</TableHead>
                    <TableHead className="text-right">Running Balance</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell>{row.date}</TableCell>
                      <TableCell>{row.particulars}</TableCell>
                      <TableCell>{row.voucherType || '-'}</TableCell>
                      <TableCell>
                        {row.voucherNumber || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.debit > 0 ? formatAmount(Number(row.debit)) : ''}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.credit > 0 ? formatAmount(Number(row.credit)) : ''}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatSignedBalance(Number(row.balance || 0))}
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
                  <TableRow>
                    <TableCell colSpan={4} className="text-right font-medium">Opening Balance :</TableCell>
                    <TableCell className="text-right font-semibold">
                      {openingBalance < 0 ? formatAmount(Math.abs(openingBalance)) : ''}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {openingBalance > 0 ? formatAmount(Math.abs(openingBalance)) : ''}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground"></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={4} className="text-right font-medium">Current Total :</TableCell>
                    <TableCell className="text-right font-semibold">
                      {runningDebitTotal > 0 ? formatAmount(runningDebitTotal) : ''}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {runningCreditTotal > 0 ? formatAmount(runningCreditTotal) : ''}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground"></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={4} className="text-right font-bold">Closing Balance :</TableCell>
                    <TableCell className="text-right font-bold">
                      {closingBalance < 0 ? formatAmount(Math.abs(closingBalance)) : ''}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {closingBalance > 0 ? formatAmount(Math.abs(closingBalance)) : ''}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground"></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
        </div>
      </div>
    </div>
  );
};

export default LedgerReport;