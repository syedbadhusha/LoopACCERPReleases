import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Printer } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { format } from 'date-fns';

interface OutstandingItem {
  voucher_id: string;
  voucher_number: string;
  voucher_date: string;
  ledger_name: string;
  invoice_amount: number;
  allocated_amount: number;
  outstanding_amount: number;
}

const OutstandingPayableReport = () => {
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const [outstandingData, setOutstandingData] = useState<OutstandingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    if (selectedCompany) {
      fetchOutstandingData();
    }
  }, [selectedCompany, dateTo]);

  const fetchOutstandingData = async () => {
    if (!selectedCompany) return;

    try {
      setLoading(true);

      const params = new URLSearchParams({
        companyId: selectedCompany.id,
      });
      const resp = await fetch(`http://localhost:5000/api/vouchers/report/outstanding-payables?${params}`);
      if (!resp.ok) throw new Error('Failed to fetch outstanding data');
      
      const json = await resp.json();
      const payables = json?.data || [];

      const outstanding: OutstandingItem[] = payables
        .map((item: any) => ({
          voucher_id: item.voucher_id || '',
          voucher_number: item.voucher_number || '',
          voucher_date: item.voucher_date || new Date().toISOString(),
          ledger_name: item.ledger_name || 'Unknown',
          invoice_amount: item.invoice_amount || 0,
          allocated_amount: item.allocated_amount || 0,
          outstanding_amount: item.pending_amount || 0
        }))
        .filter((item: any) => item.outstanding_amount > 0.01);
      
      console.log('[OutstandingPayableReport] Fetched payables:', {
        totalFromAPI: payables.length,
        afterMapping: outstanding.length,
        data: outstanding
      });

      setOutstandingData(outstanding);
    } catch (error) {
      console.error('Error fetching outstanding payables:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const totalInvoice = outstandingData.reduce((sum, item) => sum + item.invoice_amount, 0);
    const totalAllocated = outstandingData.reduce((sum, item) => sum + item.allocated_amount, 0);
    const totalOutstanding = outstandingData.reduce((sum, item) => sum + item.outstanding_amount, 0);

    printWindow.document.write(`
      <html>
        <head>
          <title>Outstanding Payables</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            h1 { margin: 0; }
            .period { margin: 10px 0; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #000; padding: 8px; text-align: left; }
            th { background-color: #f0f0f0; font-weight: bold; }
            .text-right { text-align: right; }
            .total-row { font-weight: bold; background-color: #f0f0f0; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${selectedCompany?.name}</h1>
            <h2>OUTSTANDING PAYABLES</h2>
            <div class="period">As on: ${format(new Date(dateTo), 'dd/MM/yyyy')}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice No.</th>
                <th>Supplier</th>
                <th class="text-right">Invoice Amount</th>
                <th class="text-right">Paid</th>
                <th class="text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              ${outstandingData.map(item => `
                <tr>
                  <td>${format(new Date(item.voucher_date), 'dd/MM/yyyy')}</td>
                  <td>${item.voucher_number}</td>
                  <td>${item.ledger_name}</td>
                  <td class="text-right">₹${item.invoice_amount.toFixed(2)}</td>
                  <td class="text-right">₹${item.allocated_amount.toFixed(2)}</td>
                  <td class="text-right">₹${item.outstanding_amount.toFixed(2)}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="3"><strong>TOTAL</strong></td>
                <td class="text-right"><strong>₹${totalInvoice.toFixed(2)}</strong></td>
                <td class="text-right"><strong>₹${totalAllocated.toFixed(2)}</strong></td>
                <td class="text-right"><strong>₹${totalOutstanding.toFixed(2)}</strong></td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  if (!selectedCompany) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">No Company Selected</h1>
          <p className="text-muted-foreground">Please select a company to view outstanding payables.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Button variant="ghost" onClick={() => { if (window.history.length > 1) { navigate(-1); } else { navigate('/dashboard'); } }} className="mr-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">Outstanding Payables</h1>
          </div>
          <Button onClick={handlePrint} variant="outline">
            <Printer className="h-4 w-4 mr-2" />
            Print Report
          </Button>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filter Options</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4">
            <div>
              <Label htmlFor="date-to">As on Date</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {!loading && outstandingData.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-sm font-medium text-muted-foreground mb-2">Total Invoice</div>
                  <div className="text-3xl font-bold text-blue-600">₹{outstandingData.reduce((sum, item) => sum + item.invoice_amount, 0).toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground mt-2">{outstandingData.length} Invoices</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-sm font-medium text-muted-foreground mb-2">Total Paid</div>
                  <div className="text-3xl font-bold text-green-600">₹{outstandingData.reduce((sum, item) => sum + item.allocated_amount, 0).toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground mt-2">Payments Received</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-sm font-medium text-muted-foreground mb-2">Total Outstanding</div>
                  <div className="text-3xl font-bold text-red-600">₹{outstandingData.reduce((sum, item) => sum + item.outstanding_amount, 0).toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground mt-2">Amount Due</div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Outstanding Payables Report</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-4">Loading...</div>
            ) : outstandingData.length > 0 ? (
              <>
                <Table className="border border-border">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice No.</TableHead>
                      <TableHead style={{ minWidth: '200px' }}>Supplier</TableHead>
                      <TableHead className="text-right">Invoice Amount</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outstandingData.map((item) => (
                      <TableRow key={item.voucher_id}>
                        <TableCell>{format(new Date(item.voucher_date), 'dd/MM/yyyy')}</TableCell>
                        <TableCell>{item.voucher_number}</TableCell>
                        <TableCell style={{ minWidth: '200px' }}>{item.ledger_name}</TableCell>
                        <TableCell className="text-right">₹{item.invoice_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">₹{item.allocated_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">₹{item.outstanding_amount.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold bg-muted/50">
                      <TableCell colSpan={3}>Total</TableCell>
                      <TableCell className="text-right">
                        ₹{outstandingData.reduce((sum, item) => sum + item.invoice_amount, 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{outstandingData.reduce((sum, item) => sum + item.allocated_amount, 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{outstandingData.reduce((sum, item) => sum + item.outstanding_amount, 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No outstanding payables found.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OutstandingPayableReport;
