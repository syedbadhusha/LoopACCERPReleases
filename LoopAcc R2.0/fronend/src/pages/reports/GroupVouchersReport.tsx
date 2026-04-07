import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, BookOpen, Download, Edit, Printer, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';

type GroupVoucherRow = {
  voucherId?: string;
  date: string;
  particulars: string;
  voucherType: string;
  voucherNumber: string;
  debit: number;
  credit: number;
  balance: number;
};

const GroupVouchersReport = () => {
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();

  const [dateFrom, setDateFrom] = useState(() => {
    const saved = localStorage.getItem('groupVouchers_dateFrom');
    if (saved) return saved;
    const today = new Date();
    const yearStart = new Date(today.getFullYear(), 3, 1);
    return format(yearStart, 'yyyy-MM-dd');
  });
  const [dateTo, setDateTo] = useState(() => {
    const saved = localStorage.getItem('groupVouchers_dateTo');
    return saved || format(new Date(), 'yyyy-MM-dd');
  });

  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [groupInfo, setGroupInfo] = useState<any>(null);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [reportData, setReportData] = useState<GroupVoucherRow[]>([]);

  useEffect(() => {
    if (selectedCompany) {
      fetchGroups();
    }
  }, [selectedCompany]);

  useEffect(() => {
    localStorage.setItem('groupVouchers_dateFrom', dateFrom);
    localStorage.setItem('groupVouchers_dateTo', dateTo);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (selectedCompany && selectedGroup && dateFrom && dateTo) {
      fetchGroupVoucherReport();
    }
  }, [selectedCompany, selectedGroup, dateFrom, dateTo]);

  const fetchGroups = async () => {
    try {
      const params = new URLSearchParams({
        companyId: selectedCompany?.id || '',
      });
      const resp = await fetch(`http://localhost:5000/api/groups?${params}`);
      if (!resp.ok) throw new Error('Failed to fetch groups');

      const json = await resp.json();
      const data = Array.isArray(json?.data) ? json.data : [];
      const sorted = [...data].sort((left, right) =>
        String(left?.name || '').localeCompare(String(right?.name || '')),
      );
      setGroups(sorted);
    } catch (error) {
      console.error('Error fetching groups:', error);
      setGroups([]);
    }
  };

  const fetchGroupVoucherReport = async () => {
    try {
      const params = new URLSearchParams({
        companyId: selectedCompany?.id || '',
        groupId: selectedGroup,
        dateFrom,
        dateTo,
      });
      const resp = await fetch(`http://localhost:5000/api/ledgers/report/group-vouchers?${params}`);
      if (!resp.ok) throw new Error('Failed to fetch group vouchers report data');

      const json = await resp.json();
      setGroupInfo(json?.data?.group || null);
      setOpeningBalance(Number(json?.data?.opening || 0));
      setReportData(Array.isArray(json?.data?.transactions) ? json.data.transactions : []);
    } catch (error) {
      console.error('Error fetching group vouchers report:', error);
      setGroupInfo(null);
      setOpeningBalance(0);
      setReportData([]);
    }
  };

  const handleBack = () => {
    localStorage.removeItem('groupVouchers_dateFrom');
    localStorage.removeItem('groupVouchers_dateTo');
    if (window.history.length > 1) navigate(-1);
    else navigate('/reports');
  };

  const formatAmount = (value: number) =>
    Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const formatSignedBalance = (value: number) => {
    const numeric = Number(value || 0);
    if (numeric === 0) return '';
    return `${formatAmount(Math.abs(numeric))} ${numeric < 0 ? 'Dr' : 'Cr'}`;
  };

  const formatVoucherDate = (value: string) => {
    if (!value) return '';
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return format(parsed, 'd-MMM-yy');
  };

  const currentDebitTotal = useMemo(
    () => reportData.reduce((sum, row) => sum + Number(row?.debit || 0), 0),
    [reportData],
  );
  const currentCreditTotal = useMemo(
    () => reportData.reduce((sum, row) => sum + Number(row?.credit || 0), 0),
    [reportData],
  );
  const closingBalance = openingBalance + currentCreditTotal - currentDebitTotal;

  const handleDeleteVoucher = async (row: GroupVoucherRow) => {
    const voucherId = String(row?.voucherId || '');
    if (!voucherId) return;
    if (!confirm('Are you sure you want to delete this voucher?')) return;
    try {
      const resp = await fetch(`http://localhost:5000/api/vouchers/${voucherId}`, {
        method: 'DELETE',
      });
      if (!resp.ok) throw new Error('Failed to delete voucher');
      toast({ title: 'Deleted', description: 'Voucher deleted successfully.' });
      fetchGroupVoucherReport();
    } catch (error) {
      console.error('Error deleting voucher:', error);
      toast({ title: 'Error', description: 'Failed to delete voucher', variant: 'destructive' });
    }
  };

  const handleEditVoucher = (row: GroupVoucherRow) => {
    const voucherId = String(row?.voucherId || '');
    if (!voucherId) return;

    const voucherType = String(row?.voucherType || '').toLowerCase();
    const typeMap: Record<string, string> = {
      sales: '/sales',
      'credit-note': '/credit-note',
      purchase: '/purchase',
      'debit-note': '/debit-note',
      payment: '/payment',
      receipt: '/receipt',
    };

    const path = typeMap[voucherType];
    if (!path) return;
    navigate(`${path}?edit=${encodeURIComponent(voucherId)}`, { state: { returnTo: '/reports/group-vouchers' } });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Button variant="ghost" onClick={handleBack} className="mr-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">Group Vouchers</h1>
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
          <CardContent className="pt-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <Label>Select Group</Label>
                <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a group" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="group-vouchers-date-from">From Date</Label>
                <Input
                  id="group-vouchers-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="group-vouchers-date-to">To Date</Label>
                <Input
                  id="group-vouchers-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {selectedGroup && groupInfo && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-semibold">{selectedCompany?.name}</div>
                  <div className="text-lg font-normal">Group: {groupInfo.name}</div>
                </div>
                <div className="text-right text-sm font-normal leading-6">
                  <div>{format(new Date(`${dateFrom}T00:00:00`), 'd-MMM-yy')} to {format(new Date(`${dateTo}T00:00:00`), 'd-MMM-yy')}</div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table className="border border-border">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Particulars</TableHead>
                    <TableHead>Vch Type</TableHead>
                    <TableHead>Vch No.</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Running Balance</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map((row, index) => (
                    <TableRow key={`${row.voucherNumber}-${index}`}>
                      <TableCell>{formatVoucherDate(row.date)}</TableCell>
                      <TableCell>{row.particulars}</TableCell>
                      <TableCell>{row.voucherType || ''}</TableCell>
                      <TableCell>{row.voucherNumber || ''}</TableCell>
                      <TableCell className="text-right">
                        {row.debit > 0 ? formatAmount(row.debit) : ''}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.credit > 0 ? formatAmount(row.credit) : ''}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatSignedBalance(row.balance)}
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
                      {currentDebitTotal > 0 ? formatAmount(currentDebitTotal) : ''}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {currentCreditTotal > 0 ? formatAmount(currentCreditTotal) : ''}
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
  );
};

export default GroupVouchersReport;