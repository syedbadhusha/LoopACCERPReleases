import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { isCompanyPOSEnabled, getCompanyTaxType, isCompanyTaxEnabled } from '@/lib/companyTax';
import { API_BASE_URL } from '@/config/runtime';
import QuickCreateLedgerDialog from '@/components/QuickCreateLedgerDialog';

interface VoucherType {
  id: string;
  company_id: string;
  name: string;
  base_type: string;
  is_system: boolean;
  is_pos: boolean;
  prefix: string;
  suffix: string;
  starting_number: number;
  pos_sales_ledger_id?: string;
  pos_cash_ledger_id?: string;
  pos_card_ledger_id?: string;
  pos_online_ledger_id?: string;
  pos_tax_ledger_id?: string;
  pos_cgst_ledger_id?: string;
  pos_sgst_ledger_id?: string;
  print_after_save?: boolean;
  print_title?: string;
}

interface Ledger {
  id: string;
  name: string;
  group_name?: string;
}

const BASE_TYPES = [
  { value: 'sales',       label: 'Sales' },
  { value: 'credit-note', label: 'Credit Note' },
  { value: 'purchase',    label: 'Purchase' },
  { value: 'debit-note',  label: 'Debit Note' },
  { value: 'payment',     label: 'Payment' },
  { value: 'receipt',     label: 'Receipt' },
];

const BASE_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  BASE_TYPES.map((b) => [b.value, b.label])
);

const BASE_TYPE_GROUPS = [
  { label: 'Sales',    types: ['sales', 'credit-note'] },
  { label: 'Purchase', types: ['purchase', 'debit-note'] },
  { label: 'Financial', types: ['payment', 'receipt'] },
];

const IS_INVENTORY_TYPES = new Set(['sales', 'credit-note', 'purchase', 'debit-note']);
const getFormType = (baseType: string) => IS_INVENTORY_TYPES.has(baseType) ? 'Inventory' : 'Accounting';

const EMPTY_FORM = {
  name: '',
  base_type: '',
  prefix: '',
  suffix: '',
  starting_number: '1',
  is_pos: false,
  pos_sales_ledger_id: '',
  pos_cash_ledger_id: '',
  pos_card_ledger_id: '',
  pos_online_ledger_id: '',
  pos_tax_ledger_id: '',
  pos_cgst_ledger_id: '',
  pos_sgst_ledger_id: '',
  print_after_save: false,
  print_title: '',
};

