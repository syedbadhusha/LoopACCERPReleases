import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SearchableDropdown from '@/components/ui/searchable-dropdown';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Plus, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';

const StockGroupMaster = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo;
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(false);
  const [stockGroups, setStockGroups] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    alias: '',
    parent_group_id: 'none'
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
      const res = await fetch(`http://localhost:5000/api/stock-groups?companyId=${selectedCompany.id}`);
      const json = await res.json();
      if (!json.success) {
        setStockGroups([]);
        return;
      }
      const data = json.data || [];
      // Build parent lookup
      const map = new Map(data.map((g: any) => [g.id, g]));
      const transformed = data.map((g: any) => ({
        ...g,
        parent: g.parent_group_id ? { name: (map.get(g.parent_group_id) as any)?.name } : null
      }));
      setStockGroups(transformed);
    } catch (error) {
      console.error('Error fetching stock groups:', error);
      setStockGroups([]);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      alias: '',
      parent_group_id: 'none'
    });
    setEditingGroup(null);
    setShowForm(false);
  };

  const handleEdit = (group: any) => {
    setFormData({
      name: group.name,
      alias: group.alias || '',
      parent_group_id: group.parent_group_id || 'none'
    });
    setEditingGroup(group);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    setLoading(true);

    try {
      const dupCheck = stockGroups.find(sg => sg.name?.toLowerCase() === formData.name.trim().toLowerCase());

      if (dupCheck && (!editingGroup || dupCheck.id !== editingGroup.id)) {
        toast({
          title: "Duplicate name",
          description: "A stock group with this name already exists.",
          variant: "destructive"
        });
        return;
      }

      const dataToSave = {
        name: formData.name.trim(),
        alias: formData.alias.trim() || null,
        parent_group_id: formData.parent_group_id && formData.parent_group_id !== 'none' ? formData.parent_group_id : null,
        company_id: selectedCompany.id
      };

      if (editingGroup) {
        const resp = await fetch(`http://localhost:5000/api/stock-groups/${editingGroup.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSave)
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'Update failed');
        toast({ title: "Success", description: "Stock group updated successfully!" });
      } else {
        const resp = await fetch(`http://localhost:5000/api/stock-groups`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSave)
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'Insert failed');
        toast({ title: "Success", description: "Stock group created successfully!" });
      }
      
      await fetchData();
      resetForm();
      
      if (returnTo) {
        navigate(returnTo);
      }
    } catch (error: any) {
      console.error('Error saving stock group:', error);
      toast({
        title: "Error",
        description: "Failed to save stock group",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this stock group?')) return;

    try {
      const resp = await fetch(`http://localhost:5000/api/stock-groups/${id}`, { method: 'DELETE' });
      const json = await resp.json();
      if (!json.success) throw new Error(json.message || 'Delete failed');
      toast({ title: "Success", description: "Stock group deleted successfully!" });
      fetchData();
    } catch (error) {
      console.error('Error deleting stock group:', error);
      toast({
        title: "Error",
        description: "Failed to delete stock group",
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
              Please select a company to manage stock groups
            </h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Button variant="ghost" onClick={() => { if (window.history.length > 1) { navigate(-1); } else { navigate('/dashboard'); } }} className="mr-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">Stock Group Master</h1>
          </div>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Stock Group
          </Button>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm text-muted-foreground">Selected Company</Label>
                <p className="font-medium">{selectedCompany.name}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {showForm ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{editingGroup ? 'Edit Stock Group' : 'Add New Stock Group'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Group Name *</Label>
                    <Input 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="Enter group name"
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

                  <div>
                    <Label>Under Group (Optional)</Label>
                    <div className="flex gap-2">
                      <SearchableDropdown
                        value={formData.parent_group_id}
                        onValueChange={(value) => setFormData({ ...formData, parent_group_id: value })}
                        placeholder="Select parent group (optional)"
                        options={[
                          { value: 'none', label: 'None (Primary Group)' },
                          ...stockGroups
                            .filter((g) => !editingGroup || g.id !== editingGroup.id)
                            .map((group) => ({ value: group.id, label: group.name })),
                        ]}
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => {
                        const returnPath = window.location.pathname;
                        navigate('/stock-group-master', { state: { returnTo: returnPath, autoShowForm: true } });
                      }}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-4">
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : (editingGroup ? 'Update' : 'Save')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Stock Groups List</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Alias</TableHead>
                  <TableHead>Under Group</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockGroups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="font-medium">{group.name}</TableCell>
                    <TableCell>{group.alias || '-'}</TableCell>
                    <TableCell>{group.parent?.name || 'Primary Group'}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(group)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDelete(group.id)}>
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
  );
};

export default StockGroupMaster;
