import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { useCompany } from './CompanyContext';
import { API_BASE_URL } from '@/config/runtime';
// ─── Permission Keys ─────────────────────────────────────────────────────────
// Keep in sync with backend/routes/companyUsers.js  ALL_PERMISSIONS

export const PERMISSIONS = {
  // Masters (CRUD)
  master_group_view: 'Group Master: View',
  master_group_create: 'Group Master: Create',
  master_group_edit: 'Group Master: Edit',
  master_group_delete: 'Group Master: Delete',
  master_ledger_view: 'Ledger Master: View',
  master_ledger_create: 'Ledger Master: Create',
  master_ledger_edit: 'Ledger Master: Edit',
  master_ledger_delete: 'Ledger Master: Delete',
  master_vouchertype_view: 'Voucher Type Master: View',
  master_vouchertype_create: 'Voucher Type Master: Create',
  master_vouchertype_edit: 'Voucher Type Master: Edit',
  master_vouchertype_delete: 'Voucher Type Master: Delete',
  master_item_view: 'Item Master: View',
  master_item_create: 'Item Master: Create',
  master_item_edit: 'Item Master: Edit',
  master_item_delete: 'Item Master: Delete',
  master_uom_view: 'UOM Master: View',
  master_uom_create: 'UOM Master: Create',
  master_uom_edit: 'UOM Master: Edit',
  master_uom_delete: 'UOM Master: Delete',
  master_stockgroup_view: 'Stock Group Master: View',
  master_stockgroup_create: 'Stock Group Master: Create',
  master_stockgroup_edit: 'Stock Group Master: Edit',
  master_stockgroup_delete: 'Stock Group Master: Delete',
  master_stockcategory_view: 'Stock Category Master: View',
  master_stockcategory_create: 'Stock Category Master: Create',
  master_stockcategory_edit: 'Stock Category Master: Edit',
  master_stockcategory_delete: 'Stock Category Master: Delete',
  // Reports
  report_profitloss: 'Profit & Loss',
  report_balancesheet: 'Balance Sheet',
  report_trialbalance: 'Trial Balance',
  report_groupsummary: 'Group Summary',
  report_ledger: 'Ledger Report',
  report_groupvouchers: 'Group Vouchers',
  report_voucherhistory: 'Voucher History',
  report_salesregister: 'Sales Register',
  report_purchaseregister: 'Purchase Register',
  report_stocksummary: 'Stock Summary',
  report_batchsummary: 'Batch Summary',
  report_outstanding_receivable: 'Outstanding Receivables',
  report_outstanding_payable: 'Outstanding Payables',
  // Dashboard Permissions
  dashboard_total_sales: 'Dashboard: Total Sales',
  dashboard_total_purchase: 'Dashboard: Total Purchase',
  dashboard_outstanding_receivable: 'Dashboard: Outstanding Receivables',
  dashboard_outstanding_payable: 'Dashboard: Outstanding Payables',
  dashboard_pos_hold: 'Dashboard: POS Hold',
  dashboard_cash_in_hand: 'Dashboard: Cash in Hand',
  dashboard_bank_accounts: 'Dashboard: Bank Accounts',
  dashboard_bar_chart: 'Dashboard: Bar Chart',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

// Grouped for UI display
export const MASTER_PERMISSIONS = [
  { key: 'master_group', label: 'Group Master' },
  { key: 'master_ledger', label: 'Ledger Master' },
  { key: 'master_vouchertype', label: 'Voucher Type Master' },
  { key: 'master_item', label: 'Item Master' },
  { key: 'master_uom', label: 'UOM Master' },
  { key: 'master_stockgroup', label: 'Stock Group Master' },
  { key: 'master_stockcategory', label: 'Stock Category Master' },
];

export const PERMISSION_GROUPS: { label: string; keys: PermissionKey[] }[] = [
  {
    label: 'Masters',
    keys: [
      // All master CRUD keys
      'master_group_view','master_group_create','master_group_edit','master_group_delete',
      'master_ledger_view','master_ledger_create','master_ledger_edit','master_ledger_delete',
      'master_vouchertype_view','master_vouchertype_create','master_vouchertype_edit','master_vouchertype_delete',
      'master_item_view','master_item_create','master_item_edit','master_item_delete',
      'master_uom_view','master_uom_create','master_uom_edit','master_uom_delete',
      'master_stockgroup_view','master_stockgroup_create','master_stockgroup_edit','master_stockgroup_delete',
      'master_stockcategory_view','master_stockcategory_create','master_stockcategory_edit','master_stockcategory_delete',
    ],
  },
  {
    label: 'Reports',
    keys: [
      'report_profitloss',
      'report_balancesheet',
      'report_trialbalance',
      'report_groupsummary',
      'report_ledger',
      'report_groupvouchers',
      'report_voucherhistory',
      'report_salesregister',
      'report_purchaseregister',
      'report_stocksummary',
      'report_batchsummary',
      'report_outstanding_receivable',
      'report_outstanding_payable',
    ],
  },
  {
    label: 'Dashboard',
    keys: [
      'dashboard_total_sales',
      'dashboard_total_purchase',
      'dashboard_outstanding_receivable',
      'dashboard_outstanding_payable',
      'dashboard_pos_hold',
      'dashboard_cash_in_hand',
      'dashboard_bank_accounts',
      'dashboard_bar_chart',
    ],
  },
];

// Per-voucher-type sub-permissions
export type VoucherAction = 'view' | 'create' | 'edit' | 'delete' | 'print';
export interface VoucherTypePermission {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  print: boolean;
}

// ─── Context Type ─────────────────────────────────────────────────────────────

interface PermissionContextType {
  permissions: Partial<Record<PermissionKey, boolean>>;
  voucher_permissions: Record<string, VoucherTypePermission>;
  isAdmin: boolean;
  loading: boolean;
  /** Returns true if the current user has the given permission (admin always returns true) */
  can: (key: PermissionKey) => boolean;
  /** Returns true if the current user has the given action on the given voucher type ID */
  canVoucher: (voucherTypeId: string, action: VoucherAction) => boolean;
  /** Re-fetch permissions from the server */
  refreshPermissions: () => Promise<void>;
}

const PermissionContext = createContext<PermissionContextType | null>(null);

export const usePermissions = () => {
  const ctx = useContext(PermissionContext);
  if (!ctx) throw new Error('usePermissions must be used within PermissionProvider');
  return ctx;
};

// ─── Provider ─────────────────────────────────────────────────────────────────

interface PermissionProviderProps {
  children: ReactNode;
}

export const PermissionProvider = ({ children }: PermissionProviderProps) => {
  const { currentUser, selectedCompany } = useCompany();
  const [permissions, setPermissions] = useState<Partial<Record<PermissionKey, boolean>>>({});
  const [voucher_permissions, setVoucherPermissions] = useState<Record<string, VoucherTypePermission>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!currentUser || !selectedCompany) {
      setPermissions({});
      setVoucherPermissions({});
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    // Admin is determined by the company user record
    if (currentUser.is_admin) {
      // Grant all permissions locally — no need to call API
      const all = Object.fromEntries(
        Object.keys(PERMISSIONS).map((k) => [k, true])
      ) as Record<PermissionKey, boolean>;
      setPermissions(all);
      setIsAdmin(true);
      // Admin voucher permissions: fetch all types and grant everything
      try {
        const res = await fetch(
          `${API_BASE_URL}/company-users/${selectedCompany.id}/my-permissions?companyUserId=${currentUser.id}`
        );
        const json = await res.json();
        if (json.success) setVoucherPermissions(json.voucher_permissions || {});
      } catch { /* ignore */ }
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/company-users/${selectedCompany.id}/my-permissions?companyUserId=${currentUser.id}`
      );
      const json = await res.json();
      if (json.success) {
        setIsAdmin(json.is_admin || false);
        setPermissions(json.permissions || {});
        setVoucherPermissions(json.voucher_permissions || {});
      }
    } catch (err) {
      console.error('Failed to load permissions:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, selectedCompany?.id]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const can = useCallback(
    (key: PermissionKey): boolean => {
      if (isAdmin) return true;
      return permissions[key] === true;
    },
    [isAdmin, permissions]
  );

  const canVoucher = useCallback(
    (voucherTypeId: string, action: VoucherAction): boolean => {
      if (isAdmin) return true;
      return voucher_permissions[voucherTypeId]?.[action] === true;
    },
    [isAdmin, voucher_permissions]
  );

  return (
    <PermissionContext.Provider
      value={{ permissions, voucher_permissions, isAdmin, loading, can, canVoucher, refreshPermissions: fetchPermissions }}
    >
      {children}
    </PermissionContext.Provider>
  );
};
