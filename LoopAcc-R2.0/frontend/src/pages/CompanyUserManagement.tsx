import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '@/contexts/CompanyContext';
import { usePermissions } from '@/contexts/PermissionContext';
import { PERMISSION_GROUPS, PERMISSIONS, PermissionKey, VoucherTypePermission, MASTER_PERMISSIONS } from '@/contexts/PermissionContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { API_BASE_URL } from '@/config/runtime';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Users,
  Shield,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VoucherTypeMeta {
  id: string;
  name: string;
  base_type: string;
  is_pos?: boolean;
}

interface Role {
  id: string;
  company_id: string;
  name: string;
  permissions: Partial<Record<PermissionKey, boolean>>;
  voucher_permissions: Record<string, VoucherTypePermission>;
  created_at: string;
}

interface CompanyUser {
  id: string;
  company_id: string;
  username: string;
  full_name?: string;
  role_id: string | null;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
}

const API = `${API_BASE_URL}/company-users`;
const VOUCHER_ACTIONS: (keyof VoucherTypePermission)[] = ['view', 'create', 'edit', 'delete', 'print'];

const VTYPE_GROUPS = [
  { label: 'Sales', types: ['sales', 'credit-note'] },
  { label: 'Purchase', types: ['purchase', 'debit-note'] },
  { label: 'Financial', types: ['payment', 'receipt'] },
];

// ─── Role Dialog ──────────────────────────────────────────────────────────────

interface RoleDialogProps {
  open: boolean;
  companyId: string;
  onClose: () => void;
  onSave: (
    name: string,
    permissions: Partial<Record<PermissionKey, boolean>>,
    voucher_permissions: Record<string, VoucherTypePermission>
  ) => void;
  initial?: Role | null;
}

