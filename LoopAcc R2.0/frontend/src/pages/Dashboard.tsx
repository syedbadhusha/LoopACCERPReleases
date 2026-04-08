import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import SalesChart from '@/components/dashboard/SalesChart';
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
  Subtitles
} from 'lucide-react';

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const { selectedCompany, logoutFromCompany } = useCompany();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [stats, setStats] = useState({
    totalSales: 0,
    totalPurchase: 0,
    outstandingReceivables: 0,
    outstandingPayables: 0,
  });
  const currencySymbol = selectedCompany?.currency === 'INR' ? '₹' : selectedCompany?.currency === 'USD' ? '$' : selectedCompany?.currency || '₹';
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
          `http://localhost:5000/api/vouchers/report/outstanding-receivables?companyId=${selectedCompany.id}`
        );
        const receivablesJson = await receivablesResp.json();
        const receivablesData = receivablesJson?.data || [];
        const totalReceivables = receivablesData.reduce(
          (sum: number, item: any) => sum + (item.pending_amount || 0),
          0
        );

        // Fetch outstanding payables from the actual report endpoint
        const payablesResp = await fetch(
          `http://localhost:5000/api/vouchers/report/outstanding-payables?companyId=${selectedCompany.id}`
        );
        const payablesJson = await payablesResp.json();
        const payablesData = payablesJson?.data || [];
        const totalPayables = payablesData.reduce(
          (sum: number, item: any) => sum + (item.pending_amount || 0),
          0
        );

        // Fetch all vouchers for sales and purchase totals
        const resp = await fetch(`http://localhost:5000/api/vouchers?companyId=${selectedCompany.id}`);
        const json = await resp.json();
        const allVouchers = json?.data || [];

        // Filter by voucher type
        const salesData = allVouchers.filter((v: any) => v.voucher_type === 'sales');
        const purchaseData = allVouchers.filter((v: any) => v.voucher_type === 'purchase');

        const totalSales = salesData.reduce((sum: number, v: any) => sum + Number(v.net_amount || 0), 0);
        const totalPurchase = purchaseData.reduce((sum: number, v: any) => sum + Number(v.net_amount || 0), 0);

        setStats({
          totalSales,
          totalPurchase,
          outstandingReceivables: totalReceivables,
          outstandingPayables: totalPayables,
        });
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
      }
    };

    fetchStats();
  }, [selectedCompany]);

  const menuItems = [
    { 
 title: 'Masters', 
    subSections: [
      {
        subTitle: 'Accounting Masters',
        items: [
          { name: 'Group Master', icon: BookOpen, path: '/groups' },
          { name: 'Ledger Master', icon: BookOpen, path: '/ledger-master' },
          { name: 'Voucher Type Master', icon: FileText, path: '/voucher-types' },
        ]
      },
      {
        subTitle: 'Inventory Masters',
        items: [
          { name: 'Stock Group Master', icon: Package, path: '/stock-group-master' },
          { name: 'Stock Category Master', icon: Package, path: '/stock-category-master' },
          { name: 'Item Master', icon: Package, path: '/item-master' },
          { name: 'UOM Master', icon: Users, path: '/uom-master' },
        ]
      }
    ]
    },
    {
      title: 'Transactions',
      items: [
        { name: 'Vouchers', icon: FileText, path: '/vouchers' },
      ]
    },
    {
      title: 'Reports',
      items: [
        { name: 'Profit & Loss', icon: BarChart3, path: '/reports/profit-loss' },
        { name: 'Balance Sheet', icon: FileText, path: '/reports/balance-sheet' },
        { name: 'Trial Balance', icon: FileText, path: '/reports/trial-balance' },
        { name: 'Group Summary', icon: FileText, path: '/reports/group-summary' },
        { name: 'Ledger Report', icon: BookOpen, path: '/reports/ledger' },
        { name: 'Group Vouchers', icon: BookOpen, path: '/reports/group-vouchers' },
        { name: 'Voucher History',icon: BookOpen,path: '/reports/voucher-history' },
        { name: 'Sales Register',icon: BookOpen,path: '/reports/sales-register' },
        { name: 'Purchase Register',icon: BookOpen,path: '/reports/purchase-register' },
        { name: 'Stock Summary',icon: BookOpen,path: '/reports/stock-summary' },
        { name: 'Batch Summary',icon: BookOpen,path: '/reports/batch-summary' },
      ]
    }
  ];

  const quickStats = [
    { title: 'Total Sales', value: `${currencySymbol} ${stats.totalSales.toFixed(2)}`, color: 'text-green-600', path: '/reports/sales-register' },
    { title: 'Total Purchase', value: `${currencySymbol} ${stats.totalPurchase.toFixed(2)}`, color: 'text-red-600', path: '/reports/purchase-register' },
    { title: 'Outstanding Receivables', value: `${currencySymbol} ${stats.outstandingReceivables.toFixed(2)}`, color: 'text-blue-600', path: '/reports/outstanding-receivable' },
    { title: 'Outstanding Payables', value: `${currencySymbol} ${stats.outstandingPayables.toFixed(2)}`, color: 'text-orange-600', path: '/reports/outstanding-payable' },
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex-shrink-0 border-b bg-card shadow-sm">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <Building2 className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">LoopAcc</h1>
              <p className="text-sm text-muted-foreground">{selectedCompany?.name}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <Button variant="outline" size="sm" onClick={() => navigate('/company-profile')}>
              <Building2 className="mr-2 h-4 w-4" />
              Company Profile
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/settings')}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
            <Badge variant="secondary">{user?.email}</Badge>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={logoutFromCompany}
              className="text-destructive hover:bg-destructive/10"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout from Company
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
              {menuItems.map((section, sectionIndex) => (
                <div key={sectionIndex} className="mb-6">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                    {section.title}
                  </h3>
                  {/* Check if section has subSections */}
                  {section.subSections ? (
                    section.subSections.map((sub, subIndex) => (
                      <div key={subIndex} className="mb-3">
                        <h4 className="text-xs font-medium text-foreground/70 mb-1">{sub.subTitle}</h4>
                        <ul className="space-y-1">
                          {sub.items.map((item, itemIndex) => (
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
                    ))
                  ) : (
                    <ul className="space-y-1">
                      {section.items.map((item, itemIndex) => (
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

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <SalesChart />
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/vouchers?type=sales')}>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Plus className="mr-2 h-5 w-5" />
                  Create Sales Invoice
                </CardTitle>
                <CardDescription>
                  Create a new sales invoice for your customers
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/vouchers?type=purchase')}>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Plus className="mr-2 h-5 w-5" />
                  Create Purchase Invoice
                </CardTitle>
                <CardDescription>
                  Record purchases from your suppliers
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/vouchers?type=payment')}>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CreditCard className="mr-2 h-5 w-5" />
                  Payment Entry
                </CardTitle>
                <CardDescription>
                  Record payment transactions
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/vouchers?type=receipt')}>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Receipt className="mr-2 h-5 w-5" />
                  Receipt Entry
                </CardTitle>
                <CardDescription>
                  Record receipt transactions
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/ledger-master')}>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="mr-2 h-5 w-5" />
                  Ledger Master
                </CardTitle>
                <CardDescription>
                  Manage your ledger accounts
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/item-master')}>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Package className="mr-2 h-5 w-5" />
                  Item Master
                </CardTitle>
                <CardDescription>
                  Manage your inventory items and stock
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;