import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Edit, Printer, Trash2 } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface VoucherEntry {
  id: string;
  voucher_number: string;
  voucher_date: string;
  voucher_type: string;
  voucher_type_id: string;
  voucher_type_name: string;
  is_pos: boolean;
  ledger_name: string;
  particulars: string;
  debit_amount: number;
  credit_amount: number;
  narration: string | null;
}

interface VoucherTypeOption {
  id: string;
  name: string;
  base_type: string;
}
const VoucherHistoryReport = () => {
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [voucherData, setVoucherData] = useState<VoucherEntry[]>([]);
  const [voucherTypes, setVoucherTypes] = useState<VoucherTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dynamic tax label based on company tax type
  const taxLabel = selectedCompany?.tax_type === 'GST' ? 'GST Amount' : 
                   selectedCompany?.tax_type === 'VAT' ? 'VAT Amount' : 
                   'Tax Amount';

  const CREDIT_TYPES = new Set(['purchase', 'credit-note', 'payment']);
  // Load filter state from localStorage
  const [dateFrom, setDateFrom] = useState(() => {
    const saved = localStorage.getItem('voucherHistory_dateFrom');
    return saved || format(new Date(), 'yyyy-MM-dd');
  });
  const [dateTo, setDateTo] = useState(() => {
    const saved = localStorage.getItem('voucherHistory_dateTo');
    return saved || format(new Date(), 'yyyy-MM-dd');
  });
  const [voucherType, setVoucherType] = useState(() => {
    const saved = localStorage.getItem('voucherHistory_voucherType');
    return saved || 'all';
  });
  const currencySymbol = selectedCompany?.currency === 'INR' ? '₹' : selectedCompany?.currency === 'USD' ? '$' : selectedCompany?.currency || '₹';

  // Fetch voucher type master list for filter dropdown
  useEffect(() => {
    if (!selectedCompany) return;
    fetch(`http://localhost:5000/api/voucher-types?companyId=${selectedCompany.id}`)
      .then(r => r.json())
      .then(json => setVoucherTypes(json.data || []))
      .catch(() => setVoucherTypes([]));
  }, [selectedCompany]);
  // Save filter state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('voucherHistory_dateFrom', dateFrom);
    localStorage.setItem('voucherHistory_dateTo', dateTo);
    localStorage.setItem('voucherHistory_voucherType', voucherType);
  }, [dateFrom, dateTo, voucherType]);

  const fetchVoucherData = async () => {
    if (!selectedCompany) return;

    try {
      setLoading(true);
      
      const params = new URLSearchParams({
        companyId: selectedCompany.id,
        dateFrom,
        dateTo,
        ...(voucherType !== 'all' && { voucherTypeId: voucherType }),
      });

      const resp = await fetch(`http://localhost:5000/api/vouchers/report/history?${params}`);
      if (!resp.ok) throw new Error('Failed to fetch voucher data');
      
      const json = await resp.json();
      const formattedData: VoucherEntry[] = json?.data?.map((item: any) => ({
        id: item.id,
        voucher_number: item.voucher_number,
        voucher_date: item.voucher_date,
        voucher_type: item.voucher_type,
        voucher_type_id: item.voucher_type_id || '',
        voucher_type_name: item.voucher_type_name || item.voucher_type || '',
        is_pos: item.is_pos === true,
        ledger_name: item.ledger_name || '',
        particulars: item.particulars || item.ledger_name || '',
        debit_amount: CREDIT_TYPES.has(String(item.voucher_type || '').toLowerCase()) ? 0 : (item.net_amount || 0),
        credit_amount: CREDIT_TYPES.has(String(item.voucher_type || '').toLowerCase()) ? (item.net_amount || 0) : 0,
        narration: item.narration,
      })) || [];

      setVoucherData(formattedData);
    } catch (error) {
      console.error('Error fetching voucher data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch voucher data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

useEffect(() => {
    if (selectedCompany && dateFrom && dateTo && voucherType) {
      fetchVoucherData();
    }
  }, [selectedCompany, dateFrom, dateTo, voucherType]);

const handleEdit = (voucherId: string, voucherType: string, isPos: boolean) => {
    localStorage.setItem('voucherHistory_dateFrom', dateFrom);
    localStorage.setItem('voucherHistory_dateTo', dateTo);
    localStorage.setItem('voucherHistory_voucherType', voucherType);

    // POS vouchers open in the POS screen
    if (isPos) {
      navigate(`/pos?edit=${voucherId}`, { state: { returnTo: '/reports/voucher-history' } });
      return;
    }

    const typeMap: Record<string, string> = {
      sales: '/vouchers?type=sales',
      'credit-note': '/vouchers?type=credit-note',
      purchase: '/vouchers?type=purchase',
      'debit-note': '/vouchers?type=debit-note',
      payment: '/vouchers?type=payment',
      receipt: '/vouchers?type=receipt',
    };    
    const path = typeMap[voucherType];
    if (path) {
      navigate(`${path}&edit=${voucherId}`, { state: { returnTo: '/reports/voucher-history' } });
    } else {
      toast({
        title: "Edit Not Supported",
        description: `No edit route configured for voucher type: ${voucherType}`,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (voucherId: string) => {
    if (!confirm('Are you sure you want to delete this voucher?')) return;
    try {
      const resp = await fetch(`http://localhost:5000/api/vouchers/${voucherId}`, {
        method: 'DELETE',
      });
      if (!resp.ok) throw new Error('Failed to delete voucher');
      toast({ title: 'Deleted', description: 'Voucher deleted successfully.' });
      fetchVoucherData();
    } catch (error) {
      console.error('Error deleting voucher:', error);
      toast({ title: 'Error', description: 'Failed to delete voucher', variant: 'destructive' });
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const totalAmount = voucherData.reduce((sum, item) => sum + item.total_amount, 0);
    const netAmount = voucherData.reduce((sum, item) => sum + item.net_amount, 0);

    printWindow.document.write(`
      <html>
        <head>
          <title>Voucher History Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { text-align: center; color: #333; }
            .header { text-align: center; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .amount { text-align: right; }
            .total-row { font-weight: bold; background-color: #f9f9f9; }
            .date-range { margin: 10px 0; }
            .voucher-type { text-transform: capitalize; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${selectedCompany?.name}</h1>
            <h2>Voucher History Report</h2>
            <div class="date-range">
              <strong>Period:</strong> ${format(new Date(dateFrom), 'dd/MM/yyyy')} to ${format(new Date(dateTo), 'dd/MM/yyyy')}
              ${voucherType !== 'all' ? `<br><strong>Type:</strong> ${voucherTypes.find(vt => vt.id === voucherType)?.name || voucherType}` : ''}
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher No.</th>
                <th>Type</th>
                <th>Particulars</th>
                <th style="text-align: right">Total Amount</th>
                <th style="text-align: right">Net Amount</th>
                <th>Narration</th>
              </tr>
            </thead>
            <tbody>
              ${voucherData.map(item => `
                <tr>
                  <td>${format(new Date(item.voucher_date), 'dd/MM/yyyy')}</td>
                  <td>${item.voucher_number}</td>
                  <td class="voucher-type">${item.voucher_type_name}</td>
                  <td>${item.particulars}</td>
                  <td class="amount">${currencySymbol} ${item.total_amount.toFixed(2)}</td>
                  <td class="amount">${currencySymbol} ${item.net_amount.toFixed(2)}</td>
                  <td>${item.narration || ''}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="4"><strong>Total</strong></td>
                <td class="amount"><strong>${currencySymbol} ${totalAmount.toFixed(2)}</strong></td>
                <td class="amount"><strong>${currencySymbol} ${netAmount.toFixed(2)}</strong></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };
   // 🔹 Reset filters to default

  // 🔹 Handle back navigation
  const handleBack = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    setDateFrom(today);
    setDateTo(today);
    setVoucherType('all');
    localStorage.removeItem('voucherHistory_dateFrom');
    localStorage.removeItem('voucherHistory_dateTo');
    localStorage.removeItem('voucherHistory_voucherType');
    if (window.history.length > 1) navigate(-1);
    else navigate('/reports');
  };

  if (!selectedCompany) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">No Company Selected</h1>
            <p className="text-muted-foreground">Please select a company to view voucher history.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background h-screen flex flex-col overflow-hidden">
      <div className="flex-shrink-0 bg-background border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Button variant="ghost" onClick={handleBack} className="mr-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">Voucher History Report</h1>
          </div>
          <Button onClick={handlePrint} variant="outline">
            <Printer className="h-4 w-4 mr-2" />
            Print Report
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">

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
            <div>
              <Label htmlFor="voucher-type">Voucher Type</Label>
              <Select value={voucherType} onValueChange={setVoucherType}>
                <SelectTrigger className="min-w-[180px]">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {voucherTypes.map(vt => (
                    <SelectItem key={vt.id} value={vt.id}>{vt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Voucher Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-4">Loading...</div>
            ) : voucherData.length > 0 ? (
              <>
                <Table className="border border-border">
                  <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Voucher No.</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead style={{ minWidth: '200px' }}>Particulars</TableHead>
                    <TableHead className="text-right">Debit ({currencySymbol})</TableHead>
                      <TableHead className="text-right">Credit ({currencySymbol})</TableHead>
                      <TableHead>Narration</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {voucherData.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{format(new Date(item.voucher_date), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>{item.voucher_number}</TableCell>
                      <TableCell className="capitalize">{item.voucher_type_name}</TableCell>
                      <TableCell style={{ minWidth: '200px' }}>{item.particulars}</TableCell>
                      <TableCell className="text-right">{item.debit_amount > 0 ? `${currencySymbol} ${item.debit_amount.toFixed(2)}` : ''}</TableCell>
                        <TableCell className="text-right">{item.credit_amount > 0 ? `${currencySymbol} ${item.credit_amount.toFixed(2)}` : ''}</TableCell>
                        <TableCell>{item.narration || ''}</TableCell>
                        <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(item.id, item.voucher_type, item.is_pos)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold bg-muted/50">
                      <TableCell colSpan={4}>Total</TableCell>
                      <TableCell className="text-right">
                        {currencySymbol} {voucherData.reduce((sum, item) => sum + item.debit_amount, 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {currencySymbol} {voucherData.reduce((sum, item) => sum + item.credit_amount, 0).toFixed(2)}
                      </TableCell>
                      <TableCell colSpan={2}></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No voucher data found for the selected period.
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
};

export default VoucherHistoryReport;