const RoleDialog = ({ open, companyId, onClose, onSave, initial }: RoleDialogProps) => {
  const [name, setName] = useState('');
  const [perms, setPerms] = useState<Partial<Record<PermissionKey, boolean>>>({});
  const [voucherPerms, setVoucherPerms] = useState<Record<string, VoucherTypePermission>>({});
  const [voucherTypes, setVoucherTypes] = useState<VoucherTypeMeta[]>([]);

  // Fetch voucher types when dialog opens (include POS types)
  useEffect(() => {
    if (!open || !companyId) return;
    fetch(`${API_BASE_URL}/voucher-types?companyId=${companyId}`)
      .then((r) => r.json())
      .then((json) => setVoucherTypes(json.data || []))
      .catch(() => setVoucherTypes([]));
  }, [open, companyId]);

  useEffect(() => {
    if (open) {
      setName(initial?.name || '');
      setPerms(initial?.permissions ? { ...initial.permissions } : {});
      setVoucherPerms(initial?.voucher_permissions ? { ...initial.voucher_permissions } : {});
    }
  }, [open, initial]);

  const toggle = (key: PermissionKey) => {
    setPerms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleGroup = (keys: PermissionKey[]) => {
    const allSet = keys.every((k) => perms[k]);
    const next: Partial<Record<PermissionKey, boolean>> = {};
    keys.forEach((k) => { next[k] = !allSet; });
    setPerms((prev) => ({ ...prev, ...next }));
  };

  const getVPerm = (typeId: string, action: keyof VoucherTypePermission) =>
    voucherPerms[typeId]?.[action] ?? false;

  const toggleVPerm = (typeId: string, action: keyof VoucherTypePermission) => {
    setVoucherPerms((prev) => {
      const cur = prev[typeId] || { view: false, create: false, edit: false, delete: false, print: false };
      const updated = { ...cur, [action]: !cur[action] };
      // if disabling view, disable all other actions too
      if (action === 'view' && !updated.view) {
        updated.create = false; updated.edit = false; updated.delete = false; updated.print = false;
      }
      // if enabling create/edit/delete/print, auto-enable view
      if (action !== 'view' && updated[action]) updated.view = true;
      return { ...prev, [typeId]: updated };
    });
  };

  const toggleAllActions = (typeId: string) => {
    const cur = voucherPerms[typeId] || { view: false, create: false, edit: false, delete: false, print: false };
    const allSet = VOUCHER_ACTIONS.every((a) => cur[a]);
    const all: VoucherTypePermission = { view: !allSet, create: !allSet, edit: !allSet, delete: !allSet, print: !allSet };
    setVoucherPerms((prev) => ({ ...prev, [typeId]: all }));
  };

  const toggleGroupActions = (typeIds: string[], action: keyof VoucherTypePermission) => {
    const allSet = typeIds.every((id) => getVPerm(id, action));
    setVoucherPerms((prev) => {
      const next = { ...prev };
      for (const id of typeIds) {
        const cur = next[id] || { view: false, create: false, edit: false, delete: false, print: false };
        const updated = { ...cur, [action]: !allSet };
        if (action === 'view' && !updated.view) {
          updated.create = false; updated.edit = false; updated.delete = false; updated.print = false;
        }
        if (action !== 'view' && updated[action]) updated.view = true;
        next[id] = updated;
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Role' : 'Create Role'}</DialogTitle>
          <DialogDescription>
            {initial ? 'Modify the details and permissions of this role.' : 'Enter the details and configure permissions for the new role.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="role-name">Role Name</Label>
            <Input
              id="role-name"
              placeholder="e.g. Accountant"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* ── Per-voucher-type permissions ── */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Voucher Permissions</p>
            <p className="text-xs text-muted-foreground">Configure which voucher types this role can access and what actions are allowed.</p>
            {voucherTypes.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No voucher types found for this company.</p>
            ) : (
              <div className="border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium w-[40%]">Voucher Type</th>
                      {VOUCHER_ACTIONS.map((a) => (
                        <th key={a} className="text-center px-2 py-2 font-medium capitalize">{a}</th>
                      ))}
                      <th className="text-center px-2 py-2 font-medium">All</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VTYPE_GROUPS.map(({ label, types }) => {
                      const groupVTypes = voucherTypes.filter((vt) => types.includes(vt.base_type));
                      if (groupVTypes.length === 0) return null;
                      return [
                        <tr key={`grp-${label}`} className="bg-muted/20">
                          <td colSpan={VOUCHER_ACTIONS.length + 2} className="px-3 py-1">
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
                              <div className="flex gap-3">
                                {VOUCHER_ACTIONS.map((a) => {
                                  const allSet = groupVTypes.every((vt) => getVPerm(vt.id, a));
                                  return (
                                    <label key={a} className="flex items-center gap-1 text-xs cursor-pointer">
                                      <Checkbox
                                        checked={allSet}
                                        onCheckedChange={() => toggleGroupActions(groupVTypes.map(v => v.id), a)}
                                      />
                                      <span className="capitalize">{a} all</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>,
                        ...groupVTypes.map((vt) => {
                          const allSet = VOUCHER_ACTIONS.every((a) => getVPerm(vt.id, a));
                          return (
                            <tr key={vt.id} className="border-t">
                              <td className="px-3 py-2 text-sm">{vt.name}</td>
                              {VOUCHER_ACTIONS.map((a) => (
                                <td key={a} className="text-center px-2 py-2">
                                  <Checkbox
                                    checked={getVPerm(vt.id, a)}
                                    onCheckedChange={() => toggleVPerm(vt.id, a)}
                                  />
                                </td>
                              ))}
                              <td className="text-center px-2 py-2">
                                <Checkbox
                                  checked={allSet}
                                  onCheckedChange={() => toggleAllActions(vt.id)}
                                />
                              </td>
                            </tr>
                          );
                        }),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Per-master CRUD permissions ── */}
          <div className="space-y-4">
            <p className="text-sm font-semibold">Master Permissions</p>
            <div className="border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium w-[40%]">Master</th>
                    <th className="text-center px-2 py-2 font-medium">View</th>
                    <th className="text-center px-2 py-2 font-medium">Create</th>
                    <th className="text-center px-2 py-2 font-medium">Edit</th>
                    <th className="text-center px-2 py-2 font-medium">Delete</th>
                    <th className="text-center px-2 py-2 font-medium">All</th>
                  </tr>
                </thead>
                <tbody>
                  {MASTER_PERMISSIONS.map((m) => {
                    const actions = ['view','create','edit','delete'];
                    const permKeys = actions.map((action) => `${m.key}_${action}` as PermissionKey);
                    const allChecked = permKeys.every((k) => perms[k]);
                    return (
                      <tr key={m.key} className="border-t">
                        <td className="px-3 py-2 text-sm">{m.label}</td>
                        {actions.map((action) => {
                          const permKey = `${m.key}_${action}` as PermissionKey;
                          return (
                            <td key={action} className="text-center px-2 py-2">
                              <Checkbox
                                checked={!!perms[permKey]}
                                onCheckedChange={() => toggle(permKey)}
                              />
                            </td>
                          );
                        })}
                        <td className="text-center px-2 py-2">
                          <Checkbox
                            checked={allChecked}
                            onCheckedChange={() => toggleGroup(permKeys)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {/* ── Other permissions (Reports, POS) ── */}
          <div className="space-y-4">
            <p className="text-sm font-semibold">Other Permissions</p>
            {PERMISSION_GROUPS.filter(g => g.label !== 'Masters').map((group) => {
              const allChecked = group.keys.every((k) => perms[k]);
              const someChecked = group.keys.some((k) => perms[k]);
              return (
                <div key={group.label} className="border rounded p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`grp-${group.label}`}
                      checked={allChecked}
                      data-state={allChecked ? 'checked' : someChecked ? 'indeterminate' : 'unchecked'}
                      onCheckedChange={() => toggleGroup(group.keys)}
                    />
                    <label
                      htmlFor={`grp-${group.label}`}
                      className="text-sm font-semibold cursor-pointer"
                    >
                      {group.label}
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-1 pl-6">
                    {group.keys.map((key) => (
                      <div key={key} className="flex items-center gap-2">
                        <Checkbox
                          id={`perm-${key}`}
                          checked={!!perms[key]}
                          onCheckedChange={() => toggle(key)}
                        />
                        <label htmlFor={`perm-${key}`} className="text-xs cursor-pointer">
                          {PERMISSIONS[key]}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(name.trim(), perms, voucherPerms)} disabled={!name.trim()}>
            {initial ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Add / Edit User Dialog ───────────────────────────────────────────────────

interface UserDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: { username: string; password: string; role_id: string | null }) => void;
  roles: Role[];
  initial?: CompanyUser | null;
}

const UserDialog = ({ open, onClose, onSave, roles, initial }: UserDialogProps) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUsername(initial?.username || '');
      setPassword('');
      setRoleId(initial?.role_id || null);
    }
  }, [open, initial]);

  const isEdit = !!initial;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit User' : 'Add User'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Modify the details and role of this user.' : 'Enter the details and assign a role for the new user.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="u-username">Username</Label>
            <Input
              id="u-username"
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isEdit}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="u-password">
              {isEdit ? 'New Password (leave blank to keep current)' : 'Password'}
            </Label>
            <Input
              id="u-password"
              type="password"
              placeholder={isEdit ? 'Leave blank to keep unchanged' : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select
              value={roleId || 'none'}
              onValueChange={(v) => setRoleId(v === 'none' ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No Role —</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() =>
              onSave({ username: username.trim(), password, role_id: roleId })
            }
            disabled={!isEdit && (!username.trim() || !password)}
          >
            {isEdit ? 'Update' : 'Add User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const CompanyUserManagement = () => {
  const navigate = useNavigate();
  const { selectedCompany, currentUser } = useCompany();
  const { isAdmin } = usePermissions();
  const { toast } = useToast();

  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Role dialog
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  // User dialog
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<CompanyUser | null>(null);

  const companyId = selectedCompany?.id;
  const requesterId = currentUser?.user_id;

  // Guard: only admin can access this page
  useEffect(() => {
    if (!isAdmin) {
      toast({ title: 'Access Denied', description: 'Only company admin can manage users.', variant: 'destructive' });
      navigate('/dashboard');
    }
  }, [isAdmin, navigate, toast]);

  const fetchRoles = useCallback(async () => {
    if (!companyId) return;
    setLoadingRoles(true);
    try {
      const res = await fetch(`${API}/${companyId}/roles`);
      const json = await res.json();
      if (json.success) setRoles(json.data);
    } catch {
      toast({ title: 'Error', description: 'Failed to load roles', variant: 'destructive' });
    } finally {
      setLoadingRoles(false);
    }
  }, [companyId, toast]);

  const fetchUsers = useCallback(async () => {
    if (!companyId || !requesterId) return;
    setLoadingUsers(true);
    try {
      const res = await fetch(`${API}/${companyId}/users?requesterId=${requesterId}`);
      const json = await res.json();
      if (json.success) setUsers(json.data);
    } catch {
      toast({ title: 'Error', description: 'Failed to load users', variant: 'destructive' });
    } finally {
      setLoadingUsers(false);
    }
  }, [companyId, requesterId, toast]);

  useEffect(() => {
    fetchRoles();
    fetchUsers();
  }, [fetchRoles, fetchUsers]);

  // ── Role actions ─────────────────────────────────────────────────────────

  const handleSaveRole = async (
    name: string,
    permissions: Partial<Record<PermissionKey, boolean>>,
    voucher_permissions: Record<string, VoucherTypePermission>
  ) => {
    if (!companyId || !requesterId) return;
    try {
      // Ensure all voucher type IDs are present in voucher_permissions
      // Find all voucher type IDs from the latest fetched roles (since voucherTypes is only in RoleDialog)
      let allVoucherTypeIds: string[] = [];
      if (roles.length > 0 && roles[0].voucher_permissions) {
        // Union of all voucher type IDs in all roles
        const idSet = new Set<string>();
        roles.forEach(r => Object.keys(r.voucher_permissions || {}).forEach(id => idSet.add(id)));
        allVoucherTypeIds = Array.from(idSet);
      }
      // Fallback: if no roles, try to get from voucher_permissions itself
      if (allVoucherTypeIds.length === 0) {
        allVoucherTypeIds = Object.keys(voucher_permissions);
      }
      // Compose a complete voucher_permissions object
      const completeVoucherPerms: Record<string, VoucherTypePermission> = { ...voucher_permissions };
      allVoucherTypeIds.forEach(id => {
        if (!completeVoucherPerms[id]) {
          completeVoucherPerms[id] = { view: false, create: false, edit: false, delete: false, print: false };
        }
      });
      if (editingRole) {
        const res = await fetch(`${API}/${companyId}/roles/${editingRole.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requesterId, name, permissions, voucher_permissions: completeVoucherPerms }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        toast({ title: 'Role updated' });
      } else {
        const res = await fetch(`${API}/${companyId}/roles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requesterId, name, permissions, voucher_permissions: completeVoucherPerms }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        toast({ title: 'Role created' });
      }
      setRoleDialogOpen(false);
      setEditingRole(null);
      fetchRoles();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteRole = async (role: Role) => {
    if (!companyId || !requesterId) return;
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API}/${companyId}/roles/${role.id}?requesterId=${requesterId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      toast({ title: 'Role deleted' });
      fetchRoles();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // ── User actions ─────────────────────────────────────────────────────────

  const handleSaveUser = async (data: {
    username: string;
    fullName: string;
    password: string;
    role_id: string | null;
  }) => {
    if (!companyId || !requesterId) return;
    try {
      if (editingUser) {
        const body: any = { requesterId, fullName: data.fullName, role_id: data.role_id };
        if (data.password) body.password = data.password;
        const res = await fetch(`${API}/${companyId}/users/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        toast({ title: 'User updated' });
      } else {
        const res = await fetch(`${API}/${companyId}/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requesterId, ...data }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        toast({ title: 'User added' });
      }
      setUserDialogOpen(false);
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteUser = async (u: CompanyUser) => {
    if (!companyId || !requesterId) return;
    if (!confirm(`Remove user "${u.username}"?`)) return;
    try {
      const res = await fetch(`${API}/${companyId}/users/${u.id}?requesterId=${requesterId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      toast({ title: 'User removed' });
      fetchUsers();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleUserActive = async (u: CompanyUser) => {
    if (!companyId || !requesterId) return;
    try {
      const res = await fetch(`${API}/${companyId}/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId, is_active: !u.is_active }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      toast({ title: u.is_active ? 'User deactivated' : 'User activated' });
      fetchUsers();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const getRoleName = (roleId: string | null) => {
    if (!roleId) return null;
    return roles.find((r) => r.id === roleId)?.name || null;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm">
        <div className="flex h-14 items-center px-6 gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Dashboard
          </Button>
          <h1 className="text-lg font-semibold">User Management</h1>
          <Badge variant="secondary">{selectedCompany?.name}</Badge>
        </div>
      </header>

      <div className="p-6 max-w-5xl mx-auto">
        <Tabs defaultValue="users">
          <TabsList className="mb-4">
            <TabsTrigger value="users">
              <Users className="mr-2 h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="roles">
              <Shield className="mr-2 h-4 w-4" />
              Roles
            </TabsTrigger>
          </TabsList>

          {/* ── Users Tab ── */}
          <TabsContent value="users">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Company Users</CardTitle>
                <Button
                  size="sm"
                  onClick={() => { setEditingUser(null); setUserDialogOpen(true); }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add User
                </Button>
              </CardHeader>
              <CardContent>
                {loadingUsers ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : users.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No users found.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="pb-2 pr-4 font-medium">Username</th>
                        <th className="pb-2 pr-4 font-medium">Role</th>
                        <th className="pb-2 pr-4 font-medium">Status</th>
                        <th className="pb-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">
                            {u.username}
                            {u.is_admin && (
                              <Badge variant="outline" className="ml-2 text-xs">Admin</Badge>
                            )}
                          </td>
                          <td className="py-2 pr-4">
                            {u.is_admin ? (
                              <span className="text-muted-foreground text-xs">All access</span>
                            ) : getRoleName(u.role_id) ? (
                              <Badge variant="secondary">{getRoleName(u.role_id)}</Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">No role</span>
                            )}
                          </td>
                          <td className="py-2 pr-4">
                            <Badge variant={u.is_active ? 'default' : 'destructive'}>
                              {u.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="py-2">
                            {u.is_admin ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => { setEditingUser(u); setUserDialogOpen(true); }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleToggleUserActive(u)}
                                >
                                  {u.is_active ? 'Deactivate' : 'Activate'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive"
                                  onClick={() => handleDeleteUser(u)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Roles Tab ── */}
          <TabsContent value="roles">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Roles</CardTitle>
                <Button
                  size="sm"
                  onClick={() => { setEditingRole(null); setRoleDialogOpen(true); }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Role
                </Button>
              </CardHeader>
              <CardContent>
                {loadingRoles ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No roles defined yet.</p>
                ) : (
                  <div className="space-y-3">
                    {roles.map((role) => {
                      const granted = Object.entries(role.permissions).filter(([, v]) => v).length;
                      const total = Object.keys(PERMISSIONS).length;
                      return (
                        <div
                          key={role.id}
                          className="flex items-center justify-between border rounded p-3"
                        >
                          <div>
                            <p className="font-medium text-sm">{role.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {granted} / {total} permissions enabled
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setEditingRole(role); setRoleDialogOpen(true); }}
                            >
                              <Pencil className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => handleDeleteRole(role)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <RoleDialog
        open={roleDialogOpen}
        companyId={companyId || ''}
        onClose={() => { setRoleDialogOpen(false); setEditingRole(null); }}
        onSave={handleSaveRole}
        initial={editingRole}
      />
      <UserDialog
        open={userDialogOpen}
        onClose={() => { setUserDialogOpen(false); setEditingUser(null); }}
        onSave={handleSaveUser}
        roles={roles}
        initial={editingUser}
      />
    </div>
  );
};

export default CompanyUserManagement;
