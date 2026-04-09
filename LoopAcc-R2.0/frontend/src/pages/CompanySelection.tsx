import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Building2, Plus, LogOut, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/config/runtime';

const CompanySelection = () => {
  const { user, signOut } = useAuth();
  const { companies, loading, selectCompany, fetchCompanies } = useCompany();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCompanySelect = (company: any) => {
    selectCompany(company);
    navigate('/company-login');
  };

  const handleDeleteClick = (e: React.MouseEvent, company: any) => {
    e.stopPropagation();
    setConfirmDelete({ id: company.id, name: company.name });
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete || !user) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/companies/${confirmDelete.id}?userId=${user.id}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to delete company');

      toast({ title: 'Deleted', description: `"${confirmDelete.name}" has been deleted.` });
      await fetchCompanies();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <Building2 className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">LoopAcc</h1>
              <p className="text-sm text-muted-foreground">Select Company</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <Badge variant="secondary">{user?.email}</Badge>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={signOut}
              className="text-destructive hover:bg-destructive/10"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">Welcome to LoopAcc</h1>
            <p className="text-muted-foreground">
              Select a company to continue, or create a new company to get started.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Create New Company Card */}
            <Card 
              className="cursor-pointer hover:shadow-lg transition-all border-dashed border-2 border-primary/30 hover:border-primary/50"
              onClick={() => navigate('/create-company')}
            >
              <CardContent className="p-8 text-center">
                <div className="mb-4">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                    <Plus className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold mb-2">Create New Company</h3>
                <p className="text-sm text-muted-foreground">
                  Set up a new company with all accounting features
                </p>
              </CardContent>
            </Card>

            {/* Company Cards */}
            {loading ? (
              <div className="col-span-full text-center py-8">
                <p className="text-muted-foreground">Loading companies...</p>
              </div>
            ) : companies.length === 0 ? (
              <div className="col-span-full text-center py-8">
                <p className="text-muted-foreground">No companies found. Create your first company to get started.</p>
              </div>
            ) : (
              companies.map((company) => (
                <Card 
                  key={company.id}
                  className="cursor-pointer hover:shadow-lg transition-all"
                  onClick={() => handleCompanySelect(company)}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center">
                        <Building2 className="mr-3 h-5 w-5 text-primary" />
                        {company.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={(e) => handleDeleteClick(e, company)}
                        title="Delete company"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Country:</span>
                        <span>{company.country}</span>
                      </div>
                      {company.state && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">State:</span>
                          <span>{company.state}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Currency:</span>
                        <span>{company.currency}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">FY:</span>
                        <span>{company.financial_year_start} - {company.financial_year_end}</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t">
                      <Badge 
                        variant={company.is_active ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {company.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Company</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{confirmDelete?.name}</strong>?
              <br />
              This will permanently delete the company and all its data including vouchers, ledgers, items, and settings. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete Company'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CompanySelection;