const VoucherTypeMaster = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedCompany } = useCompany();

  const [voucherTypes, setVoucherTypes] = useState<VoucherType[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [hasVouchersForEditing, setHasVouchersForEditing] = useState(false);
  const [quickLedgerOpen, setQuickLedgerOpen] = useState(false);
  const [quickLedgerTarget, setQuickLedgerTarget] = useState('');
  const [quickLedgerDefaultGroup, setQuickLedgerDefaultGroup] = useState('');
  const posEnabled = isCompanyPOSEnabled(selectedCompany);
  const taxType = getCompanyTaxType(selectedCompany);
  const isTaxEnabled = isCompanyTaxEnabled(selectedCompany);

  useEffect(() => {
    if (selectedCompany) fetchVoucherTypes();
  }, [selectedCompany]);

  // Load ledgers when dialog opens (for POS ledger config)
  useEffect(() => {
    if (dialogOpen && selectedCompany && ledgers.length === 0) {
      fetch(`${API_BASE_URL}/ledgers?companyId=${selectedCompany.id}`)
        .then(r => r.json())
        .then(json => { if (json.success) setLedgers(json.data || []); })
        .catch(console.error);
    }
  }, [dialogOpen, selectedCompany]);

  const fetchVoucherTypes = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/voucher-types?companyId=${selectedCompany.id}`
      );
      const json = await res.json();
      if (json.success) setVoucherTypes(json.data || []);
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to load voucher types', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setHasVouchersForEditing(false);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (vt: VoucherType) => {
    setEditingId(vt.id);
    setHasVouchersForEditing(false);
    if (selectedCompany) {
      fetch(`${API_BASE_URL}/vouchers/has-pos-vouchers?companyId=${selectedCompany.id}&voucherTypeId=${vt.id}`)
        .then(r => r.json())
        .then(json => { if (json.success) setHasVouchersForEditing(json.hasVouchers); })
        .catch(() => {});
    }
    setForm({
      name: vt.name,
      base_type: vt.base_type,
      prefix: vt.prefix,
      suffix: vt.suffix,
      starting_number: String(vt.starting_number),
      is_pos: vt.is_pos || false,
      pos_sales_ledger_id: vt.pos_sales_ledger_id || '',
      pos_cash_ledger_id: vt.pos_cash_ledger_id || '',
      pos_card_ledger_id: vt.pos_card_ledger_id || '',
      pos_online_ledger_id: vt.pos_online_ledger_id || '',
      pos_tax_ledger_id: vt.pos_tax_ledger_id || '',
      pos_cgst_ledger_id: vt.pos_cgst_ledger_id || '',
      pos_sgst_ledger_id: vt.pos_sgst_ledger_id || '',
      print_after_save: vt.print_after_save || false,
      print_title: vt.print_title || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!selectedCompany) return;
    if (!form.name.trim()) {
      toast({ title: 'Validation', description: 'Name is required', variant: 'destructive' });
      return;
    }
    if (!editingId && !form.base_type) {
      toast({ title: 'Validation', description: 'Under is required', variant: 'destructive' });
      return;
    }

    // POS ledger validation: all ledgers required when POS enabled
    if (form.is_pos) {
      if (!form.pos_sales_ledger_id) {
        toast({ title: 'Validation', description: 'Sales Account is required for POS configuration.', variant: 'destructive' });
        return;
      }
      if (!form.pos_cash_ledger_id) {
        toast({ title: 'Validation', description: 'Cash Ledger is required for POS configuration.', variant: 'destructive' });
        return;
      }
      if (!form.pos_card_ledger_id) {
        toast({ title: 'Validation', description: 'Card Ledger is required for POS configuration.', variant: 'destructive' });
        return;
      }
      if (!form.pos_online_ledger_id) {
        toast({ title: 'Validation', description: 'Online / UPI Ledger is required for POS configuration.', variant: 'destructive' });
        return;
      }
    }

    // POS tax ledger validation: required when tax is enabled
    if (form.is_pos && isTaxEnabled) {
      if (taxType === 'GST') {
        if (!form.pos_cgst_ledger_id) {
          toast({ title: 'Validation', description: 'CGST Ledger is required for POS when GST is enabled.', variant: 'destructive' });
          return;
        }
        if (!form.pos_sgst_ledger_id) {
          toast({ title: 'Validation', description: 'SGST Ledger is required for POS when GST is enabled.', variant: 'destructive' });
          return;
        }
      } else {
        if (!form.pos_tax_ledger_id) {
          toast({ title: 'Validation', description: 'VAT / Tax Ledger is required for POS when tax is enabled.', variant: 'destructive' });
          return;
        }
      }
    }
    try {
      // Guard: if editing and turning off is_pos, check no vouchers exist for this type
      if (editingId) {
        const existingVt = voucherTypes.find((v) => v.id === editingId);
        if (existingVt?.is_pos && !form.is_pos) {
          const checkRes = await fetch(
            `${API_BASE_URL}/vouchers/has-pos-vouchers?companyId=${selectedCompany.id}&voucherTypeId=${editingId}`
          );
          const checkJson = await checkRes.json();
          if (checkJson.hasVouchers) {
            toast({
              title: 'Cannot disable POS mode',
              description: `${checkJson.count} POS voucher(s) already exist for this type. Delete all POS vouchers first.`,
              variant: 'destructive',
            });
            setSaving(false);
            return;
          }
        }
      }

      const payload: any = {
        prefix: form.prefix,
        suffix: form.suffix,
        starting_number: parseInt(form.starting_number) || 1,
        is_pos: form.is_pos,
        pos_sales_ledger_id: form.pos_sales_ledger_id || null,
        pos_cash_ledger_id: form.pos_cash_ledger_id || null,
        pos_card_ledger_id: form.pos_card_ledger_id || null,
        pos_online_ledger_id: form.pos_online_ledger_id || null,
        pos_tax_ledger_id: form.pos_tax_ledger_id || null,
        pos_cgst_ledger_id: form.pos_cgst_ledger_id || null,
        pos_sgst_ledger_id: form.pos_sgst_ledger_id || null,
        print_after_save: form.print_after_save,
        print_title: form.print_title,
      };

      let res: Response;
      if (editingId) {
        // For system types only prefix/suffix/starting_number are editable
        const vt = voucherTypes.find((v) => v.id === editingId);
        if (!vt?.is_system) {
          payload.name = form.name.trim();
          payload.base_type = form.base_type;
        }
        res = await fetch(`${API_BASE_URL}/voucher-types/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        payload.company_id = selectedCompany.id;
        payload.name = form.name.trim();
        payload.base_type = form.base_type;
        res = await fetch(`${API_BASE_URL}/voucher-types`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to save');

      toast({ title: 'Success', description: editingId ? 'Voucher type updated' : 'Voucher type created' });
      setDialogOpen(false);
      fetchVoucherTypes();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (vt: VoucherType) => {
    if (vt.is_system) return;
    if (!confirm(`Delete voucher type "${vt.name}"?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/voucher-types/${vt.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to delete');
      toast({ title: 'Deleted', description: `"${vt.name}" deleted` });
      fetchVoucherTypes();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const isEditingSystemType = !!editingId && !!voucherTypes.find((v) => v.id === editingId)?.is_system;

  return (
    <div className="bg-background h-screen flex flex-col overflow-hidden">
      <div className="flex-shrink-0 bg-background border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Header */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Voucher Type Master</h1>
              <p className="text-sm text-muted-foreground">
                {selectedCompany?.name}
              </p>
            </div>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New Voucher Type
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6">

        {/* Groups */}
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-6">
            {BASE_TYPE_GROUPS.map(({ label, types }) => {
              const rows = voucherTypes.filter((vt) => types.includes(vt.base_type));
              if (!rows.length) return null;
              return (
                <Card key={label}>
                  <CardHeader className="pb-3 sticky top-0 z-20 bg-card rounded-t-lg border-b">
                    <CardTitle className="text-base">{label}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="[&_tr_th]:top-[61px]">
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Under</TableHead>
                          <TableHead>Nature of Voucher</TableHead>
                          {posEnabled && <TableHead>POS</TableHead>}
                          <TableHead>Prefix</TableHead>
                          <TableHead>Suffix</TableHead>
                          <TableHead>Starting No.</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="w-24">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((vt) => (
                          <TableRow key={vt.id}>
                            <TableCell className="font-medium">{vt.name}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {BASE_TYPE_LABEL[vt.base_type] || vt.base_type}
                            </TableCell>
                            <TableCell>
                              <Badge variant={IS_INVENTORY_TYPES.has(vt.base_type) ? 'default' : 'secondary'} className="text-xs">
                                {getFormType(vt.base_type)}
                              </Badge>
                            </TableCell>
                            {posEnabled && (
                              <TableCell>
                                {['sales','credit-note'].includes(vt.base_type) && vt.is_pos
                                  ? <Badge variant="default" className="text-xs bg-orange-500">POS</Badge>
                                  : <span className="text-muted-foreground text-xs">—</span>}
                              </TableCell>
                            )}
                            <TableCell>
                              <code className="text-xs bg-muted px-1 py-0.5 rounded">{vt.prefix || '—'}</code>
                            </TableCell>
                            <TableCell>
                              <code className="text-xs bg-muted px-1 py-0.5 rounded">{vt.suffix || '—'}</code>
                            </TableCell>
                            <TableCell>{vt.starting_number}</TableCell>
                            <TableCell>
                              {vt.is_system
                                ? <Badge variant="secondary">System</Badge>
                                : <Badge variant="outline">Custom</Badge>}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEdit(vt)}
                                  title="Edit"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {!vt.is_system && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:bg-destructive/10"
                                    onClick={() => handleDelete(vt)}
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={form.is_pos ? 'max-w-3xl max-h-[92vh] overflow-y-auto' : 'max-w-lg'}>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Voucher Type' : 'New Voucher Type'}
            </DialogTitle>
          </DialogHeader>

          <div className={form.is_pos ? 'grid grid-cols-2 gap-6 py-2' : 'space-y-4 py-2'}>
            {/* Left column: basic fields */}
            <div className="space-y-4">
            <div>
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Export Sales Invoice"
                disabled={isEditingSystemType}
              />
              {isEditingSystemType && (
                <p className="text-xs text-muted-foreground mt-1">
                  Name of system types cannot be changed.
                </p>
              )}
            </div>

            {/* Under: always shown; editable only if no vouchers exist and not a system type */}
            {!isEditingSystemType && (
              <div>
                <Label>Under <span className="text-destructive">*</span></Label>
                <Select
                  value={form.base_type}
                  onValueChange={(v) => {
                    const posAllowed = ['sales', 'credit-note'].includes(v);
                    setForm((p) => ({
                      ...p,
                      base_type: v,
                      ...(posAllowed ? {} : {
                        is_pos: false,
                        pos_sales_ledger_id: '',
                        pos_cash_ledger_id: '',
                        pos_card_ledger_id: '',
                        pos_online_ledger_id: '',
                        pos_tax_ledger_id: '',
                        pos_cgst_ledger_id: '',
                        pos_sgst_ledger_id: '',
                      }),
                    }));
                  }}
                  disabled={!!(editingId && hasVouchersForEditing)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select under" />
                  </SelectTrigger>
                  <SelectContent>
                    {BASE_TYPES.map((bt) => (
                      <SelectItem key={bt.value} value={bt.value}>
                        {bt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editingId && hasVouchersForEditing ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    Cannot change — vouchers already exist for this type.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    Determines the accounting behaviour of this voucher type.
                  </p>
                )}
              </div>
            )}

            {/* Nature of Voucher indicator */}
            {(form.base_type || editingId) && (
              <div>
                <Label>Nature of Voucher</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={IS_INVENTORY_TYPES.has(form.base_type || voucherTypes.find(v => v.id === editingId)?.base_type || '') ? 'default' : 'secondary'}>
                    {getFormType(form.base_type || voucherTypes.find(v => v.id === editingId)?.base_type || '')}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {IS_INVENTORY_TYPES.has(form.base_type || voucherTypes.find(v => v.id === editingId)?.base_type || '')
                      ? 'Uses Inventory Form (items, quantities, tax)'
                      : 'Uses Accounting Form (ledger entries, bill allocation)'}
                  </span>
                </div>
              </div>
            )}
            <div>
              <Label>Prefix</Label>
              <Input
                value={form.prefix}
                onChange={(e) => setForm((p) => ({ ...p, prefix: e.target.value }))}
                placeholder="e.g. INV-"
              />
            </div>

            <div>
              <Label>Suffix</Label>
              <Input
                value={form.suffix}
                onChange={(e) => setForm((p) => ({ ...p, suffix: e.target.value }))}
                placeholder="e.g. /24-25"
              />
            </div>

            <div>
              <Label>Starting Number</Label>
              <Input
                type="number"
                min={1}
                value={form.starting_number}
                onChange={(e) => setForm((p) => ({ ...p, starting_number: e.target.value }))}
                placeholder="1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Preview: {form.prefix || ''}{(parseInt(form.starting_number) || 1).toString().padStart(4, '0')}{form.suffix || ''}
              </p>
            </div>

            {/* Print After Save */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="font-medium">Print After Save</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically print the voucher when saved.
                </p>
              </div>
              <Switch
                checked={form.print_after_save}
                onCheckedChange={(v) => setForm((p) => ({ ...p, print_after_save: v }))}
              />
            </div>

            {/* Print Title */}
            <div>
              <Label>Print Title</Label>
              <Input
                value={form.print_title}
                onChange={(e) => setForm((p) => ({ ...p, print_title: e.target.value }))}
                placeholder={['sales','credit-note'].includes(form.base_type || voucherTypes.find(v => v.id === editingId)?.base_type || '') ? 'e.g. Tax Invoice' : 'e.g. Purchase Order'}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Heading shown on top of the printed document. Leave blank for the default.
              </p>
            </div>

            {/* POS Mode — only for sales/credit-note and when POS module is enabled */}
            {posEnabled && ['sales','credit-note'].includes(
              form.base_type || voucherTypes.find(v => v.id === editingId)?.base_type || ''
            ) && (
              <>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label className="font-medium">Enable POS Mode</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      This type will appear in POS screen only, not in Vouchers.
                    </p>
                  </div>
                  <Switch
                    checked={form.is_pos}
                    onCheckedChange={(v) => setForm((p) => ({ ...p, is_pos: v }))}
                  />
                </div>
              </>
            )}
            </div>{/* end left column */}

            {/* Right column: POS Ledger Configuration (only when is_pos is true) */}
            {form.is_pos && posEnabled && (
              <div className="rounded-lg border p-4 space-y-3 bg-muted/20 h-fit">
                <Label className="font-semibold text-sm block">POS Ledger Configuration</Label>

                {/* Sales Account */}
                <div>
                  <Label className="text-xs">Sales Account <span className="text-destructive">*</span></Label>
                  <p className="text-[10px] text-muted-foreground mb-1">Credited when a POS sale is saved</p>
                  <div className="flex gap-1">
                    <Select
                      value={form.pos_sales_ledger_id}
                      onValueChange={(v) => setForm((p) => ({ ...p, pos_sales_ledger_id: v === '__none__' ? '' : v }))}
                    >
                      <SelectTrigger className="h-8 text-sm flex-1"><SelectValue placeholder="Select ledger" /></SelectTrigger>
                      <SelectContent>
                        {ledgers.map(l => <SelectItem key={l.id} value={l.id}>{l.name}{l.group_name ? ` (${l.group_name})` : ''}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Create new ledger"
                      onClick={() => { setQuickLedgerTarget('pos_sales_ledger_id'); setQuickLedgerDefaultGroup('Sales Accounts'); setQuickLedgerOpen(true); }}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Cash Ledger */}
                <div>
                  <Label className="text-xs">Cash Ledger <span className="text-destructive">*</span></Label>
                  <p className="text-[10px] text-muted-foreground mb-1">Debited for Cash payments.</p>
                  <div className="flex gap-1">
                    <Select
                      value={form.pos_cash_ledger_id || '__none__'}
                      onValueChange={(v) => setForm((p) => ({ ...p, pos_cash_ledger_id: v === '__none__' ? '' : v }))}
                    >
                      <SelectTrigger className={`h-8 text-sm flex-1 ${!form.pos_cash_ledger_id ? 'border-destructive' : ''}`}><SelectValue placeholder="Select ledger" /></SelectTrigger>
                      <SelectContent>
                        {ledgers.map(l => <SelectItem key={l.id} value={l.id}>{l.name}{l.group_name ? ` (${l.group_name})` : ''}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Create new ledger"
                      onClick={() => { setQuickLedgerTarget('pos_cash_ledger_id'); setQuickLedgerDefaultGroup('Cash-in-Hand'); setQuickLedgerOpen(true); }}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Card Ledger */}
                <div>
                  <Label className="text-xs">Card Ledger <span className="text-destructive">*</span></Label>
                  <p className="text-[10px] text-muted-foreground mb-1">Debited for Card payments.</p>
                  <div className="flex gap-1">
                    <Select
                      value={form.pos_card_ledger_id || '__none__'}
                      onValueChange={(v) => setForm((p) => ({ ...p, pos_card_ledger_id: v === '__none__' ? '' : v }))}
                    >
                      <SelectTrigger className={`h-8 text-sm flex-1 ${!form.pos_card_ledger_id ? 'border-destructive' : ''}`}><SelectValue placeholder="Select ledger" /></SelectTrigger>
                      <SelectContent>
                        {ledgers.map(l => <SelectItem key={l.id} value={l.id}>{l.name}{l.group_name ? ` (${l.group_name})` : ''}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Create new ledger"
                      onClick={() => { setQuickLedgerTarget('pos_card_ledger_id'); setQuickLedgerDefaultGroup('Bank Accounts'); setQuickLedgerOpen(true); }}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Online Ledger */}
                <div>
                  <Label className="text-xs">Online / UPI Ledger <span className="text-destructive">*</span></Label>
                  <p className="text-[10px] text-muted-foreground mb-1">Debited for Online/UPI payments.</p>
                  <div className="flex gap-1">
                    <Select
                      value={form.pos_online_ledger_id || '__none__'}
                      onValueChange={(v) => setForm((p) => ({ ...p, pos_online_ledger_id: v === '__none__' ? '' : v }))}
                    >
                      <SelectTrigger className={`h-8 text-sm flex-1 ${!form.pos_online_ledger_id ? 'border-destructive' : ''}`}><SelectValue placeholder="Select ledger" /></SelectTrigger>
                      <SelectContent>
                        {ledgers.map(l => <SelectItem key={l.id} value={l.id}>{l.name}{l.group_name ? ` (${l.group_name})` : ''}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Create new ledger"
                      onClick={() => { setQuickLedgerTarget('pos_online_ledger_id'); setQuickLedgerDefaultGroup('Bank Accounts'); setQuickLedgerOpen(true); }}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Tax Ledger(s) — CGST + SGST for GST companies, single VAT ledger otherwise */}
                {taxType === 'GST' ? (
                  <>
                    <div>
                      <Label className="text-xs">CGST Ledger {isTaxEnabled ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(optional)</span>}</Label>
                      <p className="text-[10px] text-muted-foreground mb-1">{isTaxEnabled ? 'Required — credited for CGST on POS transactions.' : 'Credited for CGST. If blank, tax is included in Sales Account.'}</p>
                      <div className="flex gap-1">
                        <Select
                          value={form.pos_cgst_ledger_id || '__none__'}
                          onValueChange={(v) => setForm((p) => ({ ...p, pos_cgst_ledger_id: v === '__none__' ? '' : v }))}
                        >
                          <SelectTrigger className={`h-8 text-sm flex-1 ${isTaxEnabled && !form.pos_cgst_ledger_id ? 'border-destructive' : ''}`}><SelectValue placeholder="Select ledger" /></SelectTrigger>
                          <SelectContent>
                            {!isTaxEnabled && <SelectItem value="__none__">— None —</SelectItem>}
                            {ledgers.map(l => <SelectItem key={l.id} value={l.id}>{l.name}{l.group_name ? ` (${l.group_name})` : ''}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Create new ledger"
                          onClick={() => { setQuickLedgerTarget('pos_cgst_ledger_id'); setQuickLedgerDefaultGroup('Duties & Taxes'); setQuickLedgerOpen(true); }}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">SGST Ledger {isTaxEnabled ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(optional)</span>}</Label>
                      <p className="text-[10px] text-muted-foreground mb-1">{isTaxEnabled ? 'Required — credited for SGST on POS transactions.' : 'Credited for SGST. If blank, tax is included in Sales Account.'}</p>
                      <div className="flex gap-1">
                        <Select
                          value={form.pos_sgst_ledger_id || '__none__'}
                          onValueChange={(v) => setForm((p) => ({ ...p, pos_sgst_ledger_id: v === '__none__' ? '' : v }))}
                        >
                          <SelectTrigger className={`h-8 text-sm flex-1 ${isTaxEnabled && !form.pos_sgst_ledger_id ? 'border-destructive' : ''}`}><SelectValue placeholder="Select ledger" /></SelectTrigger>
                          <SelectContent>
                            {!isTaxEnabled && <SelectItem value="__none__">— None —</SelectItem>}
                            {ledgers.map(l => <SelectItem key={l.id} value={l.id}>{l.name}{l.group_name ? ` (${l.group_name})` : ''}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Create new ledger"
                          onClick={() => { setQuickLedgerTarget('pos_sgst_ledger_id'); setQuickLedgerDefaultGroup('Duties & Taxes'); setQuickLedgerOpen(true); }}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div>
                    <Label className="text-xs">VAT / Tax Ledger {isTaxEnabled ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(optional)</span>}</Label>
                    <p className="text-[10px] text-muted-foreground mb-1">{isTaxEnabled ? 'Required — credited for VAT on POS transactions.' : 'Credited separately for tax. If blank, tax is included in Sales Account credit.'}</p>
                    <div className="flex gap-1">
                      <Select
                        value={form.pos_tax_ledger_id || '__none__'}
                        onValueChange={(v) => setForm((p) => ({ ...p, pos_tax_ledger_id: v === '__none__' ? '' : v }))}
                      >
                        <SelectTrigger className={`h-8 text-sm flex-1 ${isTaxEnabled && !form.pos_tax_ledger_id ? 'border-destructive' : ''}`}><SelectValue placeholder="Select ledger" /></SelectTrigger>
                        <SelectContent>
                          {!isTaxEnabled && <SelectItem value="__none__">— None —</SelectItem>}
                          {ledgers.map(l => <SelectItem key={l.id} value={l.id}>{l.name}{l.group_name ? ` (${l.group_name})` : ''}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Create new ledger"
                        onClick={() => { setQuickLedgerTarget('pos_tax_ledger_id'); setQuickLedgerDefaultGroup('Duties & Taxes'); setQuickLedgerOpen(true); }}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>{/* end grid */}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuickCreateLedgerDialog
        open={quickLedgerOpen}
        onClose={() => setQuickLedgerOpen(false)}
        onCreated={(ledger) => {
          setLedgers(prev => [...prev, { id: ledger.id, name: ledger.name, group_name: ledger.group_name }]);
          if (quickLedgerTarget) setForm(p => ({ ...p, [quickLedgerTarget]: ledger.id } as typeof p));
          setQuickLedgerOpen(false);
        }}
        defaultGroupName={quickLedgerDefaultGroup}
      />
    </div>
  );
};

export default VoucherTypeMaster;
