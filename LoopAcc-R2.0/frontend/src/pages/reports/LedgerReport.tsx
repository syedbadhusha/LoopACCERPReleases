

import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { VoucherViewModal } from '@/components/VoucherViewModal';
import AccountingVchViewForm from '../forms/AccountingVchViewForm';
import InventoryVchViewForm from '../forms/InventoryVchViewForm';
import POSViewForm from '../pos/POSViewForm';

import { API_BASE_URL } from '@/config/runtime';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Download, Edit, Printer, Trash2, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { format } from 'date-fns';

const normalizeBool = (val: any) =>
  val === true || val === "true" || val === 1;
const LedgerReport = () => {
  const navigate = useNavigate();

  // --- Voucher-wise view modal state and handler ---
  const [viewVoucher, setViewVoucher] = useState<{
    voucherId: string,
    voucherTypeId: string,
    voucherType: string,
    voucherTypeName?: string,
    isInventory?: boolean,
    isPOS?: boolean
  } | null>(null);
  const [voucherTypeName, setVoucherTypeName] = useState<string>('');
  const handleViewVoucher = async (row: any) => {
  const voucherId = String(row?.voucherId || '');
  const voucherTypeId = String(row?.voucherTypeId || '');
  const voucherType = String(row?.voucherType || '').toLowerCase();
  const isPos = normalizeBool(row?.is_pos);
      localStorage.setItem('ledgerReport_dateFrom', dateFrom);
      localStorage.setItem('ledgerReport_dateTo', dateTo);
      if (!voucherId || !voucherTypeId) return;
    if (isPos) {
      navigate(`/pos?view=${voucherId}`);
      return;
    }

  try {
    const resp = await fetch(`${API_BASE_URL}/voucher-types/${voucherTypeId}`);
    const json = await resp.json();
    const vt = json.data;
    const isInventory =
      vt && ['sales', 'credit-note', 'purchase', 'debit-note'].includes(vt.base_type);
    // ✅ FINAL CORRECT LOGIC
    const isPOS =
      normalizeBool(row?.is_pos) ||
      normalizeBool(row?.isPos) || // fallback (if different naming)
      normalizeBool(vt?.is_pos);
    setViewVoucher({
      voucherId,
      voucherTypeId,
      voucherType,
      voucherTypeName: vt?.name,
      isInventory,
      isPOS,
    });

  } catch {
    setViewVoucher({
      voucherId,
      voucherTypeId,
      voucherType,
      isPOS: normalizeBool(row?.is_pos),
    });
  }
};
  const handlePrintVoucher = (row: any) => {
    const voucherId = String(row?.voucherId || '');
    const voucherTypeId = String(row?.voucherTypeId || '');
    if (!voucherId || !voucherTypeId) return;
    navigate(`/vouchers?typeId=${voucherTypeId}&edit=${voucherId}&autoPrint=1`, { state: { returnTo: '/reports/ledger' } });
  };
  const [searchParams] = useSearchParams();
  const [printPreviewHtml, setPrintPreviewHtml] = useState<string | null>(null);
  const printIframeRef = useRef<HTMLIFrameElement>(null);

  const handlePrint = () => {
    let reportHtml = '';
    const totalDebit = reportData.reduce((sum, row) => sum + Number(row.debit || 0), 0);
    const totalCredit = reportData.reduce((sum, row) => sum + Number(row.credit || 0), 0);
    reportHtml = `
      <html>
        <head>
          <title>Ledger Report - ${selectedCompany?.name}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
            .period { text-align: center; margin-bottom: 20px; font-weight: bold; }
            .ledger { width: 100%; border-collapse: collapse; }
            .ledger th, .ledger td { border: 1px solid #000; padding: 6px; text-align: left; }
            .ledger th { background-color: #f0f0f0; font-weight: bold; }
            .total-row { font-weight: bold; background-color: #f0f0f0; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${selectedCompany?.name}</h1>
            <h2>LEDGER REPORT</h2>
            <div>${ledgerInfo?.name ? `Ledger: ${ledgerInfo.name}` : ''}</div>
          </div>
          <div class="period">
            Period: ${dateFrom} to ${dateTo}
          </div>
          <table class="ledger">
            <thead>
              <tr>
                  <th>Date</th>
                  <th>Particulars</th>
                  <th>Voucher Type</th>
                  <th>Vch No.</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th>Running Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colspan="4" class="text-right"><strong>Opening Balance :</strong></td>
                  <td class="text-right">${openingBalance < 0 ? `${currencySymbol} ${formatAmount(Math.abs(openingBalance))}` : ''}</td>
                  <td class="text-right">${openingBalance > 0 ? `${currencySymbol} ${formatAmount(Math.abs(openingBalance))}` : ''}</td>
                  <td></td>
                </tr>
                ${reportData.map(row => `
                  <tr>
                    <td>${row.date}</td>
                    <td>${row.particulars}</td>
                    <td>${row.voucherTypeName || row.voucherType || '-'}</td>
                    <td>${row.voucherNumber || '-'}</td>
                    <td class="text-right">${row.debit > 0 ? `${currencySymbol} ${formatAmount(Number(row.debit))}` : ''}</td>
                    <td class="text-right">${row.credit > 0 ? `${currencySymbol} ${formatAmount(Number(row.credit))}` : ''}</td>
                    <td class="text-right">${formatSignedBalance(Number(row.balance || 0))}</td>
                  </tr>
                `).join('')}
                <tr class="total-row">
                  <td colspan="4"><strong>Current Total :</strong></td>
                  <td class="text-right"><strong>${currencySymbol} ${formatAmount(runningDebitTotal)}</strong></td>
                  <td class="text-right"><strong>${currencySymbol} ${formatAmount(runningCreditTotal)}</strong></td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </body>
        </html>
      `;
      setPrintPreviewHtml(reportHtml);
    };
  const { selectedCompany, periodFrom, periodTo } = useCompany();
  const { toast } = useToast();
  const currencySymbol = selectedCompany?.currency === 'INR' ? '₹' : selectedCompany?.currency === 'USD' ? '$' : selectedCompany?.currency || '₹';
  const queryLedgerId = searchParams.get('ledgerId') || '';
  const queryGroupId = searchParams.get('groupId') || '';
  const queryDateFrom = searchParams.get('dateFrom') || '';
  const queryDateTo = searchParams.get('dateTo') || '';
  
  const [dateFrom, setDateFrom] = useState(() => queryDateFrom || periodFrom);
  const [dateTo, setDateTo] = useState(() => queryDateTo || periodTo);

  // Sync with global period when it changes (unless URL param override)
  useEffect(() => { if (!queryDateFrom) setDateFrom(periodFrom); }, [periodFrom]);
  useEffect(() => { if (!queryDateTo) setDateTo(periodTo); }, [periodTo]);
  
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
    if (selectedLedger && dateFrom && dateTo) {
      fetchLedgerReport();
    }
  }, [selectedLedger, dateFrom, dateTo]);

  const fetchLedgers = async () => {
    try {
      const params = new URLSearchParams({
        companyId: selectedCompany?.id || '',
      });
      const resp = await fetch(`${API_BASE_URL}/ledgers?${params}`);
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

  // Utility copied from backend for safe number conversion
  function toFiniteNumber(value: any, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

const fetchLedgerReport = async () => {
  try {
    const params = new URLSearchParams({
      companyId: selectedCompany?.id || '',
      ledgerId: selectedLedger,
      dateFrom,
      dateTo,
    });

    const resp = await fetch(`${API_BASE_URL}/ledgers/report/ledger?${params}`);
    if (!resp.ok) throw new Error('Failed to fetch ledger report data');

    const json = await resp.json();
    const ledgerData = json?.data?.ledger || null;

    // ✅ IMPORTANT: DO NOT TOUCH is_pos here
    const rows = Array.isArray(json?.data?.transactions)
      ? json.data.transactions.map(row => ({
          ...row,
          // ❌ DO NOT normalize here
          // just pass raw value
          is_pos: row?.is_pos
        }))
      : [];

    const openingSigned = toFiniteNumber(json?.data?.opening || 0);

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
      const resp = await fetch(`${API_BASE_URL}/vouchers/${voucherId}`, {
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
            <Button variant="outline" onClick={handlePrint}>
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

      {/* ── Print Preview Modal ── */}
      {printPreviewHtml && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) setPrintPreviewHtml(null); }}
        >
          <div className="flex items-center justify-between bg-white px-4 py-2 border-b shadow-sm">
            <span className="font-semibold text-sm">Print Preview</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  const ifw = printIframeRef.current?.contentWindow;
                  if (ifw) { ifw.focus(); ifw.print(); }
                }}
              >
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPrintPreviewHtml(null)}>
                Close
              </Button>
            </div>
          </div>
          <iframe
            ref={printIframeRef}
            srcDoc={printPreviewHtml}
            className="flex-1 w-full bg-white"
            title="Print Preview"
          />
        </div>
      )}
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
            {/* ── Voucher View Modal ── */}
            {viewVoucher && (
            <VoucherViewModal open={!!viewVoucher} onOpenChange={(open) =>{if (!open) {
              setViewVoucher(null);
              (document.activeElement as HTMLElement)?.blur();} }}>
              <div className="px-6 pt-4 pb-2 border-b flex items-center justify-between">
                <span className="font-semibold text-lg">{viewVoucher.voucherTypeName || voucherTypeName || viewVoucher.voucherType}</span>
                <Button size="sm" variant="outline" onClick={() => setViewVoucher(null)}>Close</Button>
              </div>
              {viewVoucher.isPOS ? (
              <POSViewForm voucherId={viewVoucher.voucherId} onClose={() => setViewVoucher(null)} />
              ) : viewVoucher.isInventory ? (
              <InventoryVchViewForm
                voucherId={viewVoucher.voucherId}
                voucherTypeId={viewVoucher.voucherTypeId}
                voucherType={viewVoucher.voucherType as 'sales' | 'credit-note' | 'purchase' | 'debit-note'}
                onClose={() => setViewVoucher(null)}
              />
              ) : (
              <AccountingVchViewForm voucherId={viewVoucher.voucherId} voucherTypeId={viewVoucher.voucherTypeId} onClose={() => setViewVoucher(null)} />
              )}
              </VoucherViewModal>
              )}
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
                      <TableCell>{row.voucherTypeName || row.voucherType || '-'}</TableCell>
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
                            onClick={() => (handleViewVoucher(row))}
                            disabled={!row?.voucherId}
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditVoucher(row)}
                            disabled={!row?.voucherId}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {/* Print button removed from per-row actions */}
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