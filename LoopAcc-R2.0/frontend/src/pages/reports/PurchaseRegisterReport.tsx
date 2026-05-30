import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { API_BASE_URL } from '@/config/runtime';

interface PurchaseEntry {
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
}


const PurchaseRegisterReport = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedCompany, periodFrom, periodTo } = useCompany();
  const [purchaseData, setPurchaseData] = useState<PurchaseEntry[]>([]);
  const [viewVoucher, setViewVoucher] = useState<{ id: string; typeId: string; type: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(periodFrom);
  const [dateTo, setDateTo] = useState(periodTo);
  const currencySymbol = selectedCompany?.currency === 'INR' ? '₹' : selectedCompany?.currency === 'USD' ? '$' : selectedCompany?.currency || '₹';

  useEffect(() => { setDateFrom(periodFrom); }, [periodFrom]);
  useEffect(() => { setDateTo(periodTo); }, [periodTo]);
  useEffect(() => { if (selectedCompany) { fetchPurchaseData(); } }, [selectedCompany, dateFrom, dateTo]);

  async function fetchPurchaseData() {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ companyId: selectedCompany.id, dateFrom, dateTo });
      const resp = await fetch(`${API_BASE_URL}/vouchers/report/purchase-register?${params}`);
      if (!resp.ok) throw new Error('Failed to fetch purchase data');
      const json = await resp.json();
      const formattedData = (json?.data || []).map((voucher: any) => ({
        id: voucher.id,
        voucher_number: voucher.voucher_number,
        voucher_date: voucher.voucher_date,
        voucher_type: voucher.voucher_type || '',
        voucher_type_id: voucher.voucher_type_id || '',
        voucher_type_name: voucher.voucher_type_name || '',
        ledger_name: voucher.ledger_name || 'Unknown',
        debit_amount: String(voucher.voucher_type || '').toLowerCase() === 'debit-note' ? (voucher.net_amount || 0) : 0,
        credit_amount: String(voucher.voucher_type || '').toLowerCase() === 'debit-note' ? 0 : (voucher.net_amount || 0),
        narration: voucher.narration || ''
      }));
      setPurchaseData(formattedData);
    } catch (error) {
      console.error('Error fetching purchase data:', error);
      toast({ title: 'Error', description: 'Failed to fetch purchase data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  const handleEdit = (voucherId: string) => {
    navigate(`/vouchers?type=purchase&edit=${voucherId}`, { state: { returnTo: '/reports/purchase-register' } });
  };
  const handleDelete = async (voucherId: string) => {
    if (!confirm('Are you sure you want to delete this purchase voucher?')) return;
    try {
      const resp = await fetch(`${API_BASE_URL}/vouchers/${voucherId}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed to delete voucher');
      toast({ title: 'Deleted', description: 'Purchase voucher deleted successfully.' });
      fetchPurchaseData();
    } catch (error) {
      console.error('Error deleting voucher:', error);
      toast({ title: 'Error', description: 'Failed to delete voucher', variant: 'destructive' });
    }
  };
  const handlePrint = () => {
    window.print();
  };

  // Main render
  return (
    <div className="bg-background h-screen flex flex-col overflow-hidden">
      <div className="flex-shrink-0 bg-background border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Button variant="ghost" onClick={() => navigate(-1)} className="mr-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">Purchase Register</h1>
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
              <CardTitle>Purchase Register</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Voucher Number</TableHead>
                      <TableHead>Voucher Type</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
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
                        <TableCell>{purchase.ledger_name}</TableCell>
                        <TableCell className="text-right">{purchase.debit_amount > 0 ? `${currencySymbol} ${purchase.debit_amount.toFixed(2)}` : ''}</TableCell>
                        <TableCell className="text-right">{purchase.credit_amount > 0 ? `${currencySymbol} ${purchase.credit_amount.toFixed(2)}` : ''}</TableCell>
                        <TableCell>{purchase.narration}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => setViewVoucher({ id: purchase.id, typeId: purchase.voucher_type_id, type: purchase.voucher_type })}><Eye className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(purchase.id)}><Edit className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(purchase.id)}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={4}><strong>TOTAL</strong></TableCell>
                      <TableCell className="text-right"><strong>{currencySymbol} {purchaseData.reduce((sum, p) => sum + p.debit_amount, 0).toFixed(2)}</strong></TableCell>
                      <TableCell className="text-right"><strong>{currencySymbol} {purchaseData.reduce((sum, p) => sum + p.credit_amount, 0).toFixed(2)}</strong></TableCell>
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
          {viewVoucher.type.toLowerCase().includes('purchase') || viewVoucher.type.toLowerCase().includes('debit') ? (
            <InventoryVchViewForm voucherId={viewVoucher.id} voucherTypeId={viewVoucher.typeId} voucherType="purchase" onClose={() => setViewVoucher(null)} />
          ) : (
            <AccountingVchViewForm voucherId={viewVoucher.id} voucherTypeId={viewVoucher.typeId} onClose={() => setViewVoucher(null)} />
          )}
        </VoucherViewModal>
      )}
    </div>
  );
};

export default PurchaseRegisterReport;