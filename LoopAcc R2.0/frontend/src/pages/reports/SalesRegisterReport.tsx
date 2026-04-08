import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Edit, Printer, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';

interface SalesEntry {
  id: string;
  voucher_number: string;
  voucher_date: string;
  ledger_name: string;
  total_amount: number;
  tax_amount: number;
  net_amount: number;
  narration: string;
}

const SalesRegisterReport = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const [salesData, setSalesData] = useState<SalesEntry[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Dynamic tax label based on company tax type
  const taxLabel = selectedCompany?.tax_type === 'GST' ? 'GST Amount' : 
                   selectedCompany?.tax_type === 'VAT' ? 'VAT Amount' : 
                   'Tax Amount';
  // Load filter state from localStorage
  const [dateFrom, setDateFrom] = useState(() => {
    const saved = localStorage.getItem('salesRegister_dateFrom');
    return saved || new Date().toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => {
    const saved = localStorage.getItem('salesRegister_dateTo');
    return saved || new Date().toISOString().split('T')[0];
  });
  const currencySymbol = selectedCompany?.currency === 'INR' ? '₹' : selectedCompany?.currency === 'USD' ? '$' : selectedCompany?.currency || '₹';
  // Save filter state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('salesRegister_dateFrom', dateFrom);
    localStorage.setItem('salesRegister_dateTo', dateTo);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (selectedCompany) {
      fetchSalesData();
    }
  }, [selectedCompany, dateFrom, dateTo]);

  const fetchSalesData = async () => {
    if (!selectedCompany) return;
    setLoading(true);

    try {
      const params = new URLSearchParams({
        companyId: selectedCompany.id,
        dateFrom,
        dateTo,
      });
      const resp = await fetch(`http://localhost:5000/api/vouchers/report/sales-register?${params}`);
      if (!resp.ok) throw new Error('Failed to fetch sales data');
      
      const json = await resp.json();
      const formattedData = (json?.data || []).map((voucher: any) => ({
        id: voucher.id,
        voucher_number: voucher.voucher_number,
        voucher_date: voucher.voucher_date,
        ledger_name: voucher.ledger_name || 'Unknown',
        total_amount: voucher.total_amount,
        tax_amount: voucher.tax_amount || 0,
        net_amount: voucher.net_amount,
        narration: voucher.narration || ''
      }));

      setSalesData(formattedData);
    } catch (error) {
      console.error('Error fetching sales data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch sales data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (voucherId: string) => {
    navigate(`/vouchers?type=sales&edit=${voucherId}`, { state: { returnTo: '/reports/sales-register' } });
  };

  const handleDelete = async (voucherId: string) => {
    if (!confirm('Are you sure you want to delete this sales voucher?')) return;
    try {
      const resp = await fetch(`http://localhost:5000/api/vouchers/${voucherId}`, {
        method: 'DELETE',
      });
      if (!resp.ok) throw new Error('Failed to delete voucher');
      toast({ title: 'Deleted', description: 'Sales voucher deleted successfully.' });
      fetchSalesData();
    } catch (error) {
      console.error('Error deleting voucher:', error);
      toast({ title: 'Error', description: 'Failed to delete voucher', variant: 'destructive' });
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const totalAmount = salesData.reduce((sum, sale) => sum + sale.total_amount, 0);
    const totalTax = salesData.reduce((sum, sale) => sum + sale.tax_amount, 0);
    const totalNet = salesData.reduce((sum, sale) => sum + sale.net_amount, 0);

    printWindow.document.write(`
      <html>
        <head>
          <title>Sales Register - ${selectedCompany?.name}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
            .period { text-align: center; margin-bottom: 20px; font-weight: bold; }
            .register { width: 100%; border-collapse: collapse; }
            .register th, .register td { border: 1px solid #000; padding: 6px; text-align: left; }
            .register th { background-color: #f0f0f0; font-weight: bold; }
            .total-row { font-weight: bold; background-color: #f0f0f0; }
            .text-right { text-align: right; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${selectedCompany?.name}</h1>
            <h2>SALES REGISTER</h2>
          </div>
          <div class="period">
            Period: ${dateFrom} to ${dateTo}
          </div>
          <table class="register">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice No.</th>
                <th>Customer</th>
                <th>Total Amount</th>
                <th>${taxLabel}</th>
                <th>Net Amount</th>
                <th>Narration</th>
              </tr>
            </thead>
            <tbody>
              ${salesData.map(sale => `
                <tr>
                  <td>${sale.voucher_date}</td>
                  <td>${sale.voucher_number}</td>
                  <td>${sale.ledger_name}</td>
                  <td class="text-right">${currencySymbol} ${sale.total_amount.toFixed(2)}</td>
                  <td class="text-right">${currencySymbol} ${sale.tax_amount.toFixed(2)}</td>
                  <td class="text-right">${currencySymbol} ${sale.net_amount.toFixed(2)}</td>
                  <td>${sale.narration}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="3"><strong>TOTAL</strong></td>
                <td class="text-right"><strong>${currencySymbol} ${totalAmount.toFixed(2)}</strong></td>
                <td class="text-right"><strong>${currencySymbol} ${totalTax.toFixed(2)}</strong></td>
                <td class="text-right"><strong>${currencySymbol} ${totalNet.toFixed(2)}</strong></td>
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
const handleBack = () => {
    // Clear saved filters
    localStorage.removeItem('salesRegister_dateFrom');
    localStorage.removeItem('salesRegister_dateTo');

    // Reset current state values to today's date
    const today = new Date().toISOString().split('T')[0];
    setDateFrom(today);
    setDateTo(today);

    // Navigate back or to /reports
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/reports');
    }
  };

  if (!selectedCompany) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mt-10">
            <h2 className="text-xl font-semibold text-muted-foreground">
              Please select a company to view sales register
            </h2>
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
            <h1 className="text-2xl font-bold">Sales Register</h1>
          </div>
          <Button onClick={handlePrint} variant="outline">
            <Printer className="h-4 w-4 mr-2" />
            Print Register
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filter Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>From Date</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <Label>To Date</Label>
                <Input
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
            <CardTitle>Sales Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="border border-border">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice No.</TableHead>
                      <TableHead style={{ minWidth: '200px' }}>Customer</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead className="text-right">{taxLabel}</TableHead>
                      <TableHead className="text-right">Net Amount</TableHead>
                      <TableHead>Narration</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesData.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell>{sale.voucher_date}</TableCell>
                        <TableCell>{sale.voucher_number}</TableCell>
                        <TableCell style={{ minWidth: '200px' }}>{sale.ledger_name}</TableCell>
                        <TableCell className="text-right">{currencySymbol} {sale.total_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{currencySymbol} {sale.tax_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{currencySymbol} {sale.net_amount.toFixed(2)}</TableCell>
                        <TableCell>{sale.narration}</TableCell>
                        <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(sale.id)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(sale.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {salesData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                          No sales transactions found for the selected period
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {salesData.length > 0 && (
                  <div className="mt-4 p-4 bg-muted rounded-lg">
                    <div className="grid grid-cols-3 gap-4 text-sm font-medium">
                      <div className="text-right">
                        Total Amount: {currencySymbol} {salesData.reduce((sum, sale) => sum + sale.total_amount, 0).toFixed(2)}
                      </div>
                      <div className="text-right">
                        Total {taxLabel}: {currencySymbol} {salesData.reduce((sum, sale) => sum + sale.tax_amount, 0).toFixed(2)}
                      </div>
                      <div className="text-right">
                        Net Total: {currencySymbol} {salesData.reduce((sum, sale) => sum + sale.net_amount, 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
};

export default SalesRegisterReport;