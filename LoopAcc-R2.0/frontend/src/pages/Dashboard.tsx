import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { usePermissions } from '@/contexts/PermissionContext';
import { useCallback } from 'react';
import { isCompanyBillsEnabled, isCompanyBatchesEnabled, isCompanyPOSEnabled } from '@/lib/companyTax';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import SalesChart from '@/components/dashboard/SalesChart';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API_BASE_URL } from '@/config/runtime';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { 
  BookOpen, 
  Package, 
  Receipt, 
  CreditCard, 
  Users, 
  Settings, 
  LogOut,
  Building2,
  BarChart3,
  FileText,
  Plus,
  ShoppingCart,
  Subtitles,
  Wallet,
  PauseCircle,
  Calendar,
  CalendarDays,
} from 'lucide-react';

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const { selectedCompany, currentUser,logoutFromCompany, periodFrom, periodTo, setPeriod, currentDate, setCurrentDate } = useCompany();
  const { can, canVoucher, isAdmin, voucher_permissions, refreshPermissions } = usePermissions();
    // Always refresh permissions on mount to avoid stale role/permission data
    useEffect(() => {
      refreshPermissions();
    }, [refreshPermissions]);
  // Fetch voucher types for POS/non-POS logic
  const [voucherTypes, setVoucherTypes] = useState([]);
  useEffect(() => {
    if (!selectedCompany) return;
    fetch(`${API_BASE_URL}/voucher-types?companyId=${selectedCompany.id}`)
      .then((r) => r.json())
      .then((json) => setVoucherTypes(json.data || []))
      .catch(() => setVoucherTypes([]));
  }, [selectedCompany]);

  // Helper to get is_pos for a voucher type id
  const isPosVoucherType = (typeId) => {
    const vt = voucherTypes.find((v) => v.id === typeId);
    return vt && vt.is_pos;
  };
  // Track if user has create access to any non-POS voucher type (by is_pos)
  const hasVoucherCreate = Object.entries(voucher_permissions || {}).some(
    ([typeId, vp]) => vp.create && !isPosVoucherType(typeId)
  );
  // Track if user has create access to any POS voucher type (by is_pos)
  const hasPOSVoucherCreate = Object.entries(voucher_permissions || {}).some(
    ([typeId, vp]) => vp.create && isPosVoucherType(typeId)
  );
  const navigate = useNavigate();
  const { toast } = useToast();

  // Period dialog
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState(periodFrom);
  const [tempTo, setTempTo] = useState(periodTo);

  // Current date dialog
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [tempCurrentDate, setTempCurrentDate] = useState(currentDate);

  const openPeriodDialog = () => {
    setTempFrom(periodFrom);
    setTempTo(periodTo);
    setPeriodDialogOpen(true);
  };

  const applyPeriod = () => {
    if (tempFrom && tempTo && tempFrom <= tempTo) {
      setPeriod(tempFrom, tempTo);
      setPeriodDialogOpen(false);
    } else {
      toast({ title: 'Invalid period', description: 'From date must be before To date.', variant: 'destructive' });
    }
  };

  const openDateDialog = () => {
    setTempCurrentDate(currentDate);
    setDateDialogOpen(true);
  };

  const applyCurrentDate = () => {
    if (tempCurrentDate && tempCurrentDate >= periodFrom && tempCurrentDate <= periodTo) {
      setCurrentDate(tempCurrentDate);
      setDateDialogOpen(false);
    } else {
      toast({ title: 'Invalid date', description: `Date must be within the current period (${periodFrom} to ${periodTo}).`, variant: 'destructive' });
    }
  };

  const [stats, setStats] = useState({
    totalSales: 0,
    totalPurchase: 0,
    outstandingReceivables: 0,
    outstandingPayables: 0,
    cashBalance: 0,
    bankBalance: 0,
    cashGroupId: '',
    bankGroupId: '',
  });
  const currencySymbol = selectedCompany?.currency === 'INR' ? '₹' : selectedCompany?.currency === 'USD' ? '$' : selectedCompany?.currency || '₹';
  const billsEnabled = isCompanyBillsEnabled(selectedCompany);
  const batchesEnabled = isCompanyBatchesEnabled(selectedCompany);
  const posEnabled = isCompanyPOSEnabled(selectedCompany);

  const [holdBillsOpen, setHoldBillsOpen] = useState(false);
  const [holdVouchers, setHoldVouchers] = useState<any[]>([]);
  const [holdLoading, setHoldLoading] = useState(false);

  const openHoldBills = async () => {
    if (!selectedCompany) return;
    setHoldLoading(true);
    setHoldBillsOpen(true);
    try {
      const res = await fetch(`${API_BASE_URL}/vouchers/report/held-pos?companyId=${selectedCompany.id}`);
      const json = await res.json();
      setHoldVouchers(json.data || []);
    } catch {
      toast({ title: 'Error', description: 'Could not load held bills', variant: 'destructive' });
    } finally {
      setHoldLoading(false);
    }
  };
  // Check for email confirmation
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('confirmed') === 'true') {
      toast({
        title: "Account Activated!",
        description: "Your account has been successfully activated."
      });
    }
  }, [toast]);

  // Fetch dashboard stats
  useEffect(() => {
    const fetchStats = async () => {
      if (!selectedCompany) return;

      try {
        // Fetch outstanding receivables from the actual report endpoint
        const receivablesResp = await fetch(
          `${API_BASE_URL}/vouchers/report/outstanding-receivables?companyId=${selectedCompany.id}`
        );
        const receivablesJson = await receivablesResp.json();
        const receivablesData = receivablesJson?.data || [];
        const totalReceivables = receivablesData.reduce(
          (sum: number, item: any) => sum + (item.pending_amount || 0),
          0
        );

        // Fetch outstanding payables from the actual report endpoint
        const payablesResp = await fetch(
          `${API_BASE_URL}/vouchers/report/outstanding-payables?companyId=${selectedCompany.id}`
        );
        const payablesJson = await payablesResp.json();
        const payablesData = payablesJson?.data || [];
        const totalPayables = payablesData.reduce(
          (sum: number, item: any) => sum + (item.pending_amount || 0),
          0
        );

        // Fetch vouchers filtered by current period for sales and purchase totals
        const resp = await fetch(
          `${API_BASE_URL}/vouchers?companyId=${selectedCompany.id}&dateFrom=${periodFrom}&dateTo=${periodTo}`
        );
        const json = await resp.json();
        const allVouchers = json?.data || [];

        // Filter by voucher type
        const salesData = allVouchers.filter((v: any) => v.voucher_type === 'sales');
        const purchaseData = allVouchers.filter((v: any) => v.voucher_type === 'purchase');

        const totalSales = salesData.reduce((sum: number, v: any) => sum + Number(v.net_amount || 0), 0);
        const totalPurchase = purchaseData.reduce((sum: number, v: any) => sum + Number(v.net_amount || 0), 0);

        // Fetch groups to get Cash-in-Hand / Bank Accounts IDs
        const groupsResp = await fetch(`${API_BASE_URL}/groups?companyId=${selectedCompany.id}`);
        const groupsJson = await groupsResp.json();
        const allGroups: any[] = groupsJson?.data || [];
        const cashGroup = allGroups.find((g: any) => g.name === 'Cash-in-Hand');
        const bankGroup = allGroups.find((g: any) => g.name === 'Bank Accounts');

        // Fetch current-date balance for cash/bank (all-time: opening + all transactions up to today)
        const fyTo = new Date().toISOString().slice(0, 10);
        const bsParams = new URLSearchParams({ companyId: selectedCompany.id, dateFrom: '1900-01-01', dateTo: fyTo });
        const bsResp = await fetch(`${API_BASE_URL}/ledgers/report/balance-sheet?${bsParams}`);
        const bsJson = await bsResp.json();
        const allLedgers: any[] = bsJson?.data || [];
        // opening is the master opening balance (signed); debit/credit are all-time transaction movements
        const toLedgerBal = (l: any) => (l.opening || 0) + (l.debit || 0) - (l.credit || 0);
        const cashBalance = allLedgers
          .filter((l: any) => l.group?.name === 'Cash-in-Hand')
          .reduce((sum: number, l: any) => sum + toLedgerBal(l), 0);
        const bankBalance = allLedgers
          .filter((l: any) => l.group?.name === 'Bank Accounts')
          .reduce((sum: number, l: any) => sum + toLedgerBal(l), 0);

        setStats({
          totalSales,
          totalPurchase,
          outstandingReceivables: totalReceivables,
          outstandingPayables: totalPayables,
          cashBalance,
          bankBalance,
          cashGroupId: cashGroup?.id || '',
          bankGroupId: bankGroup?.id || '',
        });
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
      }
    };

    fetchStats();
  }, [selectedCompany, periodFrom, periodTo]);

  // ...existing code...

  // Dashboard menuItems (unchanged, but POS removed)
  type PermissionKey = Parameters<typeof can>[0];
  const menuItems = [
    { 
      title: 'Masters', 
      subSections: [
        {
          subTitle: 'Accounting Masters',
          items: [
            { name: 'Group Master', icon: BookOpen, path: '/groups', permkey: 'master_group_view' as PermissionKey },
            { name: 'Ledger Master', icon: BookOpen, path: '/ledger-master', permkey: 'master_ledger_view' as PermissionKey },
            { name: 'Voucher Type Master', icon: FileText, path: '/voucher-types', permkey: 'master_vouchertype_view' as PermissionKey },
          ]
        },
        {
          subTitle: 'Inventory Masters',
          items: [
            { name: 'Stock Group Master', icon: Package, path: '/stock-group-master', permkey: 'master_stockgroup_view' as PermissionKey },
            { name: 'Stock Category Master', icon: Package, path: '/stock-category-master', permkey: 'master_stockcategory_view' as PermissionKey },
            { name: 'Item Master', icon: Package, path: '/item-master', permkey: 'master_item_view' as PermissionKey },
            { name: 'UOM Master', icon: Users, path: '/uom-master', permkey: 'master_uom_view' as PermissionKey },
          ]
        }
      ]
    },
    {
      title: 'Transactions',
      items: [
        ...(hasVoucherCreate ? [{ name: 'Vouchers', icon: FileText, path: '/vouchers', permkey: null }] : []),
        // Show POS menu only if POS is enabled for the company AND user has create access to a POS voucher type
        ...(posEnabled && hasPOSVoucherCreate ? [{ name: 'POS', icon: FileText, path: '/pos', permkey: null }] : []),
      ]
    },
    {
      title: 'Reports',
      items: [
        { name: 'Profit & Loss', icon: BarChart3, path: '/reports/profit-loss', permkey: 'report_profitloss' as PermissionKey },
        { name: 'Balance Sheet', icon: FileText, path: '/reports/balance-sheet', permkey: 'report_balancesheet' as PermissionKey },
        { name: 'Trial Balance', icon: FileText, path: '/reports/trial-balance', permkey: 'report_trialbalance' as PermissionKey },
        { name: 'Group Summary', icon: FileText, path: '/reports/group-summary', permkey: 'report_groupsummary' as PermissionKey },
        { name: 'Ledger Report', icon: BookOpen, path: '/reports/ledger', permkey: 'report_ledger' as PermissionKey },
        { name: 'Group Vouchers', icon: BookOpen, path: '/reports/group-vouchers', permkey: 'report_groupvouchers' as PermissionKey },
        { name: 'Voucher History',icon: BookOpen,path: '/reports/voucher-history', permkey: 'report_voucherhistory' as PermissionKey },
        { name: 'Sales Register',icon: BookOpen,path: '/reports/sales-register', permkey: 'report_salesregister' as PermissionKey },
        { name: 'Purchase Register',icon: BookOpen,path: '/reports/purchase-register', permkey: 'report_purchaseregister' as PermissionKey },
        { name: 'Stock Summary',icon: BookOpen,path: '/reports/stock-summary', permkey: 'report_stocksummary' as PermissionKey },
        { name: 'Outstanding Receivables', icon: CreditCard, path: '/reports/outstanding-receivable', permkey: 'report_outstanding_receivable' as PermissionKey },
        { name: 'Outstanding Payables', icon: CreditCard, path: '/reports/outstanding-payable', permkey: 'report_outstanding_payable' as PermissionKey },
        ...(batchesEnabled ? [{ name: 'Batch Summary',icon: BookOpen,path: '/reports/batch-summary', permkey: 'report_batchsummary' as PermissionKey }] : []),
      ]
    }
  ];

  // Dashboard quick stats with permission checks
  const safeNumber = (val: any) => (typeof val === 'number' && !isNaN(val) ? val : 0);
  const quickStats = [
    can('dashboard_total_sales') && { title: 'Total Sales', value: `${currencySymbol} ${safeNumber(stats.totalSales).toFixed(2)}`, color: 'text-green-600', path: '/reports/sales-register' },
    can('dashboard_total_purchase') && { title: 'Total Purchase', value: `${currencySymbol} ${safeNumber(stats.totalPurchase).toFixed(2)}`, color: 'text-red-600', path: '/reports/purchase-register' },
    ...(billsEnabled ? [
      can('dashboard_outstanding_receivable') && { title: 'Outstanding Receivables', value: `${currencySymbol} ${safeNumber(stats.outstandingReceivables).toFixed(2)}`, color: 'text-blue-600', path: '/reports/outstanding-receivable' },
      can('dashboard_outstanding_payable') && { title: 'Outstanding Payables', value: `${currencySymbol} ${safeNumber(stats.outstandingPayables).toFixed(2)}`, color: 'text-orange-600', path: '/reports/outstanding-payable' },
    ] : []),
  ].filter(Boolean);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex-shrink-0 border-b bg-card shadow-sm">
        <p className="flex h-18 items-center justify-between px-6">{selectedCompany?.name}</p>
        <div className="flex h-18 items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <Building2 className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">LoopAcc</h1>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="outline" size="sm" onClick={openDateDialog}>
              <CalendarDays className="mr-2 h-4 w-4" />
              {currentDate}
            </Button>
            <Button variant="outline" size="sm" onClick={openPeriodDialog}>
              <Calendar className="mr-2 h-4 w-4" />
              {periodFrom} → {periodTo}
            </Button>
            {currentUser?.is_admin && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate('/company-profile')}
              disabled={!currentUser?.is_admin}
              title={!currentUser?.is_admin ? 'Only company admin can access profile' : ''}
            >
              <Building2 className="mr-2 h-4 w-4" />
              Company Profile
            </Button>)}
            <Button variant="outline" size="sm" onClick={() => navigate('/settings')}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
            {/* <Badge variant="secondary">{user?.email}</Badge> */}
            <div>
              <h1 className="text-lg font-semibold text-foreground">{(currentUser?.username)?.toLocaleUpperCase()}</h1>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={logoutFromCompany}
              className="text-destructive hover:bg-destructive/10"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout Company
            </Button>
          </div>
        </div>
      </header>
       <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r bg-card overflow-y-auto">
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-4 text-foreground">Menu</h2>
            <nav className="space-y-6">
              {/* Admin-only: User Management */}
              {isAdmin && (
                <div className="mb-2">
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-left h-auto py-2 text-primary"
                    onClick={() => navigate('/company-user-management')}
                  >
                    <Users className="mr-3 h-4 w-4" />
                    User Management
                  </Button>
                </div>
              )}
              {menuItems.map((section, sectionIndex) => (
                <div key={sectionIndex} className="mb-6">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                    {section.title}
                  </h3>
                  {/* Check if section has subSections */}
                  {section.subSections ? (
                    section.subSections.map((sub, subIndex) => {
                      const visibleItems = sub.items.filter((item) => can(item.permkey as PermissionKey));
                      if (visibleItems.length === 0) return null;
                      return (
                        <div key={subIndex} className="mb-3">
                          <h4 className="text-xs font-medium text-foreground/70 mb-1">{sub.subTitle}</h4>
                          <ul className="space-y-1">
                            {visibleItems.map((item, itemIndex) => (
                              <li key={itemIndex}>
                                <Button
                                  variant="ghost"
                                  className="w-full justify-start text-left h-auto py-2"
                                  onClick={() => navigate(item.path)}
                                >
                                  <item.icon className="mr-3 h-4 w-4" />
                                  {item.name}
                                </Button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })
                  ) : (
                    <ul className="space-y-1">
                      {section.items.filter((item) => item.permkey === null || can(item.permkey as PermissionKey)).map((item, itemIndex) => (
                        <li key={itemIndex}>
                          <Button
                            variant="ghost"
                            className="w-full justify-start text-left h-auto py-2"
                            onClick={() => navigate(item.path)}
                          >
                            <item.icon className="mr-3 h-4 w-4" />
                            {item.name}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground mb-2">Dashboard</h1>
            <p className="text-muted-foreground">
              Welcome to LoopAcc - Your complete accounting solution
            </p>
          </div>

          {/* Quick Stats (top buttons) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-4">
            {quickStats.map((stat, index) => (
              <Card 
                key={index}
                className={stat.path ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
                onClick={() => stat.path && navigate(stat.path)}
              >
                <CardHeader className="pb-2">
                  <CardDescription className="text-sm">{stat.title}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className={`text-2xl font-bold ${stat.color}`}>{stat.value}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
            {/* Cash in Hand card (permission) */}
            {can('dashboard_cash_in_hand') && stats.cashGroupId && (
              <Card
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => {
                  const fyYear = new Date().getMonth() < 3 ? new Date().getFullYear() - 1 : new Date().getFullYear();
                  navigate(`/reports/group-summary?groupId=${stats.cashGroupId}&dateFrom=${fyYear}-04-01&dateTo=${new Date().toISOString().slice(0, 10)}`);
                }}
              >
                <CardHeader className="pb-2">
                  <CardDescription className="text-sm flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5 text-purple-600" />
                    Cash in Hand
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold text-purple-600">
                    {currencySymbol} {Math.abs(stats.cashBalance).toFixed(2)}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">Current Balance ({stats.cashBalance >= 0 ? 'Dr' : 'Cr'})</p>
                </CardContent>
              </Card>
            )}
            {/* Bank Accounts card (permission) */}
            {can('dashboard_bank_accounts') && stats.bankGroupId && (
              <Card
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => {
                  const fyYear = new Date().getMonth() < 3 ? new Date().getFullYear() - 1 : new Date().getFullYear();
                  navigate(`/reports/group-summary?groupId=${stats.bankGroupId}&dateFrom=${fyYear}-04-01&dateTo=${new Date().toISOString().slice(0, 10)}`);
                }}
              >
                <CardHeader className="pb-2">
                  <CardDescription className="text-sm flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5 text-blue-600" />
                    Bank Accounts
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold text-blue-600">
                    {currencySymbol} {Math.abs(stats.bankBalance).toFixed(2)}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">Current Balance ({stats.bankBalance >= 0 ? 'Dr' : 'Cr'})</p>
                </CardContent>
              </Card>
            )}
            {/* Hold Bills card — Dashboard permission */}
            {can('dashboard_pos_hold') && posEnabled && (
              <Card
                className="cursor-pointer hover:shadow-md transition-shadow border-amber-200"
                onClick={openHoldBills}
              >
                <CardHeader className="pb-2">
                  <CardDescription className="text-sm flex items-center gap-1.5">
                    <PauseCircle className="h-3.5 w-3.5 text-amber-500" />
                    Hold Bills
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-amber-500">POS</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">View &amp; resume held bills</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Bar Chart (SalesChart) with dashboard permission */}
          {can('dashboard_bar_chart') && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <SalesChart />
            </div>
          )}

          {/* Quick Actions removed as requested */}
        </main>
      </div>

      {/* Change Current Date Dialog */}
      <Dialog open={dateDialogOpen} onOpenChange={setDateDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Change Current Date
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="current-date">Current Date</Label>
            <Input
              id="current-date"
              type="date"
              value={tempCurrentDate}
              min={periodFrom}
              max={periodTo}
              onChange={(e) => setTempCurrentDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Must be within {periodFrom} to {periodTo}</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDateDialogOpen(false)}>Cancel</Button>
            <Button onClick={applyCurrentDate}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Period Dialog */}
      <Dialog open={periodDialogOpen} onOpenChange={setPeriodDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Change Period
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="period-from">From Date</Label>
              <Input
                id="period-from"
                type="date"
                value={tempFrom}
                onChange={(e) => setTempFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="period-to">To Date</Label>
              <Input
                id="period-to"
                type="date"
                value={tempTo}
                onChange={(e) => setTempTo(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPeriodDialogOpen(false)}>Cancel</Button>
            <Button onClick={applyPeriod}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hold Bills Dialog */}
      <Dialog open={holdBillsOpen} onOpenChange={setHoldBillsOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PauseCircle className="h-4 w-4 text-amber-500" /> Hold Bills
            </DialogTitle>
            <DialogDescription>
              List of all held (on-hold) POS bills for this company. Select a bill to retake or settle.
            </DialogDescription>
          </DialogHeader>
          {holdLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : holdVouchers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No held bills found.</p>
          ) : (
            <div className="divide-y max-h-80 overflow-y-auto">
              {holdVouchers.map((v: any) => (
                <div key={v.id} className="flex items-center justify-between py-2 px-1 hover:bg-muted/50 rounded">
                  <div>
                    <p className="text-sm font-medium">{v.voucher_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.voucher_date} · {currencySymbol}{Number(v.net_amount || 0).toFixed(2)} · {(v.inventory?.length || v.details?.length || 0)} item(s)
                    </p>
                    {v.narration && <p className="text-xs text-muted-foreground italic">{v.narration}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => {
                      setHoldBillsOpen(false);
                      navigate(`/pos?edit=${v.id}`);
                    }}
                  >
                    Open
                  </Button>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setHoldBillsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;