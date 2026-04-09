import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SearchableDropdown from '@/components/ui/searchable-dropdown';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Plus, Trash2, Printer, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';
import BillAllocationDialog from '@/components/BillAllocationDialog';
import QuickCreateLedgerDialog from '@/components/QuickCreateLedgerDialog';
import { API_BASE_URL } from '@/config/runtime';
import type { VoucherTypeMeta } from './VoucherForm';
import { isCompanyBillsEnabled } from '@/lib/companyTax';

const API_HOST_URL = API_BASE_URL.replace(/\/api$/, '');

interface BillAllocation {
  invoice_voucher_id: string;
  voucher_number: string;
  allocated_amount: number;
}

interface AccountingLedgerEntry {
  id: string;
  ledger_id: string;
  amount: number;
  billAllocations: BillAllocation[];
}

interface AccountingFormProps {
  voucherType?: 'payment' | 'receipt';
  voucherTypeMeta?: VoucherTypeMeta;
}

const AccountingForm = ({ voucherType = 'payment', voucherTypeMeta }: AccountingFormProps) => {
  const isPayment = voucherType !== 'receipt';
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo;
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const billsEnabled = isCompanyBillsEnabled(selectedCompany);
  const [loading, setLoading] = useState(false);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [savedVoucher, setSavedVoucher] = useState<any>(null);

  const [formData, setFormData] = useState({
    cash_bank_ledger_id: '',
    voucher_number: '',
    voucher_date: new Date().toISOString().split('T')[0],
    reference_number: '',
    reference_date: '',
    narration: ''
  });

  const currencySymbol =
    selectedCompany?.currency === 'INR' ? '₹' :
    selectedCompany?.currency === 'USD' ? '$' :
    selectedCompany?.currency || '₹';

  const [ledgerEntries, setLedgerEntries] = useState<AccountingLedgerEntry[]>([{
    id: '1',
    ledger_id: '',
    amount: 0,
    billAllocations: []
  }]);

  const [billDialogOpen, setBillDialogOpen] = useState(false);
  const [selectedEntryForBills, setSelectedEntryForBills] = useState<AccountingLedgerEntry | null>(null);
  const [quickCreateLedgerOpen, setQuickCreateLedgerOpen] = useState(false);
  const [quickCreateLedgerDefaultGroup, setQuickCreateLedgerDefaultGroup] = useState<string | undefined>(undefined);

  const parseApiResponse = async (response: Response) => {
    const rawText = await response.text();
    try {
      return JSON.parse(rawText);
    } catch {
      throw new Error(`Invalid server response (${response.status}): ${rawText.slice(0, 180)}`);
    }
  };

  useEffect(() => {
    if (selectedCompany) {
      fetchInitialData();
      const searchParams = new URLSearchParams(location.search);
      const editVoucherId = searchParams.get('edit');
      if (editVoucherId) {
        loadVoucherData(editVoucherId);
      } else {
        generateVoucherNumber();
      }
    }
  }, [selectedCompany, location.search]);

  const loadVoucherData = async (voucherId: string) => {
    if (!selectedCompany) return;
    try {
      const resp = await fetch(`${API_HOST_URL}/api/vouchers/${voucherId}`);
      const json = await parseApiResponse(resp);
      if (!json.success) {
        toast({ title: 'Error', description: 'Voucher not found', variant: 'destructive' });
        return;
      }
      const voucher = json.data;
      const details = Array.isArray(voucher.details) ? voucher.details : [];

      // Payment: cash/bank is credited, party is debited
      // Receipt: cash/bank is debited, party is credited
      const cashDetail = isPayment
        ? details.find((d: any) => Number(d.credit_amount || 0) > 0)
        : details.find((d: any) => Number(d.debit_amount || 0) > 0);
      const partyDetails = isPayment
        ? details.filter((d: any) => Number(d.debit_amount || 0) > 0)
        : details.filter((d: any) => Number(d.credit_amount || 0) > 0);

      const entries: AccountingLedgerEntry[] = partyDetails.map((detail: any, index: number) => {
        const entryAllocations = (Array.isArray(detail.billallocation) ? detail.billallocation : [])
          .map((a: any) => ({
            invoice_voucher_id: a.invoice_voucher_id || a.bill_id || a.id,
            voucher_number: a.bill_reference || a.voucher_number || '',
            allocated_amount: Number(a.amount || a.allocated_amount || 0),
          }))
          .filter((a: any) => a.invoice_voucher_id && a.allocated_amount > 0);

        return {
          id: (index + 1).toString(),
          ledger_id: detail.ledger_id || '',
          amount: Number(detail.amount) || 0,
          billAllocations: entryAllocations
        };
      });

      setFormData({
        cash_bank_ledger_id: cashDetail?.ledger_id || '',
        voucher_number: voucher.voucher_number,
        voucher_date: voucher.voucher_date,
        reference_number: voucher.reference_number || '',
        reference_date: voucher.reference_date || '',
        narration: voucher.narration || ''
      });

      if (entries.length > 0) setLedgerEntries(entries);
      setSavedVoucher(voucher);
    } catch (error) {
      console.error('Error loading voucher data:', error);
      toast({ title: 'Error', description: 'Failed to load voucher data', variant: 'destructive' });
    }
  };

  const generateVoucherNumber = async () => {
    if (!selectedCompany) return;
    try {
      const defaultPrefix = isPayment ? 'PAY' : 'REC';
      const settingPrefix = isPayment ? 'payment_prefix' : 'receipt_prefix';
      const settingNumber = isPayment ? 'payment_starting_number' : 'receipt_starting_number';

      let prefix = defaultPrefix;
      let suffix = '';
      let startingNumber = 1;

      if (voucherTypeMeta) {
        prefix = voucherTypeMeta.prefix || defaultPrefix;
        suffix = voucherTypeMeta.suffix || '';
        startingNumber = voucherTypeMeta.starting_number || 1;
      } else {
        const keys = encodeURIComponent(`${settingPrefix},${settingNumber}`);
        const settingsResp = await fetch(`${API_HOST_URL}/api/settings?companyId=${selectedCompany.id}&keys=${keys}`);
        const settingsJson = await settingsResp.json();
        if (settingsJson?.success) {
          const settingsData = settingsJson.data || [];
          const prefixSetting = settingsData.find((s: any) => s.setting_key === settingPrefix);
          const numberSetting = settingsData.find((s: any) => s.setting_key === settingNumber);
          if (prefixSetting) prefix = String(prefixSetting.setting_value || defaultPrefix);
          if (numberSetting) startingNumber = parseInt(String(numberSetting.setting_value || '1'));
        }
      }

      const vouchersResp = await fetch(`${API_HOST_URL}/api/vouchers?companyId=${selectedCompany.id}`);
      const vouchersJson = await vouchersResp.json();
      let nextNumber = startingNumber;
      if (vouchersJson?.success) {
        const allVouchers = vouchersJson.data || [];
        // Filter by voucher_type_id when available (more accurate); fall back to base type
        const filtered = voucherTypeMeta?.id
          ? allVouchers.filter((v: any) => v.voucher_type_id === voucherTypeMeta.id)
          : allVouchers.filter((v: any) => v.voucher_type === voucherType);
        filtered.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        if (filtered.length > 0) {
          const lastVoucher = filtered[0];
          let stripped = String(lastVoucher.voucher_number || '');
          if (prefix && stripped.startsWith(prefix)) stripped = stripped.slice(prefix.length);
          if (suffix && stripped.endsWith(suffix)) stripped = stripped.slice(0, stripped.length - suffix.length);
          const parsed = parseInt(stripped);
          if (!isNaN(parsed)) nextNumber = Math.max(startingNumber, parsed + 1);
        }
      }

      setFormData(prev => ({ ...prev, voucher_number: `${prefix}${nextNumber.toString().padStart(4, '0')}${suffix}` }));
    } catch (error) {
      console.error('Error generating voucher number:', error);
    }
  };

  const fetchInitialData = async () => {
    if (!selectedCompany) return;
    try {
      const ledgersRes = await fetch(`${API_HOST_URL}/api/ledgers?companyId=${selectedCompany.id}`);
      const ledgersJson = await ledgersRes.json();
      if (ledgersJson?.success) {
        setLedgers((ledgersJson.data || []).map((ledger: any) => ({
          ...ledger,
          group_name: ledger.ledger_groups?.name || 'Unknown'
        })));
      }
    } catch (error) {
      console.error('Error fetching ledgers:', error);
    }
  };

  const handleLedgerChange = (entryId: string, ledgerId: string) => {
    setLedgerEntries(prev => prev.map(entry =>
      entry.id === entryId ? { ...entry, ledger_id: ledgerId, billAllocations: [] } : entry
    ));
  };

  const isBillwiseLedger = (ledgerId: string) => {
    const ledger = ledgers.find((l) => l.id === ledgerId);
    return ledger?.is_billwise === true || ledger?.is_billwise === 'yes' || ledger?.is_billwise === 1;
  };

  const openBillAllocation = (entry: AccountingLedgerEntry) => {
    if (!entry.ledger_id) {
      toast({ title: 'Error', description: 'Please select a ledger first', variant: 'destructive' });
      return;
    }
    if (!isBillwiseLedger(entry.ledger_id)) {
      toast({ title: 'Error', description: 'Bill-wise is not enabled for selected ledger', variant: 'destructive' });
      return;
    }
    setSelectedEntryForBills(entry);
    setBillDialogOpen(true);
  };

  const handleBillAllocationSave = (allocations: BillAllocation[]) => {
    if (!selectedEntryForBills) return;
    const allocatedTotal = allocations.reduce((sum, a) => sum + Number(a.allocated_amount || 0), 0);
    setLedgerEntries(prev => prev.map(entry =>
      entry.id === selectedEntryForBills.id
        ? { ...entry, billAllocations: allocations, amount: allocatedTotal }
        : entry
    ));
  };

  const handleAmountChange = (entryId: string, amount: number) => {
    setLedgerEntries(prev => prev.map(entry =>
      entry.id === entryId ? { ...entry, amount } : entry
    ));
  };

  const addLedgerEntry = () => {
    const newId = (Math.max(...ledgerEntries.map(e => parseInt(e.id)), 0) + 1).toString();
    setLedgerEntries([...ledgerEntries, { id: newId, ledger_id: '', amount: 0, billAllocations: [] }]);
  };

  const removeLedgerEntry = (entryId: string) => {
    if (ledgerEntries.length > 1) {
      setLedgerEntries(ledgerEntries.filter(entry => entry.id !== entryId));
    }
  };

  const getTotalAmount = () => ledgerEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);

  const numberToWords = (num: number): string => `${num.toFixed(2)} Only`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    if (!formData.cash_bank_ledger_id) {
      toast({
        title: 'Validation Error',
        description: `Please select ${isPayment ? 'Pay From' : 'Received In'} account`,
        variant: 'destructive',
      });
      return;
    }

    const validEntries = ledgerEntries.filter(e => e.ledger_id && e.amount > 0);
    if (validEntries.length === 0) {
      toast({
        title: 'Validation Error',
        description: `Please add at least one ${isPayment ? 'payment' : 'receipt'} entry with ledger and amount`,
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const totalAmount = getTotalAmount();
      const searchParams = new URLSearchParams(location.search);
      const editVoucherId = searchParams.get('edit');

      const { cash_bank_ledger_id: _cb, ...voucherForm } = formData;
      const voucherPayload = {
        ...voucherForm,
        reference_date: voucherForm.reference_date || null,
        company_id: selectedCompany.id,
        voucher_type: voucherType as 'payment' | 'receipt',
        voucher_type_id: voucherTypeMeta?.id || undefined,
        is_pos: voucherTypeMeta?.is_pos || false,
        ledger_id: ledgerEntries[0]?.ledger_id || '',
        total_amount: totalAmount,
        tax_amount: 0,
        net_amount: totalAmount
      };

      const voucherDetails = ledgerEntries.filter(e => e.ledger_id && e.amount > 0).map(entry => ({
        ledger_id: entry.ledger_id,
        amount: entry.amount,
        billallocation: entry.billAllocations.filter(a => a.allocated_amount > 0).map(a => ({
          id: a.invoice_voucher_id,
          invoice_voucher_id: a.invoice_voucher_id,
          bill_reference: a.voucher_number || '',
          bill_type: 'Against Ref',
          amount: a.allocated_amount,
          bill_date: formData.voucher_date,
        })),
      }));

      // Build ledger entries: cash/bank side and party side (directions reversed by isPayment)
      const allLedgerEntries: any[] = [];

      // Cash/Bank account
      allLedgerEntries.push({
        ledger_id: formData.cash_bank_ledger_id,
        transaction_date: formData.voucher_date,
        debit_amount: isPayment ? 0 : totalAmount,
        credit_amount: isPayment ? totalAmount : 0,
        isDeemedPositive: isPayment ? 'no' : 'yes',
        narration: formData.narration || (isPayment ? 'Payment' : 'Receipt')
      });

      // Party accounts
      ledgerEntries.filter(e => e.ledger_id && e.amount > 0).forEach(entry => {
        allLedgerEntries.push({
          ledger_id: entry.ledger_id,
          transaction_date: formData.voucher_date,
          debit_amount: isPayment ? entry.amount : 0,
          credit_amount: isPayment ? 0 : entry.amount,
          isDeemedPositive: isPayment ? 'yes' : 'no',
          narration: formData.narration || `${isPayment ? 'Payment' : 'Receipt'} via ${ledgers.find(l => l.id === formData.cash_bank_ledger_id)?.name || ''}`,
          billallocation: entry.billAllocations.filter(a => a.allocated_amount > 0).map(a => ({
            id: a.invoice_voucher_id,
            invoice_voucher_id: a.invoice_voucher_id,
            bill_reference: a.voucher_number || '',
            bill_type: 'Against Ref',
            amount: a.allocated_amount,
            bill_date: formData.voucher_date,
          }))
        });
      });

      const fullPayload = {
        ...voucherPayload,
        details: voucherDetails,
        ledger_entries: allLedgerEntries
      };

      let resp;
      if (editVoucherId) {
        resp = await fetch(`${API_HOST_URL}/api/vouchers/${editVoucherId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fullPayload)
        });
      } else {
        resp = await fetch(`${API_HOST_URL}/api/vouchers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fullPayload)
        });
      }

      const respJson = await parseApiResponse(resp);
      if (!respJson?.success) throw new Error(respJson?.message || 'Failed to save voucher');
      const voucher = respJson.data;

      setSavedVoucher(voucher);
      toast({
        title: 'Success',
        description: editVoucherId
          ? `${isPayment ? 'Payment' : 'Receipt'} updated successfully!`
          : `${isPayment ? 'Payment' : 'Receipt'} created successfully!`
      });

      if (voucherTypeMeta?.print_after_save) {
        setTimeout(() => handlePrint(voucher), 500);
      }

      if (returnTo) {
        navigate(returnTo);
      } else if (editVoucherId) {
        if (window.history.length > 1) navigate(-1); else navigate('/dashboard');
      } else {
        setFormData({
          cash_bank_ledger_id: '',
          voucher_number: '',
          voucher_date: new Date().toISOString().split('T')[0],
          reference_number: '',
          reference_date: '',
          narration: ''
        });
        setLedgerEntries([{ id: '1', ledger_id: '', amount: 0, billAllocations: [] }]);
        await generateVoucherNumber();
      }
    } catch (error) {
      console.error('Error saving:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : `Failed to save ${isPayment ? 'payment' : 'receipt'}`,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = (voucherData?: any) => {
    const voucher = voucherData || savedVoucher;
    if (!voucher) {
      toast({ title: 'Error', description: 'Please save the voucher first', variant: 'destructive' });
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const totalNet = getTotalAmount();

    const defaultTitle = isPayment ? 'Payment Voucher' : 'Receipt Voucher';
    const printTitle = (voucherTypeMeta?.print_title?.trim()) || defaultTitle;

    const cashBankLedger = ledgers.find(l => l.id === formData.cash_bank_ledger_id);
    const cashBankName = cashBankLedger?.name || '';

    // Full number-to-words
    const numberToWordsFull = (value: number): string => {
      const ones = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
      const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
      const integerToWords = (num: number): string => {
        if (num < 20) return ones[num];
        if (num < 100) return `${tens[Math.floor(num / 10)]}${num % 10 ? ' ' + ones[num % 10] : ''}`;
        if (num < 1000) return `${ones[Math.floor(num / 100)]} Hundred${num % 100 ? ' ' + integerToWords(num % 100) : ''}`;
        if (num < 100000) return `${integerToWords(Math.floor(num / 1000))} Thousand${num % 1000 ? ' ' + integerToWords(num % 1000) : ''}`;
        if (num < 10000000) return `${integerToWords(Math.floor(num / 100000))} Lakh${num % 100000 ? ' ' + integerToWords(num % 100000) : ''}`;
        return `${integerToWords(Math.floor(num / 10000000))} Crore${num % 10000000 ? ' ' + integerToWords(num % 10000000) : ''}`;
      };
      const abs = Math.abs(Number(value) || 0);
      const rupees = Math.floor(abs);
      const paise = Math.round((abs - rupees) * 100);
      return `${value < 0 ? 'Minus ' : ''}${rupees === 0 ? 'Zero' : integerToWords(rupees)} Rupees${paise > 0 ? ' and ' + integerToWords(paise) + ' Paise' : ''} Only`;
    };

    const formatAmt = (val: number) => {
      const abs = Math.abs(Number(val || 0));
      const formatted = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return Number(val) < 0 ? `-${formatted}` : formatted;
    };

    const partyRows = ledgerEntries
      .filter(e => e.ledger_id && e.amount > 0)
      .map(e => {
        const name = ledgers.find(l => l.id === e.ledger_id)?.name || '';
        return `<tr>
          <td class="desc">${name}</td>
          <td class="amt">${formatAmt(e.amount)}</td>
        </tr>`;
      }).join('');

    printWindow.document.write(`
      <html><head>
        <title>${printTitle} - ${voucher.voucher_number}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; font-size: 12px; color: #000; padding: 20px; }
          .company-name { font-size: 16px; font-weight: 700; }
          .company-sub  { font-size: 11px; }
          .divider { border-top: 1px solid #000; margin: 6px 0; }
          .title-row { display: flex; justify-content: space-between; align-items: center; margin: 8px 0 4px; }
          .print-title { font-size: 15px; font-weight: 700; text-decoration: underline; }
          .no-date { font-size: 12px; }
          table.main { width: 100%; border-collapse: collapse; margin-top: 4px; }
          table.main th, table.main td { border: 1px solid #000; padding: 4px 6px; }
          table.main th { font-size: 12px; font-weight: 600; }
          .desc { width: 75%; }
          .amt  { width: 25%; text-align: right; white-space: nowrap; }
          .section-label { font-weight: 700; font-size: 11px; padding: 3px 6px; border: 1px solid #000; border-bottom: none; background: #f5f5f5; }
          .through-row td { font-style: italic; }
          .words-row td { font-weight: 700; border-top: none; }
          .total-row td { font-weight: 700; font-size: 13px; border-top: 2px solid #000; }
          .sign-area { margin-top: 30px; text-align: right; font-size: 12px; }
          .footer-row { display: flex; justify-content: space-between; margin-top: 40px; font-size: 11px; border-top: 1px solid #000; padding-top: 6px; }
          .footer-col { width: 33%; }
        </style>
      </head><body>
        <div class="company-name">${selectedCompany?.name || ''}</div>
        <div class="company-sub">State Name : ${(selectedCompany as any)?.state || ''}, Code : ${(selectedCompany as any)?.state_code || ''}</div>
        <div class="company-sub">E-Mail : ${(selectedCompany as any)?.email || ''}</div>
        <div class="divider"></div>

        <div class="title-row">
          <span class="print-title">${printTitle}</span>
          <span class="no-date">No. : &nbsp;${voucher.voucher_number}&nbsp;&nbsp;&nbsp;&nbsp;Dated : &nbsp;${voucher.voucher_date}</span>
        </div>

        <table class="main">
          <thead>
            <tr>
              <th class="desc">Particulars</th>
              <th class="amt">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr><td class="desc" colspan="2" style="padding:2px 6px;font-weight:700">Account:</td></tr>
            ${partyRows}
            <tr class="through-row">
              <td class="desc" style="font-weight:700">Through:</td>
              <td class="amt"></td>
            </tr>
            <tr class="through-row">
              <td class="desc" style="padding-left:12px">${cashBankName}</td>
              <td class="amt"></td>
            </tr>
            <tr class="words-row">
              <td class="desc" colspan="2">Amount (in words)<br/><strong>INR ${numberToWordsFull(totalNet)}</strong></td>
            </tr>
            <tr class="total-row">
              <td class="desc" style="text-align:right">&#8377;</td>
              <td class="amt">${formatAmt(totalNet)}</td>
            </tr>
          </tbody>
        </table>

        <div class="sign-area">Authorised Signatory</div>

        <div class="footer-row">
          <div class="footer-col">Prepared by</div>
          <div class="footer-col" style="text-align:center">Checked by</div>
          <div class="footer-col" style="text-align:right">Verified by</div>
        </div>
      </body></html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { try { printWindow.print(); } catch {} }, 100);
  };

  const handleLedgerCreated = (ledger: { id: string; name: string; group_name: string; tax_type?: string }) => {
    const newEntry = { ...ledger, tax_type: ledger.tax_type || '', ledger_groups: { name: ledger.group_name } };
    setLedgers(prev => [...prev, newEntry]);
  };

  const voucherTitle = isPayment ? 'Payment Entry' : 'Receipt Entry';
  const cardTitle = isPayment ? 'Payment Details' : 'Receipt Details';
  const cashBankLabel = isPayment ? 'Pay From' : 'Receive Into';
  const partyLabel = isPayment ? 'Payment To (Ledgers)' : 'Receipt From (Ledgers)';
  const partyRowLabel = isPayment ? 'Paid To' : 'Received From';
  const totalLabel = isPayment ? 'Total Payment Amount:' : 'Total Receipt Amount:';

  return (
    <div className="bg-background h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 bg-background border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/dashboard'); }}
              className="mr-4"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">{voucherTitle}</h1>
          </div>
          {savedVoucher && (
            <Button onClick={() => handlePrint()} variant="outline">
              <Printer className="h-4 w-4 mr-2" />
              Print Voucher
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{cardTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Company</Label>
                  <Input value={selectedCompany?.name || ''} readOnly className="bg-muted" />
                </div>

                <div>
                  <Label>{cashBankLabel}</Label>
                  <div className="flex gap-2">
                    <SearchableDropdown
                      value={formData.cash_bank_ledger_id}
                      onValueChange={(value) => setFormData({ ...formData, cash_bank_ledger_id: value })}
                      placeholder="Select Account"
                      options={ledgers.map((ledger) => ({
                        value: ledger.id,
                        label: `${ledger.name} (${ledger.ledger_groups?.name})`,
                      }))}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setQuickCreateLedgerDefaultGroup(undefined); setQuickCreateLedgerOpen(true); }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <Label>Voucher Number</Label>
                  <Input
                    value={formData.voucher_number}
                    readOnly
                    className="bg-muted cursor-not-allowed"
                    placeholder="Auto-generated"
                  />
                </div>

                <div>
                  <Label>{isPayment ? 'Payment Date' : 'Receipt Date'}</Label>
                  <Input
                    type="date"
                    value={formData.voucher_date}
                    onChange={(e) => setFormData({ ...formData, voucher_date: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <Label>Reference Number</Label>
                  <Input
                    value={formData.reference_number}
                    onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                    placeholder="Enter reference number"
                  />
                </div>

                <div>
                  <Label>Reference Date</Label>
                  <Input
                    type="date"
                    value={formData.reference_date}
                    onChange={(e) => setFormData({ ...formData, reference_date: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>Narration</Label>
                <Textarea
                  value={formData.narration}
                  onChange={(e) => setFormData({ ...formData, narration: e.target.value })}
                  placeholder="Enter description"
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          {/* Ledger Entries Section */}
          <Card>
            <CardHeader>
              <CardTitle>{partyLabel}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ledgerEntries.map((entry) => (
                <div key={entry.id} className="space-y-4 p-4 border rounded">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>{partyRowLabel}</Label>
                        <div className="flex gap-2">
                          <SearchableDropdown
                            value={entry.ledger_id}
                            onValueChange={(value) => handleLedgerChange(entry.id, value)}
                            placeholder="Select Ledger"
                            options={ledgers.map((ledger) => ({
                              value: ledger.id,
                              label: `${ledger.name} (${ledger.ledger_groups?.name})`,
                            }))}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => { setQuickCreateLedgerDefaultGroup(undefined); setQuickCreateLedgerOpen(true); }}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div>
                        <Label>Amount</Label>
                        <Input
                          type="number"
                          value={entry.amount}
                          onChange={(e) => handleAmountChange(entry.id, parseFloat(e.target.value) || 0)}
                          placeholder="Enter amount"
                          min="0"
                          step="0.01"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLedgerEntry(entry.id)}
                      disabled={ledgerEntries.length === 1}
                      className="mt-8"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-4 space-y-2">
                    {billsEnabled && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openBillAllocation(entry)}
                          disabled={!entry.ledger_id || !isBillwiseLedger(entry.ledger_id)}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Allocate Bills ({entry.billAllocations.length})
                        </Button>
                        {entry.billAllocations.length > 0 && (
                          <div className="text-sm text-muted-foreground">
                            Allocated: {currencySymbol} {entry.billAllocations.reduce((sum, a) => sum + a.allocated_amount, 0).toFixed(2)} across {entry.billAllocations.length} bill(s)
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}

              <Button type="button" onClick={addLedgerEntry} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Another Ledger
              </Button>

              <div className="pt-4 border-t">
                <div className="flex justify-between items-center">
                  <Label className="text-lg">{totalLabel}</Label>
                  <span className="text-lg font-bold">{currencySymbol} {getTotalAmount().toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end space-x-4">
            <Button type="button" variant="outline" onClick={() => navigate('/dashboard')}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !formData.cash_bank_ledger_id || ledgerEntries.every(e => !e.ledger_id || e.amount === 0)}
            >
              {loading ? 'Saving...' : `Save ${isPayment ? 'Payment' : 'Receipt'}`}
            </Button>
          </div>
        </form>

        {selectedEntryForBills && (
          <BillAllocationDialog
            open={billDialogOpen}
            onClose={() => { setBillDialogOpen(false); setSelectedEntryForBills(null); }}
            ledgerId={selectedEntryForBills.ledger_id}
            ledgerName={ledgers.find(l => l.id === selectedEntryForBills.ledger_id)?.name || ''}
            maxAmount={selectedEntryForBills.amount}
            voucherType={voucherType}
            existingAllocations={selectedEntryForBills.billAllocations}
            onSave={handleBillAllocationSave}
          />
        )}

        <QuickCreateLedgerDialog
          open={quickCreateLedgerOpen}
          onClose={() => setQuickCreateLedgerOpen(false)}
          onCreated={handleLedgerCreated}
          defaultGroupName={quickCreateLedgerDefaultGroup}
        />
        </div>
      </div>
    </div>
  );
};

export default AccountingForm;
