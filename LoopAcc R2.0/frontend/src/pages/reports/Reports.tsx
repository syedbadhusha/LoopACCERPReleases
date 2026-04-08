import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, BarChart3, FileText, BookOpen, Calculator, ShoppingCart, Package, History, TrendingUp, TrendingDown } from 'lucide-react';

const Reports = () => {
  const navigate = useNavigate();

  const reportTypes = [
    {
      title: 'Voucher History',
      description: 'View all vouchers with edit options',
      icon: History,
      path: '/reports/voucher-history'
    },
    {
      title: 'Sales Register',
      description: 'View all sales transactions with edit options',
      icon: ShoppingCart,
      path: '/reports/sales-register'
    },
    {
      title: 'Purchase Register',
      description: 'View all purchase transactions with edit options',
      icon: Package,
      path: '/reports/purchase-register'
    },
    {
      title: 'Profit & Loss',
      description: 'View your income and expense statement',
      icon: BarChart3,
      path: '/reports/profit-loss'
    },
    {
      title: 'Balance Sheet',
      description: 'View your assets, liabilities and equity',
      icon: FileText,
      path: '/reports/balance-sheet'
    },
    {
      title: 'Trial Balance',
      description: 'View trial balance for all accounts',
      icon: Calculator,
      path: '/reports/trial-balance'
    },
    {
      title: 'Group Summary',
      description: 'Trial balance style drill-down for selected groups',
      icon: Calculator,
      path: '/reports/group-summary'
    },
    {
      title: 'Ledger Report',
      description: 'Detailed ledger account statements',
      icon: BookOpen,
      path: '/reports/ledger'
    },
    {
      title: 'Group Vouchers',
      description: 'Detailed voucher view for a selected group',
      icon: BookOpen,
      path: '/reports/group-vouchers'
    },
    {
      title: 'Stock Summary',
      description: 'View stock movements and valuations',
      icon: Package,
      path: '/reports/stock-summary'
    },
    {
      title: 'Batch Summary',
      description: 'View batch-wise closing balances for selected items',
      icon: Package,
      path: '/reports/batch-summary'
    },
    {
      title: 'Outstanding Receivables',
      description: 'View pending customer payments',
      icon: TrendingUp,
      path: '/reports/outstanding-receivable'
    },
    {
      title: 'Outstanding Payables',
      description: 'View pending supplier payments',
      icon: TrendingDown,
      path: '/reports/outstanding-payable'
    }
  ];

  return (
    <div className="bg-background h-screen flex flex-col overflow-hidden">
      <div className="flex-shrink-0 bg-background border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center">
          <Button variant="ghost" onClick={() => { if (window.history.length > 1) { navigate(-1); } else { navigate('/dashboard'); } }} className="mr-4">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Financial Reports</h1>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reports</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/reports/voucher-history')}>
                  <History className="mr-2 h-4 w-4" />
                  Voucher History
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/reports/sales-register')}>
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Sales Register
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/reports/purchase-register')}>
                  <Package className="mr-2 h-4 w-4" />
                  Purchase Register
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/reports/group-summary')}>
                  <Calculator className="mr-2 h-4 w-4" />
                  Group Summary
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/reports/group-vouchers')}>
                  <BookOpen className="mr-2 h-4 w-4" />
                  Group Vouchers
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/reports/stock-summary')}>
                  <Package className="mr-2 h-4 w-4" />
                  Stock Summary
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/reports/batch-summary')}>
                  <Package className="mr-2 h-4 w-4" />
                  Batch Summary
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {reportTypes.map((report, index) => (
                <Card key={index} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(report.path)}>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <report.icon className="mr-2 h-5 w-5" />
                      {report.title}
                    </CardTitle>
                    <CardDescription>
                      {report.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Click to generate {report.title.toLowerCase()} report
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;