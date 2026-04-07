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

const GroupMaster = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo;
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<any[]>([]);
  const [parentGroups, setParentGroups] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    group_type: '',
    parent_group_id: 'none',
    is_default: false
  });

  const groupTypes = [
    'Asset',
    'Liability', 
    'Income',
    'Expense'
  ];

  useEffect(() => {
    fetchData();
  }, [selectedCompany]);

  const fetchData = async () => {
    if (!selectedCompany) return;
    
    try {
      const res = await fetch(`http://localhost:5000/api/groups?companyId=${selectedCompany.id}`);
      const json = await res.json();
      if (!json.success) {
        console.error('Error fetching groups:', json.message || json);
        setGroups([]);
        setParentGroups([]);
        return;
      }

      const groupsRes = json.data || [];
      // Create a map for parent and grandparent lookups
      const groupMap = new Map(groupsRes.map((g: any) => [g.id, g]));

      // Transform to match expected format with parent and grandparent names
      const transformedGroups = groupsRes.map((g: any) => {
        let grandparentName: string | null = null;
        if (g.parent_id) {
          const parentGroup = groupMap.get(g.parent_id) as any;
          if (parentGroup?.parent_id) {
            const grandparentGroup = groupMap.get(parentGroup.parent_id) as any;
            grandparentName = grandparentGroup?.name || null;
          }
        }

        return {
          ...g,
          group_type: g.nature || g.group_type, // Map nature to group_type for UI compatibility
          parent_group_id: g.parent_id,
          is_default: g.is_system || g.is_default,
          parent: g.parent_id ? { name: (groupMap.get(g.parent_id) as any)?.name } : null,
          grandparent: grandparentName ? { name: grandparentName } : null
        };
      });

      setGroups(transformedGroups);
      setParentGroups(
        [...transformedGroups].sort((left: any, right: any) =>
          String(left?.name || '').localeCompare(String(right?.name || '')),
        ),
      );
    } catch (error) {
      console.error('Error in fetchData:', error);
      setGroups([]);
      setParentGroups([]);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      group_type: '',
      parent_group_id: 'none',
      is_default: false
    });
    setEditingGroup(null);
    setShowForm(false);
  };

  const handleEdit = (group: any) => {
    setFormData({
      name: group.name,
      group_type: group.group_type,
      parent_group_id: group.parent_group_id || 'none',
      is_default: group.is_default
    });
    setEditingGroup(group);
    setShowForm(true);
  };

  const availableParentGroups = parentGroups.filter((group: any) => {
    if (!editingGroup) return true;
    return group.id !== editingGroup.id;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    setLoading(true);

    try {
      // Client-side duplicate check (case-insensitive) within the same company
      const dupCheck = groups.find(g => g.name?.toLowerCase() === formData.name.trim().toLowerCase());
      if (dupCheck && (!editingGroup || dupCheck.id !== editingGroup.id)) {
        toast({
          title: "Duplicate name",
          description: "A group with this name already exists in this company.",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }

      // Transform form data to match groups table schema
      const dataToSave: any = {
        company_id: selectedCompany.id,
        name: formData.name,
        nature: formData.group_type,
        parent_id: formData.parent_group_id === 'none' ? null : formData.parent_group_id || null,
        is_system: formData.is_default
      };

      if (editingGroup) {
        const resp = await fetch(`http://localhost:5000/api/groups/${editingGroup.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSave)
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'Update failed');
        toast({ title: "Success", description: "Group updated successfully!" });
      } else {
        const resp = await fetch(`http://localhost:5000/api/groups`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSave)
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.message || 'Insert failed');
        toast({ title: "Success", description: "Group created successfully!" });
      }
      
      await fetchData();
      resetForm();

      // Navigate back to previous page if came from another page
      if (returnTo) {
        navigate(returnTo);
      }
    } catch (error: any) {
      let message = 'Failed to save group';
      
      // Handle specific error codes
      if (error?.code === '23505') {
        message = 'A group with this name already exists in this company.';
      } else if (error?.message) {
        message = error.message;
      } else if (error?.error_description) {
        message = error.error_description;
      }
      
      console.error('Error saving group:', error);
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
    if (!confirm('Are you sure you want to delete this group?')) return;

    try {
      const resp = await fetch(`http://localhost:5000/api/groups/${id}`, { method: 'DELETE' });
      const json = await resp.json();
      if (!json.success) throw new Error(json.message || 'Delete failed');
      toast({ title: "Success", description: "Group deleted successfully!" });
      fetchData();
    } catch (error) {
      console.error('Error deleting group:', error);
      toast({
        title: "Error",
        description: "Failed to delete group",
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
              Please select a company to manage groups
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
            <h1 className="text-2xl font-bold">Group Master</h1>
          </div>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Group
          </Button>
        </div>

        {/* Company Info */}
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

        {showForm && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{editingGroup ? 'Edit Group' : 'Add New Group'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Group Name</Label>
                    <Input 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="Enter group name"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label>Group Type (Nature)</Label>
                    {formData.parent_group_id !== 'none' && formData.group_type ? (
                      <div className="w-full px-3 py-2 border border-input rounded-md bg-muted text-sm font-medium flex items-center">
                        {formData.group_type}
                        <span className="ml-2 text-xs text-muted-foreground">✓ (Inherited)</span>
                      </div>
                    ) : (
                      <SearchableDropdown
                        value={formData.group_type}
                        onValueChange={(value) => setFormData({ ...formData, group_type: value })}
                        placeholder="Select Group Type"
                        options={groupTypes.map((type) => ({ value: type, label: type }))}
                      />
                    )}
                  </div>
                  
                  <div className="md:col-span-2">
                    <Label>Parent Group</Label>
                    <SearchableDropdown
                      value={formData.parent_group_id} 
                      onValueChange={(value) => {
                        if (value === 'none') {
                          // When parent is deselected, clear group type to allow manual selection
                          setFormData({
                            ...formData,
                            parent_group_id: value,
                            group_type: ''
                          });
                        } else {
                          // When parent is selected, inherit its group type
                          const selectedGroup = parentGroups.find(g => g.id === value);
                          const inheritedType = selectedGroup
                            ? (selectedGroup.group_type || (selectedGroup.nature as string) || '')
                            : '';

                          setFormData({
                            ...formData,
                            parent_group_id: value,
                            group_type: inheritedType
                          });
                        }
                      }}
                      placeholder="Select Parent Group or Primary Group"
                      options={[
                        { value: 'none', label: 'Primary Group' },
                        ...availableParentGroups.map((group) => ({
                          value: group.id,
                          label: group.name,
                        })),
                      ]}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label>Grandparent Group (Read-Only)</Label>
                    {formData.parent_group_id !== 'none' ? (
                      <div className="w-full px-3 py-2 border border-input rounded-md bg-muted text-sm flex items-center">
                        {(() => {
                          const parentGroup = groups.find(g => g.id === formData.parent_group_id);
                          const grandparentName = parentGroup?.parent?.name;
                          return grandparentName ? (
                            <>
                              <span>{grandparentName}</span>
                              <span className="ml-2 text-xs text-muted-foreground">✓ (Auto)</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground italic">-- No Grandparent --</span>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="w-full px-3 py-2 border border-input rounded-md bg-muted text-sm text-muted-foreground flex items-center italic">
                        Select a parent group first
                      </div>
                    )}
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
        )}

        <Card>
          <CardHeader>
            <CardTitle>Groups List</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Parent Group</TableHead>
                  <TableHead>Grandparent Group</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="font-medium">{group.name}</TableCell>
                    <TableCell>{group.group_type}</TableCell>
                    <TableCell>{group.parent?.name || 'Primary Group'}</TableCell>
                    <TableCell>{group.grandparent?.name || '-'}</TableCell>
                    <TableCell>{group.is_default ? 'Yes' : 'No'}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(group)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        {!group.is_default && (
                          <Button variant="outline" size="sm" onClick={() => handleDelete(group.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
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

export default GroupMaster;