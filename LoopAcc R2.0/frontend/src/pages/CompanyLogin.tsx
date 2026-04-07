import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '@/contexts/CompanyContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Building2, LogIn } from 'lucide-react';

const CompanyLogin = () => {
  const navigate = useNavigate();
  const { selectedCompany, currentSession, loginToCompany, loading, isRestoringSession } = useCompany();
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');

  // Handle redirects in useEffect
  useEffect(() => {
    if (isRestoringSession) {
      return; // Wait for session restoration
    }

    // If session is active, redirect to dashboard immediately
    if (currentSession) {
      navigate('/dashboard', { replace: true });
      return;
    }

    // If no selected company, redirect to selection
    if (!selectedCompany) {
      navigate('/company-selection', { replace: true });
    }
  }, [isRestoringSession, currentSession, selectedCompany, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const { error } = await loginToCompany(credentials.username, credentials.password);
    if (error) {
      // Handle both string and object errors
      const errorMessage = typeof error === 'string' ? error : error.message || 'Invalid username or password';
      setError(errorMessage);
    } else {
      navigate('/dashboard');
    }
  };

  // Wait for session restoration before checking selectedCompany
  if (isRestoringSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render if redirecting
  if (currentSession || !selectedCompany) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <Building2 className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">LoopAcc</h1>
              <p className="text-sm text-muted-foreground">Company Login</p>
            </div>
          </div>
          
          <Button variant="ghost" onClick={() => navigate('/company-selection')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Companies
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="max-w-md mx-auto">
          <div className="mb-8 text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Building2 className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Login to {selectedCompany.name}
            </h1>
            <p className="text-muted-foreground">
              Enter your credentials to access the company
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <LogIn className="mr-2 h-5 w-5" />
                Company Login
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                <div>
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={credentials.username}
                    onChange={(e) => setCredentials({...credentials, username: e.target.value})}
                    placeholder="Enter your username"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={credentials.password}
                    onChange={(e) => setCredentials({...credentials, password: e.target.value})}
                    placeholder="Enter your password"
                    required
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Logging in...' : 'Login to Company'}
                </Button>
              </form>

              {/* Company Info */}
              <div className="mt-6 pt-6 border-t">
                <h4 className="font-medium mb-2">Company Details</h4>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div>{selectedCompany.address}</div>
                  <div>{selectedCompany.city}, {selectedCompany.state}</div>
                  <div>{selectedCompany.country} - {selectedCompany.postal_code}</div>
                  <div className="flex justify-between pt-2">
                    <span>Currency:</span>
                    <span>{selectedCompany.currency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax Type:</span>
                    <span>{selectedCompany.tax_type}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CompanyLogin;