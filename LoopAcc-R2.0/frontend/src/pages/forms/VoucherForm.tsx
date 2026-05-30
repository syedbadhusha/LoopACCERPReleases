import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Receipt,
  CreditCard,
  FileText,
  FileX,
  ShoppingCart,
  TrendingUp,
  Loader2,
  Settings,
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { usePermissions } from '@/contexts/PermissionContext';
import { API_BASE_URL } from '@/config/runtime';
import InventoryForm from './InventoryVchForms';
import AccountingForm from './AccountingVchForms';

// ─── Shared type ─────────────────────────────────────────────────────────────

export interface VoucherTypeMeta {
  id: string;
  name: string;
  base_type: 'sales' | 'credit-note' | 'purchase' | 'debit-note' | 'payment' | 'receipt';
  prefix: string;
  suffix: string;
  starting_number: number;
  is_system: boolean;
  is_pos?: boolean;
  print_after_save?: boolean;
  print_title?: string;
}

// ─── Icon / colour map ────────────────────────────────────────────────────────

const BASE_TYPE_UI: Record<string, { icon: React.ElementType; color: string }> = {
  'sales':       { icon: TrendingUp,   color: 'text-green-600' },
  'credit-note': { icon: FileText,     color: 'text-blue-600' },
  'purchase':    { icon: ShoppingCart, color: 'text-orange-600' },
  'debit-note':  { icon: FileX,        color: 'text-red-600' },
  'payment':     { icon: CreditCard,   color: 'text-purple-600' },
  'receipt':     { icon: Receipt,      color: 'text-teal-600' },
};

const SIDEBAR_GROUPS = [
  { label: 'Sales',     types: ['sales', 'credit-note'] },
  { label: 'Purchase',  types: ['purchase', 'debit-note'] },
  { label: 'Financial', types: ['payment', 'receipt'] },
];

const LAST_TYPE_KEY = 'loopAcc_lastVoucherTypeId';

// ─── Inline form renderer ─────────────────────────────────────────────────────

const ResolvedForm = ({ voucherTypeMeta, viewOnly, autoPrint }: { voucherTypeMeta: VoucherTypeMeta; viewOnly?: boolean; autoPrint?: boolean }) => {
  const bt = voucherTypeMeta.base_type;
  if (['sales', 'credit-note', 'purchase', 'debit-note'].includes(bt)) {
    return <InventoryForm voucherType={bt as 'sales' | 'credit-note' | 'purchase' | 'debit-note'} voucherTypeMeta={voucherTypeMeta} viewOnly={viewOnly} autoPrint={autoPrint} />;
  }
  if (['payment', 'receipt'].includes(bt)) {
    return <AccountingForm voucherType={bt as 'payment' | 'receipt'} voucherTypeMeta={voucherTypeMeta} viewOnly={viewOnly} autoPrint={autoPrint} />;
  }
  return null;
};

// ─── Main workspace (sidebar + form) ─────────────────────────────────────────

