import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { API_BASE_URL } from '@/config/runtime';

interface VoucherType {
  id: string;
  company_id: string;
  name: string;
  base_type: string;
  is_system: boolean;
  prefix: string;
  suffix: string;
  starting_number: number;
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

  useEffect(() => {
    if (selectedCompany) fetchVoucherTypes();
  }, [selectedCompany]);

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
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (vt: VoucherType) => {
    setEditingId(vt.id);
    setForm({
      name: vt.name,
      base_type: vt.base_type,
      prefix: vt.prefix,
      suffix: vt.suffix,
      starting_number: String(vt.starting_number),
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

    setSaving(true);
    try {
      const payload: any = {
        prefix: form.prefix,
        suffix: form.suffix,
        starting_number: parseInt(form.starting_number) || 1,
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Voucher Type' : 'New Voucher Type'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
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

            {/* Under (only for new custom types) */}
            {!editingId && (
              <div>
                <Label>Under <span className="text-destructive">*</span></Label>
                <Select
                  value={form.base_type}
                  onValueChange={(v) => setForm((p) => ({ ...p, base_type: v }))}
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
                <p className="text-xs text-muted-foreground mt-1">
                  Determines the accounting behaviour of this voucher type.
                </p>
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
          </div>

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
    </div>
  );
};

export default VoucherTypeMaster;
