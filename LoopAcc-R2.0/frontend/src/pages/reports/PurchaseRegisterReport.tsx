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

interface PurchaseEntry {
  id: string;
  voucher_number: string;
  voucher_date: string;
  voucher_type: string;
  voucher_type_name: string;
  ledger_name: string;
  debit_amount: number;
  credit_amount: number;
  narration: string;
}

const PurchaseRegisterReport = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const [purchaseData, setPurchaseData] = useState<PurchaseEntry[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Load filter state from localStorage
  const [dateFrom, setDateFrom] = useState(() => {
    const saved = localStorage.getItem('purchaseRegister_dateFrom');
    return saved || new Date().toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => {
    const saved = localStorage.getItem('purchaseRegister_dateTo');
    return saved || new Date().toISOString().split('T')[0];
  });
  const currencySymbol = selectedCompany?.currency === 'INR' ? '₹' : selectedCompany?.currency === 'USD' ? '$' : selectedCompany?.currency || '₹';
  // Save filter state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('purchaseRegister_dateFrom', dateFrom);
    localStorage.setItem('purchaseRegister_dateTo', dateTo);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (selectedCompany) {
      fetchPurchaseData();
    }
  }, [selectedCompany, dateFrom, dateTo]);

  const fetchPurchaseData = async () => {
    if (!selectedCompany) return;
    setLoading(true);

    try {
      const params = new URLSearchParams({
        companyId: selectedCompany.id,
        dateFrom,
        dateTo,
      });
      const resp = await fetch(`http://localhost:5000/api/vouchers/report/purchase-register?${params}`);
      if (!resp.ok) throw new Error('Failed to fetch purchase data');
      
      const json = await resp.json();
      const formattedData = (json?.data || []).map((voucher: any) => ({
        id: voucher.id,
        voucher_number: voucher.voucher_number,
        voucher_date: voucher.voucher_date,
        voucher_type: voucher.voucher_type || '',
        voucher_type_name: voucher.voucher_type_name || '',
        ledger_name: voucher.ledger_name || 'Unknown',
        debit_amount: String(voucher.voucher_type || '').toLowerCase() === 'debit-note' ? (voucher.net_amount || 0) : 0,
        credit_amount: String(voucher.voucher_type || '').toLowerCase() === 'debit-note' ? 0 : (voucher.net_amount || 0),
        narration: voucher.narration || ''
      }));

      setPurchaseData(formattedData);
    } catch (error) {
      console.error('Error fetching purchase data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch purchase data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (voucherId: string) => {
    navigate(`/vouchers?type=purchase&edit=${voucherId}`, { state: { returnTo: '/reports/purchase-register' } });
  };

  const handleDelete = async (voucherId: string) => {
    if (!confirm('Are you sure you want to delete this purchase voucher?')) return;
    try {
      const resp = await fetch(`http://localhost:5000/api/vouchers/${voucherId}`, {
        method: 'DELETE',
      });
      if (!resp.ok) throw new Error('Failed to delete voucher');
      toast({ title: 'Deleted', description: 'Purchase voucher deleted successfully.' });
      fetchPurchaseData();
    } catch (error) {
      console.error('Error deleting voucher:', error);
      toast({ title: 'Error', description: 'Failed to delete voucher', variant: 'destructive' });
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const totalDebit = purchaseData.reduce((sum, purchase) => sum + purchase.debit_amount, 0);
    const totalCredit = purchaseData.reduce((sum, purchase) => sum + purchase.credit_amount, 0);

    printWindow.document.write(`
      <html>
        <head>
          <title>Purchase Register - ${selectedCompany?.name}</title>
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
            <h2>PURCHASE REGISTER</h2>
          </div>
          <div class="period">
            Period: ${dateFrom} to ${dateTo}
          </div>
          <table class="register">
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher Number</th>
                <th>Voucher Type</th>
                <th>Supplier</th>
                <th>Debit</th>
                <th>Credit</th>
                <th>Narration</th>
              </tr>
            </thead>
            <tbody>
              ${purchaseData.map(purchase => `
                <tr>
                  <td>${purchase.voucher_date}</td>
                  <td>${purchase.voucher_number}</td>
                  <td>${purchase.voucher_type_name}</td>
                  <td>${purchase.ledger_name}</td>
                  <td class="text-right">${purchase.debit_amount > 0 ? `${currencySymbol} ${purchase.debit_amount.toFixed(2)}` : ''}</td>
                  <td class="text-right">${purchase.credit_amount > 0 ? `${currencySymbol} ${purchase.credit_amount.toFixed(2)}` : ''}</td>
                  <td>${purchase.narration}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="4"><strong>TOTAL</strong></td>
                <td class="text-right"><strong>${currencySymbol} ${totalDebit.toFixed(2)}</strong></td>
                <td class="text-right"><strong>${currencySymbol} ${totalCredit.toFixed(2)}</strong></td>
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
    localStorage.removeItem('purchaseRegister_dateFrom');
    localStorage.removeItem('purchaseRegister_dateTo');

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
              Please select a company to view purchase register
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
            <h1 className="text-2xl font-bold">Purchase Register</h1>
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
            <CardTitle>Purchase Transactions</CardTitle>
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
                      <TableHead>Voucher Number</TableHead>
                      <TableHead>Voucher Type</TableHead>
                      <TableHead style={{ minWidth: '200px' }}>Supplier</TableHead>
                      <TableHead className="text-right">Debit ({currencySymbol})</TableHead>
                      <TableHead className="text-right">Credit ({currencySymbol})</TableHead>
                      <TableHead>Narration</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseData.map((purchase) => (
                      <TableRow key={purchase.id}>
                        <TableCell>{purchase.voucher_date}</TableCell>
                        <TableCell>{purchase.voucher_number}</TableCell>
                        <TableCell>{purchase.voucher_type_name}</TableCell>
                        <TableCell style={{ minWidth: '200px' }}>{purchase.ledger_name}</TableCell>
                        <TableCell className="text-right">{purchase.debit_amount > 0 ? `${currencySymbol} ${purchase.debit_amount.toFixed(2)}` : ''}</TableCell>
                        <TableCell className="text-right">{purchase.credit_amount > 0 ? `${currencySymbol} ${purchase.credit_amount.toFixed(2)}` : ''}</TableCell>
                        <TableCell>{purchase.narration}</TableCell>
                        <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(purchase.id)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(purchase.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {purchaseData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          No purchase transactions found for the selected period
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {purchaseData.length > 0 && (
                  <div className="mt-4 p-4 bg-muted rounded-lg">
                    <div className="grid grid-cols-2 gap-4 justify-end text-sm font-medium">
                      <div className="text-right">
                        Total Debit: {currencySymbol} {purchaseData.reduce((sum, purchase) => sum + purchase.debit_amount, 0).toFixed(2)}
                      </div>
                      <div className="text-right">
                        Total Credit: {currencySymbol} {purchaseData.reduce((sum, purchase) => sum + purchase.credit_amount, 0).toFixed(2)}
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

export default PurchaseRegisterReport;