const VoucherWorkspace = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedCompany } = useCompany();
  const { canVoucher, isAdmin, loading: permLoading } = usePermissions();

  const params = new URLSearchParams(location.search);
  const typeIdParam = params.get('typeId');
  const baseTypeParam = params.get('type'); // backward compat
  const editParam = params.get('edit');
  const viewParam = params.get('view'); // view-only mode
  const autoPrintParam = params.get('autoPrint'); // auto-trigger print after load

  const [voucherTypes, setVoucherTypes] = useState<VoucherTypeMeta[]>([]);
  const [selectedMeta, setSelectedMeta] = useState<VoucherTypeMeta | null>(null);
  const [loading, setLoading] = useState(true);

  // Load all voucher types once on mount / company change
  useEffect(() => {
    if (!selectedCompany) return;
    setLoading(true);

    const run = async () => {
      try {
        const vtRes = await fetch(`${API_BASE_URL}/voucher-types?companyId=${selectedCompany.id}`);
        const json = await vtRes.json();
        if (!json.success) return;

        const types: VoucherTypeMeta[] = json.data || [];
        const nonPosTypes = types.filter(t => !t.is_pos);
        // Filter by create permission (admin sees all)
        const creatableTypes = nonPosTypes.filter(t => canVoucher(t.id, 'create'));
        setVoucherTypes(creatableTypes);

        // If editing, check the voucher FIRST — if it is a POS voucher, redirect to POS screen.
        // We check is_pos on the voucher directly (fastest), then fall back to matching voucher_type_id
        // against the loaded voucher types list (for older vouchers that predate the is_pos flag).
        // This must complete before URL normalisation so there is no race condition.
        if (editParam) {
          try {
            const vRes = await fetch(`${API_BASE_URL}/vouchers/${editParam}`);
            const vJson = await vRes.json();
            if (vJson.success && vJson.data) {
              const v = vJson.data;
              const isPosVoucher =
                v.is_pos === true ||
                (v.voucher_type_id && types.some(t => t.id === v.voucher_type_id && t.is_pos));
              if (isPosVoucher) {
                navigate(`/pos?edit=${editParam}`, { replace: true });
                return; // stop – do not render VoucherForm
              }
            }
          } catch {
            // ignore – fall through to normal form
          }
        }

        // Not a POS voucher (or no edit param) – proceed with normal type selection
        let target: VoucherTypeMeta | undefined;
        if (typeIdParam) target = voucherTypes.find(t => t.id === typeIdParam);
        if (!target && baseTypeParam) target = nonPosTypes.find(t => t.base_type === baseTypeParam && t.is_system);
        if (!target) {
          const lastId = localStorage.getItem(LAST_TYPE_KEY);
          if (lastId) target = voucherTypes.find(t => t.id === lastId);
        }
        if (!target) target = voucherTypes.find(t => t.base_type === 'payment' && t.is_system);
        if (!target) target = voucherTypes[0];

        if (target) {
          setSelectedMeta(target);
          localStorage.setItem(LAST_TYPE_KEY, target.id);
          if (!typeIdParam || typeIdParam !== target.id) {
            const extra = [
              editParam ? `edit=${editParam}` : '',
              viewParam ? `view=${viewParam}` : '',
              autoPrintParam ? `autoPrint=${autoPrintParam}` : '',
            ].filter(Boolean).join('&');
            navigate(`/vouchers?typeId=${target.id}${extra ? `&${extra}` : ''}`, { replace: true });
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [selectedCompany, canVoucher]);

  // Sync when URL typeId changes externally (e.g. edit link from another page)
  useEffect(() => {
    if (!typeIdParam || !voucherTypes.length) return;
    const found = voucherTypes.find(t => t.id === typeIdParam);
    if (found && found.id !== selectedMeta?.id) {
      setSelectedMeta(found);
      localStorage.setItem(LAST_TYPE_KEY, found.id);
    }
  }, [typeIdParam, voucherTypes]);

  const handleSelectType = (vt: VoucherTypeMeta) => {
    setSelectedMeta(vt);
    localStorage.setItem(LAST_TYPE_KEY, vt.id);
    navigate(`/vouchers?typeId=${vt.id}`, { replace: true });
  };

  return (
    <div className="h-screen flex overflow-hidden bg-background">

      {/* ── Sidebar ── */}
      {voucherTypes.length > 0 && (
        <aside className="w-56 flex-shrink-0 border-r bg-card flex flex-col overflow-hidden">
          {/* Sidebar header */}
          <div className="flex-shrink-0 px-3 py-3 border-b">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <p className="font-semibold text-sm leading-tight">Vouchers</p>
                <p className="text-xs text-muted-foreground truncate">{selectedCompany?.name}</p>
              </div>
            </div>
          </div>

          {/* Voucher type list */}
          <nav className="flex-1 overflow-y-auto py-1">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              SIDEBAR_GROUPS.map(({ label, types }) => {
                const items = voucherTypes.filter(vt => types.includes(vt.base_type));
                if (!items.length) return null;
                return (
                  <div key={label} className="mb-1">
                    <p className="px-4 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {label}
                    </p>
                    {items.map(vt => {
                      const ui = BASE_TYPE_UI[vt.base_type] || { icon: FileText, color: 'text-foreground' };
                      const Icon = ui.icon;
                      const isActive = selectedMeta?.id === vt.id;
                      return (
                        <button
                          key={vt.id}
                          className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2.5 transition-colors
                            ${isActive
                              ? 'bg-primary/10 text-primary font-medium border-r-2 border-primary'
                              : 'hover:bg-muted/60 text-foreground'
                            }`}
                          onClick={() => handleSelectType(vt)}
                        >
                          <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? 'text-primary' : ui.color}`} />
                          <span className="truncate">{vt.name}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </nav>

          {/* Manage types */}
          <div className="flex-shrink-0 border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs text-muted-foreground gap-2"
              onClick={() => navigate('/voucher-types')}
            >
              <Settings className="h-3.5 w-3.5" />
              Manage Voucher Types
            </Button>
          </div>
        </aside>
      )}

      {/* ── Form area ── */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {loading || permLoading ? (
          <div className="h-full grid place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : selectedMeta ? (
          // Permission guards — show friendly message rather than a broken form
          editParam && !canVoucher(selectedMeta.id, 'edit') ? (
            // If user has view perm, show view-only mode; otherwise access denied
            canVoucher(selectedMeta.id, 'view') ? (
              <ResolvedForm
                key={selectedMeta.id + (editParam || 'view')}
                voucherTypeMeta={selectedMeta}
                viewOnly
                autoPrint={!!autoPrintParam}
              />
            ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <p className="text-sm font-medium text-destructive">You don\'t have permission to edit {selectedMeta.name} vouchers.</p>
              <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
            </div>
            )
          ) : viewParam && !canVoucher(selectedMeta.id, 'edit') ? (
            // Explicit view-only URL with no edit perm
            canVoucher(selectedMeta.id, 'view') ? (
              <ResolvedForm
                key={selectedMeta.id + (editParam || 'view')}
                voucherTypeMeta={selectedMeta}
                viewOnly
                autoPrint={!!autoPrintParam}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <p className="text-sm font-medium text-destructive">You don\'t have permission to view {selectedMeta.name} vouchers.</p>
                <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
              </div>
            )
          ) : !editParam && !viewParam && !canVoucher(selectedMeta.id, 'create') ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <p className="text-sm font-medium text-destructive">You don\'t have permission to create {selectedMeta.name} vouchers.</p>
              <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
            </div>
          ) : (
            <ResolvedForm
              key={selectedMeta.id + (editParam || 'new')}
              voucherTypeMeta={selectedMeta}
              viewOnly={!!viewParam}
              autoPrint={!!autoPrintParam}
            />
          )
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <p className="text-sm">No voucher types found.</p>
            <Button variant="outline" size="sm" onClick={() => navigate('/voucher-types')}>
              Add Voucher Types
            </Button>
          </div>
        )}
      </div>

    </div>
  );
};

export default VoucherWorkspace;
