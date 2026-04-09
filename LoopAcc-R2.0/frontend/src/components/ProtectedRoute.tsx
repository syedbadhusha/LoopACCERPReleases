import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireCompanyLogin?: boolean;
}

const ProtectedRoute = ({ children, requireCompanyLogin = false }: ProtectedRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const { currentSession, isRestoringSession, loading: companyLoading } = useCompany();

  // Show loading while restoring session
  if (authLoading || isRestoringSession || companyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // If company login is required but no session exists, redirect to company selection
  if (requireCompanyLogin && !currentSession) {
    return <Navigate to="/company-selection" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;