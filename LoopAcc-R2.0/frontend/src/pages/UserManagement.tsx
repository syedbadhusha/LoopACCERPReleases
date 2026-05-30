import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { ArrowLeft, Plus, Trash2, Eye, EyeOff, Users, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/config/runtime';

interface LicenseUser {
  id: string;
  email: string;
  full_name: string;
  is_owner: boolean;
  status: string;
  must_change_password?: boolean;
  last_login?: string;
  created_at: string;
}

const UserManagement = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [users, setUsers] = useState<LicenseUser[]>([]);
  const [maxUsers, setMaxUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<LicenseUser | null>(null);
  const [removing, setRemoving] = useState(false);
  const [showTempPassword, setShowTempPassword] = useState(false);
  const [addLoading, setAddLoading] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
    tempPassword: '',
  });

  const licenseId = user?.license_id;
  const isOwner = !!user?.is_owner;

  useEffect(() => {
    if (!licenseId) return;
    fetchUsers();
  }, [licenseId]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/users/${licenseId}`);
      const json = await res.json();
      if (json.success) {
        setUsers(json.data || []);
        setMaxUsers(json.max_users || 0);
      } else {
        toast({ title: 'Error', description: json.message, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setAddLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/add-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerUserId: user.id,
          email: formData.email,
          fullName: formData.fullName,
          tempPassword: formData.tempPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast({ title: 'Error', description: json.message, variant: 'destructive' });
        return;
      }
      toast({
        title: 'User Added',
        description: `${formData.fullName} added. They must change their password on first login.`,
      });
      setAddDialogOpen(false);
      setFormData({ email: '', fullName: '', tempPassword: '' });
      await fetchUsers();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget || !user) return;
    setRemoving(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/auth/users/${removeTarget.id}?ownerUserId=${user.id}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast({ title: 'Error', description: json.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'User Removed', description: `${removeTarget.full_name} has been removed.` });
      setRemoveTarget(null);
      await fetchUsers();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setRemoving(false);
    }
  };

  if (!licenseId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">No license found for your account.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center space-x-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/company-selection')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Users className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-lg font-semibold">User Management</h1>
              <p className="text-xs text-muted-foreground">License Users — {users.length} / {maxUsers} seats used</p>
            </div>
          </div>

          {isOwner && (
            <Button
              size="sm"
              onClick={() => setAddDialogOpen(true)}
              disabled={users.length >= maxUsers}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">
        {/* License usage bar */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">License Seats</span>
              <span className="text-sm text-muted-foreground">{users.length} of {maxUsers} used</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  users.length >= maxUsers ? 'bg-destructive' : 'bg-primary'
                }`}
                style={{ width: `${Math.min((users.length / maxUsers) * 100, 100)}%` }}
              />
            </div>
            {users.length >= maxUsers && (
              <p className="text-xs text-destructive mt-1">
                Seat limit reached. Contact support to increase your plan.
              </p>
            )}
          </CardContent>
        </Card>

        {/* User list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Users under this License</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading users…</p>
            ) : (
              <div className="space-y-3">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-sm font-semibold text-primary">
                          {(u.full_name || u.email).charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{u.full_name || '—'}</span>
                          {u.is_owner && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <ShieldCheck className="h-3 w-3" /> Owner
                            </Badge>
                          )}
                          {u.must_change_password && (
                            <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
                              Password change required
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={u.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                        {u.status}
                      </Badge>
                      {isOwner && !u.is_owner && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setRemoveTarget(u)}
                          title="Remove user"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add User Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddUser} className="space-y-4 pt-2">
            <div>
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="Enter full name"
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="user@example.com"
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="tempPassword">Temporary Password</Label>
              <div className="relative mt-1">
                <Input
                  id="tempPassword"
                  type={showTempPassword ? 'text' : 'password'}
                  value={formData.tempPassword}
                  onChange={(e) => setFormData({ ...formData, tempPassword: e.target.value })}
                  placeholder="Min 6 characters"
                  required
                  minLength={6}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowTempPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showTempPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                The user will be required to change this on first login.
              </p>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)} disabled={addLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={addLoading}>
                {addLoading ? 'Adding…' : 'Add User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{removeTarget?.full_name}</strong> ({removeTarget?.email}) from this license?
              They will no longer be able to log in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleRemove}
              disabled={removing}
            >
              {removing ? 'Removing…' : 'Remove User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserManagement;
