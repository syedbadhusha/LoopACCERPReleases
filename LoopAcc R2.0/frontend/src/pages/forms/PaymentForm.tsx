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
import { API_BASE_URL } from '@/config/runtime';

const API_HOST_URL = API_BASE_URL.replace(/\/api$/, '');

interface BillAllocation {
  invoice_voucher_id: string;
  voucher_number: string;
  allocated_amount: number;
}

interface PaymentLedgerEntry {
  id: string;
  ledger_id: string;
  amount: number;
  billAllocations: BillAllocation[];
}

const PaymentForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo;
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
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
  const currencySymbol = selectedCompany?.currency === 'INR' ? '₹' : selectedCompany?.currency === 'USD' ? '$' : selectedCompany?.currency || '₹';
  const [ledgerEntries, setLedgerEntries] = useState<PaymentLedgerEntry[]>([{
    id: '1',
    ledger_id: '',
    amount: 0,
    billAllocations: []
  }]);

  const [billDialogOpen, setBillDialogOpen] = useState(false);
  const [selectedEntryForBills, setSelectedEntryForBills] = useState<PaymentLedgerEntry | null>(null);

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

      // Build ledger entries from details and ledger-level billallocation.
      // Payment edit shape contains both the cash/bank credit line and party debit lines in details.
      const details = Array.isArray(voucher.details) ? voucher.details : [];
      const cashDetail = details.find((detail: any) => Number(detail.credit_amount || 0) > 0);
      const partyDetails = details.filter((detail: any) => Number(detail.debit_amount || 0) > 0);

      const entries: PaymentLedgerEntry[] = partyDetails.map((detail: any, index: number) => {
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
      const keys = encodeURIComponent('payment_prefix,payment_starting_number');
      const settingsResp = await fetch(`http://localhost:5000/api/settings?companyId=${selectedCompany.id}&keys=${keys}`);
      const settingsJson = await settingsResp.json();
      let prefix = 'PAY';
      let startingNumber = 1;
      if (settingsJson && settingsJson.success) {
        const settingsData = settingsJson.data || [];
        const prefixSetting = settingsData.find((s: any) => s.setting_key === 'payment_prefix');
        const numberSetting = settingsData.find((s: any) => s.setting_key === 'payment_starting_number');
        if (prefixSetting) prefix = String(prefixSetting.setting_value || 'PAY');
        if (numberSetting) startingNumber = parseInt(String(numberSetting.setting_value || '1'));
      }

      // Fetch last voucher of type payment
      const vouchersResp = await fetch(`http://localhost:5000/api/vouchers?companyId=${selectedCompany.id}`);
      const vouchersJson = await vouchersResp.json();
      let nextNumber = startingNumber;
      if (vouchersJson && vouchersJson.success) {
        const paymentVouchers = (vouchersJson.data || []).filter((v: any) => v.voucher_type === 'payment');
        paymentVouchers.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        if (paymentVouchers.length > 0) {
          const lastVoucher = paymentVouchers[0];
          const lastNumber = String(lastVoucher.voucher_number || '').replace(prefix, '');
          const parsed = parseInt(lastNumber) || startingNumber;
          nextNumber = parsed + 1;
        }
      }

      setFormData(prev => ({ ...prev, voucher_number: `${prefix}${nextNumber.toString().padStart(4, '0')}` }));
    } catch (error) {
      console.error('Error generating voucher number:', error);
    }
  };

  const fetchInitialData = async () => {
    if (!selectedCompany) return;
    try {
      const ledgersRes = await fetch(`http://localhost:5000/api/ledgers?companyId=${selectedCompany.id}`);
      
      const ledgersJson = await ledgersRes.json();

      if (ledgersJson && ledgersJson.success) {
        // Backend already provides ledger_groups via aggregation
        const ledgersWithGroupNames = (ledgersJson.data || []).map((ledger: any) => ({
          ...ledger,
          group_name: ledger.ledger_groups?.name || 'Unknown'
        }));
        setLedgers(ledgersWithGroupNames);
      }
    } catch (error) {
      console.error('Error fetching ledgers:', error);
    }
  };

  const handleLedgerChange = (entryId: string, ledgerId: string) => {
    setLedgerEntries(prev => prev.map(entry => 
      entry.id === entryId 
        ? { ...entry, ledger_id: ledgerId, billAllocations: [] }
        : entry
    ));
  };

  const isBillwiseLedger = (ledgerId: string) => {
    const ledger = ledgers.find((l) => l.id === ledgerId);
    return (
      ledger?.is_billwise === true ||
      ledger?.is_billwise === 'yes' ||
      ledger?.is_billwise === 1
    );
  };

  const openBillAllocation = (entry: PaymentLedgerEntry) => {
    if (!entry.ledger_id) {
      toast({
        title: 'Error',
        description: 'Please select a ledger first',
        variant: 'destructive',
      });
      return;
    }
    if (!isBillwiseLedger(entry.ledger_id)) {
      toast({
        title: 'Error',
        description: 'Bill-wise is not enabled for selected ledger',
        variant: 'destructive',
      });
      return;
    }
    setSelectedEntryForBills(entry);
    setBillDialogOpen(true);
  };

  const handleBillAllocationSave = (allocations: BillAllocation[]) => {
    if (!selectedEntryForBills) return;
    const allocatedTotal = allocations.reduce((sum, allocation) => sum + Number(allocation.allocated_amount || 0), 0);
    
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
    setLedgerEntries([...ledgerEntries, {
      id: newId,
      ledger_id: '',
      amount: 0,
      billAllocations: []
    }]);
  };

  const removeLedgerEntry = (entryId: string) => {
    if (ledgerEntries.length > 1) {
      setLedgerEntries(ledgerEntries.filter(entry => entry.id !== entryId));
    }
  };


  const getTotalAmount = () => {
    return ledgerEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    // Validation
    if (!formData.cash_bank_ledger_id) {
      toast({
        title: "Validation Error",
        description: "Please select Pay From account",
        variant: "destructive",
      });
      return;
    }

    const validEntries = ledgerEntries.filter(e => e.ledger_id && e.amount > 0);
    if (validEntries.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please add at least one payment entry with ledger and amount",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const totalAmount = getTotalAmount();
      const searchParams = new URLSearchParams(location.search);
      const editVoucherId = searchParams.get('edit');

      let voucher: any = null;
      // Exclude UI-only field from DB payload and convert empty reference_date to null
      const { cash_bank_ledger_id: _cb, ...voucherForm } = formData;
      const voucherPayload = {
        ...voucherForm,
        reference_date: voucherForm.reference_date || null,
        company_id: selectedCompany.id,
        voucher_type: 'payment' as const,
        ledger_id: ledgerEntries[0]?.ledger_id || '',
        total_amount: totalAmount,
        tax_amount: 0,
        net_amount: totalAmount
      };

      if (editVoucherId) {
        // Update via backend endpoint which handles associated details/entries/allocations
        const resp = await fetch(`${API_HOST_URL}/api/vouchers/${editVoucherId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...voucherPayload,
            details: ledgerEntries.filter(e => e.ledger_id && e.amount > 0).map(entry => ({
              ledger_id: entry.ledger_id,
              amount: entry.amount,
              billallocation: entry.billAllocations
                .filter((a) => a.allocated_amount > 0)
                .map((a) => ({
                  id: a.invoice_voucher_id,
                  invoice_voucher_id: a.invoice_voucher_id,
                  bill_reference: a.voucher_number || '',
                  bill_type: 'Against Ref',
                  amount: a.allocated_amount,
                  bill_date: formData.voucher_date,
                })),
            })),
            ledger_entries: (() => {
              const all: any[] = [];
              all.push({
                company_id: selectedCompany.id,
                ledger_id: formData.cash_bank_ledger_id,
                transaction_date: formData.voucher_date,
                debit_amount: 0,
                credit_amount: totalAmount,
                isDeemedPositive: 'no',
                narration: formData.narration || 'Payment',
              });
              ledgerEntries.filter(e => e.ledger_id && e.amount > 0).forEach(entry => {
                all.push({
                  company_id: selectedCompany.id,
                  ledger_id: entry.ledger_id,
                  transaction_date: formData.voucher_date,
                  debit_amount: entry.amount,
                  credit_amount: 0,
                  isDeemedPositive: 'yes',
                  narration: formData.narration || `Payment via ${ledgers.find(l => l.id === formData.cash_bank_ledger_id)?.name}`,
                  billallocation: entry.billAllocations
                    .filter((a) => a.allocated_amount > 0)
                    .map((a) => ({
                      id: a.invoice_voucher_id,
                      invoice_voucher_id: a.invoice_voucher_id,
                      bill_reference: a.voucher_number || '',
                      bill_type: 'Against Ref',
                      amount: a.allocated_amount,
                      bill_date: formData.voucher_date,
                    }))
                });
              });
              return all;
            })()
          })
        });
        const json = await parseApiResponse(resp);
        if (!json.success) throw new Error(json.message || 'Update failed');
        voucher = json.data;
      } else {
        // Create via backend endpoint
        const createResp = await fetch(`${API_HOST_URL}/api/vouchers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...voucherPayload,
            details: ledgerEntries.filter(e => e.ledger_id && e.amount > 0).map(entry => ({
              ledger_id: entry.ledger_id,
              amount: entry.amount,
              billallocation: entry.billAllocations
                .filter((a) => a.allocated_amount > 0)
                .map((a) => ({
                  id: a.invoice_voucher_id,
                  invoice_voucher_id: a.invoice_voucher_id,
                  bill_reference: a.voucher_number || '',
                  bill_type: 'Against Ref',
                  amount: a.allocated_amount,
                  bill_date: formData.voucher_date,
                })),
            })),
            ledger_entries: (() => {
              const all: any[] = [];
              all.push({
                company_id: selectedCompany.id,
                ledger_id: formData.cash_bank_ledger_id,
                transaction_date: formData.voucher_date,
                debit_amount: 0,
                credit_amount: totalAmount,
                isDeemedPositive: 'no',
                narration: formData.narration || 'Payment',
              });
              ledgerEntries.filter(e => e.ledger_id && e.amount > 0).forEach(entry => {
                all.push({
                  company_id: selectedCompany.id,
                  ledger_id: entry.ledger_id,
                  transaction_date: formData.voucher_date,
                  debit_amount: entry.amount,
                  credit_amount: 0,
                  isDeemedPositive: 'yes',
                  narration: formData.narration || `Payment via ${ledgers.find(l => l.id === formData.cash_bank_ledger_id)?.name}`,
                  billallocation: entry.billAllocations
                    .filter((a) => a.allocated_amount > 0)
                    .map((a) => ({
                      id: a.invoice_voucher_id,
                      invoice_voucher_id: a.invoice_voucher_id,
                      bill_reference: a.voucher_number || '',
                      bill_type: 'Against Ref',
                      amount: a.allocated_amount,
                      bill_date: formData.voucher_date,
                    }))
                });
              });
              return all;
            })()
          })
        });
        const createJson = await parseApiResponse(createResp);
        if (!createJson.success) throw new Error(createJson.message || 'Create failed');
        voucher = createJson.data;
      }

      setSavedVoucher(voucher);

      toast({
        title: "Success",
        description: editVoucherId ? "Payment entry updated successfully!" : "Payment entry created successfully!"
      });

      // Auto-print after save - pass voucher directly to avoid state timing issues
      setTimeout(() => {
        handlePrint(voucher);
      }, 500);

      // After save: if opened from a report, go back; if editing, go back; else reset to add another
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
        setLedgerEntries([{
          id: '1',
          ledger_id: '',
          amount: 0,
          billAllocations: []
        }]);
        await generateVoucherNumber();
      }
    } catch (error) {
      console.error('Error creating payment:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create payment entry",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = (voucherData?: any) => {
    const voucher = voucherData || savedVoucher;
    if (!voucher) {
      toast({
        title: "Error", 
        description: "Please save the payment first",
        variant: "destructive"
      });
      return;
    }
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const totalNet = getTotalAmount();

    printWindow.document.write(`
      <html>
        <head>
          <title>Payment Voucher - ${voucher.voucher_number}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
            .details { margin: 20px 0; }
            .amount-box { border: 2px solid #000; padding: 20px; margin: 20px 0; text-align: center; }
            .signature { margin-top: 50px; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${selectedCompany?.name}</h1>
            <h2>PAYMENT VOUCHER</h2>
          </div>
          <div class="details">
            <p><strong>Voucher No:</strong> ${voucher.voucher_number}</p>
            <p><strong>Date:</strong> ${voucher.voucher_date}</p>
            <p><strong>Paid From:</strong> ${ledgers.find(l => l.id === formData.cash_bank_ledger_id)?.name}</p>
            ${ledgerEntries.map(e => `<p><strong>Paid To:</strong> ${ledgers.find(l => l.id === e.ledger_id)?.name} - ${currencySymbol} ${e.amount.toFixed(2)}</p>`).join('')}
            <p><strong>Narration:</strong> ${voucher.narration || 'Payment Entry'}</p>
          </div>
          <div class="amount-box">
            <h3>Amount Paid: ${currencySymbol} ${totalNet.toFixed(2)}</h3>
            <p>Amount in Words: ${numberToWords(totalNet)}</p>
          </div>
          <div class="signature">
            <div>Prepared By: _______________</div>
            <div>Approved By: _______________</div>
            <div>Received By: _______________</div>
          </div>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
  };

  const numberToWords = (num: number): string => {
    // Basic number to words conversion - you can enhance this
    return `${num.toFixed(2)} Only`;
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Button variant="ghost" onClick={() => { if (window.history.length > 1) { navigate(-1); } else { navigate('/dashboard'); } }} className="mr-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">Payment Entry</h1>
          </div>
          {savedVoucher && (
            <Button onClick={handlePrint} variant="outline">
              <Printer className="h-4 w-4 mr-2" />
              Print Voucher
            </Button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Company</Label>
                  <Input value={selectedCompany?.name || ''} readOnly className="bg-muted" />
                </div>
                
                <div>
                  <Label>Pay From</Label>
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
                    <Button type="button" variant="outline" size="sm" onClick={() => {
                      const returnPath = window.location.pathname + window.location.search;
                      navigate('/ledger-master', { 
                        state: { 
                          returnTo: returnPath,
                          action: 'create',
                          type: 'ledger' 
                        } 
                      });
                    }}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div>
                  <Label>Voucher Number</Label>
                  <Input 
                    value={formData.voucher_number}
                    onChange={(e) => setFormData({...formData, voucher_number: e.target.value})}
                    placeholder="Enter voucher number"
                    required
                  />
                </div>
                
                <div>
                  <Label>Payment Date</Label>
                  <Input 
                    type="date"
                    value={formData.voucher_date}
                    onChange={(e) => setFormData({...formData, voucher_date: e.target.value})}
                    required
                  />
                </div>
                
                <div>
                  <Label>Reference Number</Label>
                  <Input 
                    value={formData.reference_number}
                    onChange={(e) => setFormData({...formData, reference_number: e.target.value})}
                    placeholder="Enter reference number"
                  />
                </div>
                
                <div>
                  <Label>Reference Date</Label>
                  <Input 
                    type="date"
                    value={formData.reference_date}
                    onChange={(e) => setFormData({...formData, reference_date: e.target.value})}
                  />
                </div>
              </div>
              
              <div>
                <Label>Narration</Label>
                <Textarea 
                  value={formData.narration}
                  onChange={(e) => setFormData({...formData, narration: e.target.value})}
                  placeholder="Enter description"
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          {/* Ledger Entries Section */}
          <Card>
            <CardHeader>
              <CardTitle>Payment To (Ledgers)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ledgerEntries.map((entry, index) => (
                <div key={entry.id} className="space-y-4 p-4 border rounded">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Ledger</Label>
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
                          <Button type="button" variant="outline" size="sm" onClick={() => {
                            const returnPath = window.location.pathname + window.location.search;
                            navigate('/ledger-master', { 
                              state: { 
                                returnTo: returnPath,
                                action: 'create',
                                type: 'ledger' 
                              } 
                            });
                          }}>
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

                  {/* Bill Allocation Button and Summary */}
                  <div className="mt-4 space-y-2">
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
                  </div>
                </div>
              ))}
              
              <Button type="button" onClick={addLedgerEntry} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Another Ledger
              </Button>

              <div className="pt-4 border-t">
                <div className="flex justify-between items-center">
                  <Label className="text-lg">Total Payment Amount:</Label>
                  <span className="text-lg font-bold">{currencySymbol} {getTotalAmount().toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end space-x-4">
            <Button type="button" variant="outline" onClick={() => navigate('/dashboard')}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.cash_bank_ledger_id || ledgerEntries.every(e => !e.ledger_id || e.amount === 0)}>
              {loading ? 'Saving...' : 'Save Payment'}
            </Button>
          </div>
        </form>

        {/* Bill Allocation Dialog */}
        {selectedEntryForBills && (
          <BillAllocationDialog
            open={billDialogOpen}
            onClose={() => {
              setBillDialogOpen(false);
              setSelectedEntryForBills(null);
            }}
            ledgerId={selectedEntryForBills.ledger_id}
            ledgerName={ledgers.find(l => l.id === selectedEntryForBills.ledger_id)?.name || ''}
            maxAmount={selectedEntryForBills.amount}
            voucherType="payment"
            existingAllocations={selectedEntryForBills.billAllocations}
            onSave={handleBillAllocationSave}
          />
        )}
      </div>
    </div>
  );
};

export default PaymentForm;