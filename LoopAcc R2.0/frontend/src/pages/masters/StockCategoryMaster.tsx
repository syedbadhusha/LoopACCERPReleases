import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Plus, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';

const StockCategoryMaster = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo;
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    alias: ''
  });

  useEffect(() => {
    fetchData();
    if (location.state?.autoShowForm) {
      setShowForm(true);
    }
  }, [selectedCompany, location.state]);

  const fetchData = async () => {
    if (!selectedCompany) return;
    try {
      const res = await fetch(`http://localhost:5000/api/stock-categories?companyId=${selectedCompany.id}`);
      const json = await res.json();
      if (json && json.success) setCategories(json.data || []);
    } catch (error) {
      console.error('Error fetching stock categories:', error);
      setCategories([]);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      alias: ''
    });
    setEditingCategory(null);
    setShowForm(false);
  };

  const handleEdit = (category: any) => {
    setFormData({
      name: category.name,
      alias: category.alias || ''
    });
    setEditingCategory(category);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    setLoading(true);

    try {
      const dupCheck = categories.find(c => c.name?.toLowerCase() === formData.name.trim().toLowerCase());

      if (dupCheck && (!editingCategory || dupCheck.id !== editingCategory.id)) {
        toast({
          title: "Duplicate name",
          description: "A stock category with this name already exists.",
          variant: "destructive"
        });
        return;
      }

      const dataToSave = {
        name: formData.name.trim(),
        alias: formData.alias.trim() || null,
        company_id: selectedCompany.id
      };

      if (editingCategory) {
        const resp = await fetch(`http://localhost:5000/api/stock-categories/${editingCategory.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSave)
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'Update failed');
        toast({ title: "Success", description: "Stock category updated successfully!" });
      } else {
        const resp = await fetch(`http://localhost:5000/api/stock-categories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSave)
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'Insert failed');
        toast({ title: "Success", description: "Stock category created successfully!" });
      }
      
      fetchData();
      resetForm();
      
      if (returnTo) {
        navigate(returnTo);
      }
    } catch (error: any) {
      console.error('Error saving stock category:', error);
      toast({
        title: "Error",
        description: "Failed to save stock category",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this stock category?')) return;

    try {
      const resp = await fetch(`http://localhost:5000/api/stock-categories/${id}`, { method: 'DELETE' });
      const json = await resp.json();
      if (!json.success) throw new Error(json.message || 'Delete failed');
      toast({ title: "Success", description: "Stock category deleted successfully!" });
      fetchData();
    } catch (error) {
      console.error('Error deleting stock category:', error);
      toast({
        title: "Error",
        description: "Failed to delete stock category",
        variant: "destructive"
      });
    }
  };

  if (!selectedCompany) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mt-10">
            <h2 className="text-xl font-semibold text-muted-foreground">
              Please select a company to manage stock categories
            </h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background h-screen flex flex-col overflow-hidden">
      <div className="flex-shrink-0 bg-background border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Button variant="ghost" onClick={() => { if (window.history.length > 1) { navigate(-1); } else { navigate('/dashboard'); } }} className="mr-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Stock Category Master</h1>
              <p className="text-sm text-muted-foreground">{selectedCompany.name}</p>
            </div>
          </div>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Category
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">

        <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingCategory ? 'Edit Stock Category' : 'Add New Stock Category'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Category Name *</Label>
                    <Input 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="Enter category name"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label>Alias</Label>
                    <Input 
                      value={formData.alias}
                      onChange={(e) => setFormData({...formData, alias: e.target.value})}
                      placeholder="Enter alias"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : (editingCategory ? 'Update' : 'Save')}
                  </Button>
                </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Alias</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell>{category.alias || '-'}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(category)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDelete(category.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
};

export default StockCategoryMaster;
