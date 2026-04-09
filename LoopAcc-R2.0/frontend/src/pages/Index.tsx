import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Building2, ArrowRight } from 'lucide-react';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const { user, loading } = useAuth();

  // Show loading while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect authenticated users to dashboard
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <div className="text-center max-w-2xl px-4">
        <div className="flex justify-center mb-8">
          <Building2 className="h-16 w-16 text-primary" />
        </div>
        <h1 className="text-5xl font-bold mb-4 text-foreground">LoopAcc</h1>
        <p className="text-xl text-muted-foreground mb-8">
          Complete Accounting Software Solution
        </p>
        <div className="space-y-4">
          <p className="text-base text-muted-foreground mb-8">
            Manage your business finances with our comprehensive accounting software featuring 
            ledger management, inventory tracking, sales & purchase invoicing, and detailed reporting.
          </p>
          <Button size="lg" className="text-lg px-8" onClick={() => window.location.href = '/auth'}>
            Get Started
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
        
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <div className="p-6 rounded-lg bg-card border">
            <h3 className="font-semibold mb-2">Master Management</h3>
            <p className="text-sm text-muted-foreground">
              Ledger Master, Item Master, and UOM management
            </p>
          </div>
          <div className="p-6 rounded-lg bg-card border">
            <h3 className="font-semibold mb-2">Transaction Processing</h3>
            <p className="text-sm text-muted-foreground">
              Sales, Purchase, Payment, and Receipt vouchers
            </p>
          </div>
          <div className="p-6 rounded-lg bg-card border">
            <h3 className="font-semibold mb-2">Reports & Analytics</h3>
            <p className="text-sm text-muted-foreground">
              P&L, Balance Sheet, Trial Balance and more
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
