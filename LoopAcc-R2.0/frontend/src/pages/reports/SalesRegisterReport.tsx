import { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '@/config/runtime';
interface SalesEntry {
  id: string;
  voucher_number: string;
  voucher_date: string;
  voucher_type: string;
  voucher_type_id: string;
  voucher_type_name: string;
  ledger_name: string;
  debit_amount: number;
  credit_amount: number;
  narration: string;
  is_pos?: boolean; // Optional flag to identify POS vouchers
}
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Edit, Printer, Trash2, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { VoucherViewModal } from '@/components/VoucherViewModal';

import InventoryVchViewForm from '../forms/InventoryVchViewForm';
import AccountingVchViewForm from '../forms/AccountingVchViewForm';
import POSViewForm from '../pos/POSViewForm';


const SalesRegisterReport = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedCompany, periodFrom, periodTo } = useCompany();
  const [searchParams] = useSearchParams();
  const queryDateFrom = searchParams.get('dateFrom') || '';
  const queryDateTo = searchParams.get('dateTo') || '';
  const [dateFrom, setDateFrom] = useState(() => queryDateFrom || periodFrom);
  const [dateTo, setDateTo] = useState(() => queryDateTo || periodTo);
  const [salesData, setSalesData] = useState<SalesEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const currencySymbol = selectedCompany?.currency === 'INR' ? '₹' : selectedCompany?.currency === 'USD' ? '$' : selectedCompany?.currency || '₹';
    const [voucherTypeName, setVoucherTypeName] = useState<string>('');
  // Modal-based view-only voucher popup logic
  const [viewVoucher, setViewVoucher] = useState<{
    voucherId: string,
    voucherTypeId: string,
    voucherType: string,
    voucherTypeName?: string,
    isInventory?: boolean,
    isPOS?: boolean
  } | null>(null);

  useEffect(() => { setDateFrom(periodFrom); }, [periodFrom]);
  useEffect(() => { setDateTo(periodTo); }, [periodTo]);
  useEffect(() => { if (selectedCompany) { fetchSalesData(); } }, [selectedCompany, dateFrom, dateTo]);

  async function fetchSalesData() {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ companyId: selectedCompany.id, dateFrom, dateTo });
      const resp = await fetch(`${API_BASE_URL}/vouchers/report/sales-register?${params}`);
      if (!resp.ok) throw new Error('Failed to fetch sales data');
      const json = await resp.json();
      const formattedData = (json?.data || []).map((voucher: any) => ({
        id: voucher.id,
        voucher_number: voucher.voucher_number,
        voucher_date: voucher.voucher_date,
        voucher_type: voucher.voucher_type || '',
        voucher_type_id: voucher.voucher_type_id || '',
        voucher_type_name: voucher.voucher_type_name || '',
        ledger_name: voucher.ledger_name || 'Unknown',
        debit_amount: String(voucher.voucher_type || '').toLowerCase() === 'credit-note' ? (voucher.net_amount || 0) : 0,
        credit_amount: String(voucher.voucher_type || '').toLowerCase() === 'credit-note' ? 0 : (voucher.net_amount || 0),
        narration: voucher.narration || '',
        is_pos: voucher.is_pos || false
      }));
      setSalesData(formattedData);
    } catch (error) {
      console.error('Error fetching sales data:', error);
      toast({ title: 'Error', description: 'Failed to fetch sales data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }
  const handleView = async (voucherId: string, voucherTypeId: string, voucherType: string, isPos: boolean) => {
    localStorage.setItem('voucherHistory_dateFrom', dateFrom);
    localStorage.setItem('voucherHistory_dateTo', dateTo);
    if (!voucherId || !voucherTypeId) return;
    if (isPos) {
      navigate(`/pos?view=${voucherId}`);
      return;
    }
    // Fetch voucher type meta to determine if inventory or accounting
    try {
      const resp = await fetch(`${API_BASE_URL}/voucher-types/${voucherTypeId}`);
      const json = await resp.json();
      const vt = json.data;
      const isInventory = vt && ['sales', 'credit-note', 'purchase', 'debit-note'].includes(vt.base_type);
      const isPOS = vt && vt.is_pos;
      setVoucherTypeName(vt?.name || voucherType);
      setViewVoucher({ voucherId, voucherTypeId, voucherType, voucherTypeName: vt?.name, isInventory, isPOS });
    } catch {
      setVoucherTypeName(voucherType);
      setViewVoucher({ voucherId, voucherTypeId, voucherType });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Row action handlers (must be outside JSX)
  const handleEdit = (voucherId: string) => {
    navigate(`/vouchers?type=sales&edit=${voucherId}`, { state: { returnTo: '/reports/sales-register' } });
  };
  const handleDelete = async (voucherId: string) => {
    if (!confirm('Are you sure you want to delete this sales voucher?')) return;
    try {
      const resp = await fetch(`${API_BASE_URL}/vouchers/${voucherId}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed to delete voucher');
      toast({ title: 'Deleted', description: 'Sales voucher deleted successfully.' });
      fetchSalesData();
    } catch (error) {
      console.error('Error deleting voucher:', error);
      toast({ title: 'Error', description: 'Failed to delete voucher', variant: 'destructive' });
    }
  };

  return (
    <div className="bg-background h-screen flex flex-col overflow-hidden">
      <div className="flex-shrink-0 bg-background border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">Sales Register</h1>
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
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>From Date</Label>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div>
                  <Label>To Date</Label>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Sales Register</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Voucher Number</TableHead>
                      <TableHead>Voucher Type</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead>Narration</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesData.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell>{sale.voucher_date}</TableCell>
                        <TableCell>{sale.voucher_number}</TableCell>
                        <TableCell>{sale.voucher_type_name}</TableCell>
                        <TableCell>{sale.ledger_name}</TableCell>
                        <TableCell className="text-right">{sale.debit_amount > 0 ? `${currencySymbol} ${sale.debit_amount.toFixed(2)}` : ''}</TableCell>
                        <TableCell className="text-right">{sale.credit_amount > 0 ? `${currencySymbol} ${sale.credit_amount.toFixed(2)}` : ''}</TableCell>
                        <TableCell>{sale.narration}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => handleView(sale.id, sale.voucher_type_id, sale.voucher_type, sale.is_pos)}><Eye className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(sale.id)}><Edit className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(sale.id)}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={4}><strong>TOTAL</strong></TableCell>
                      <TableCell className="text-right"><strong>{currencySymbol} {salesData.reduce((sum, s) => sum + s.debit_amount, 0).toFixed(2)}</strong></TableCell>
                      <TableCell className="text-right"><strong>{currencySymbol} {salesData.reduce((sum, s) => sum + s.credit_amount, 0).toFixed(2)}</strong></TableCell>
                      <TableCell colSpan={2}></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      {viewVoucher && (
        <VoucherViewModal open={!!viewVoucher} onOpenChange={() => setViewVoucher(null)}>
          {viewVoucher.voucherTypeName.toLowerCase().includes('sales') || viewVoucher.voucherTypeName.toLowerCase().includes('credit') ? (
            <InventoryVchViewForm voucherId={viewVoucher.voucherId} voucherTypeId={viewVoucher.voucherTypeId} voucherType="sales" onClose={() => setViewVoucher(null)} />
          ) : (
            <AccountingVchViewForm voucherId={viewVoucher.voucherId} voucherTypeId={viewVoucher.voucherTypeId} onClose={() => setViewVoucher(null)} />
          )}
        </VoucherViewModal>
      )}
    </div>
  );
};

export default SalesRegisterReport;