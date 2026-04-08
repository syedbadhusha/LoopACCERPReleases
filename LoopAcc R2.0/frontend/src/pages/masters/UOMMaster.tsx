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
import SearchableDropdown from '@/components/ui/searchable-dropdown';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Plus, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';

const UOMMaster = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo;
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(false);
  const [uoms, setUoms] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingUom, setEditingUom] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    symbol: '',
    decimal_places: 2
  });

  useEffect(() => {
    fetchData();
  }, [selectedCompany]);

  // Auto-show form if navigated from another page with autoShowForm flag
  useEffect(() => {
    if (location.state?.autoShowForm) {
      setShowForm(true);
    }
  }, [location.state?.autoShowForm]);

  const fetchData = async () => {
    if (!selectedCompany) return;
    try {
      const res = await fetch(`http://localhost:5000/api/uom?companyId=${selectedCompany.id}`);
      const json = await res.json();
      if (json && json.success) setUoms(json.data || []);
    } catch (error) {
      console.error('Error fetching UOMs:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      symbol: '',
      decimal_places: 2
    });
    setEditingUom(null);
    setShowForm(false);
  };

  const handleEdit = (uom: any) => {
    setFormData({
      name: uom.name,
      symbol: uom.symbol || '',
      decimal_places: uom.decimal_places
    });
    setEditingUom(uom);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    setLoading(true);

    try {
      // Client-side duplicate check for UOM name (case-insensitive)
      const dupCheck = uoms.find(u => u.name?.toLowerCase() === formData.name.trim().toLowerCase());

      if (dupCheck && (!editingUom || dupCheck.id !== editingUom.id)) {
        toast({
          title: "Duplicate name",
          description: "A UOM with this name already exists in this company.",
          variant: "destructive"
        });
        return;
      }
      const dataToSave = {
        ...formData,
        company_id: selectedCompany.id
      };
      if (editingUom) {
        const resp = await fetch(`http://localhost:5000/api/uom/${editingUom.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSave)
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'Update failed');
        toast({ title: "Success", description: "UOM updated successfully!" });
      } else {
        const resp = await fetch(`http://localhost:5000/api/uom`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSave)
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'Insert failed');
        toast({ title: "Success", description: "UOM created successfully!" });
      }
      
      fetchData();
      resetForm();
      
      // Navigate back to return path if provided, with flag to keep form open
      if (returnTo) {
        navigate(returnTo, { state: { keepFormOpen: true } });
      }
    } catch (error: any) {
      const message = error?.code === '23505'
        ? 'A UOM with this name already exists in this company.'
        : 'Failed to save UOM';
      console.error('Error saving UOM:', error);
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this UOM?')) return;

    try {
      const resp = await fetch(`http://localhost:5000/api/uom/${id}`, { method: 'DELETE' });
      const json = await resp.json();
      if (!json.success) throw new Error(json.message || 'Delete failed');
      toast({ title: "Success", description: "UOM deleted successfully!" });
      fetchData();
    } catch (error) {
      console.error('Error deleting UOM:', error);
      toast({
        title: "Error",
        description: "Failed to delete UOM",
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
              Please select a company to manage UOMs
            </h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background h-screen flex flex-col overflow-hidden">
      <div className="flex-shrink-0 bg-background border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Button variant="ghost" onClick={() => { if (window.history.length > 1) { navigate(-1); } else { returnTo ? navigate(returnTo) : navigate('/dashboard'); } }} className="mr-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Unit of Measure Master</h1>
              <p className="text-sm text-muted-foreground">{selectedCompany.name}</p>
            </div>
          </div>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add UOM
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">

        <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingUom ? 'Edit UOM' : 'Add New UOM'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  <div>
                    <Label>UOM Name</Label>
                    <Input 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="Enter UOM name (e.g., Kilogram, Piece, Meter)"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label>Symbol</Label>
                    <Input 
                      value={formData.symbol}
                      onChange={(e) => setFormData({...formData, symbol: e.target.value})}
                      placeholder="Enter symbol (e.g., kg, pcs, m)"
                    />
                  </div>
                  
                  <div>
                    <Label>Decimal Places</Label>
                    <SearchableDropdown
                      value={formData.decimal_places.toString()}
                      onValueChange={(value) => setFormData({ ...formData, decimal_places: parseInt(value || '0') || 0 })}
                      placeholder="Select decimal places"
                      options={['0', '1', '2', '3', '4'].map((value) => ({ value, label: value }))}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : (editingUom ? 'Update' : 'Save')}
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
                  <TableHead>Symbol</TableHead>
                  <TableHead>Decimal Places</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uoms.map((uom) => (
                  <TableRow key={uom.id}>
                    <TableCell className="font-medium">{uom.name}</TableCell>
                    <TableCell>{uom.symbol}</TableCell>
                    <TableCell>{uom.decimal_places}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(uom)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDelete(uom.id)}>
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

export default UOMMaster;