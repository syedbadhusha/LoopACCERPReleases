import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldAlert, LogOut, ChevronDown, ChevronRight, Users, RefreshCw, ShieldCheck, ToggleLeft, ToggleRight, CalendarDays, Ban } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/config/runtime';

const PLANS = [
  { value: 'standard', label: 'Standard', max_users: 1 },
  { value: 'premium', label: 'Premium', max_users: 5 },
  { value: 'gold', label: 'Gold', max_users: 25 },
  { value: 'platinum', label: 'Platinum', max_users: 100 },
];

const PLAN_COLORS: Record<string, string> = {
  standard: 'bg-slate-100 text-slate-700',
  premium: 'bg-blue-100 text-blue-700',
  gold: 'bg-yellow-100 text-yellow-700',
  platinum: 'bg-purple-100 text-purple-700',
};

interface LicenseUser {
  id: string;
  email: string;
  full_name: string;
  is_owner: boolean;
  status: string;
  must_change_password?: boolean;
  created_at: string;
}

interface License {
  id: string;
  plan: string;
  max_users: number;
  is_active: boolean;
  valid_until?: string | null;
  created_at: string;
  users: LicenseUser[];
}

const AdminPanel = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLicenses, setExpandedLicenses] = useState<Set<string>>(new Set());
  const [updatingPlan, setUpdatingPlan] = useState<string | null>(null);
  const [togglingStatus, setTogglingStatus] = useState<string | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<License | null>(null);

  // Force deactivate dialog
  const [confirmDeactivate, setConfirmDeactivate] = useState<License | null>(null);

  // Expiry dialog
  const [expiryDialog, setExpiryDialog] = useState<License | null>(null);
  const [expiryDate, setExpiryDate] = useState('');
  const [savingExpiry, setSavingExpiry] = useState(false);

  const token = sessionStorage.getItem('admin_token');

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const logout = () => {
    fetch(`${API_BASE_URL}/admin/logout`, { method: 'POST', headers: authHeaders }).catch(() => {});
    sessionStorage.removeItem('admin_token');
    navigate('/admin', { replace: true });
  };

  const fetchLicenses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/licenses`, { headers: authHeaders });
      if (res.status === 401) {
        sessionStorage.removeItem('admin_token');
        navigate('/admin', { replace: true });
        return;
      }
      const json = await res.json();
      if (json.success) {
        setLicenses(json.data || []);
      } else {
        toast({ title: 'Error', description: json.message, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      navigate('/admin', { replace: true });
      return;
    }
    fetchLicenses();
  }, []);

  const handlePlanChange = async (licenseId: string, plan: string) => {
    setUpdatingPlan(licenseId);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/licenses/${licenseId}/plan`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ plan }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast({ title: 'Error', description: json.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Plan Updated', description: json.message });
      setLicenses((prev) =>
        prev.map((lic) =>
          lic.id === licenseId ? { ...lic, plan, max_users: json.max_users } : lic
        )
      );
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setUpdatingPlan(null);
    }
  };

  const handleToggleStatus = async () => {
    if (!confirmToggle) return;
    const { id, is_active } = confirmToggle;
    setTogglingStatus(id);
    setConfirmToggle(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/licenses/${id}/status`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ is_active: !is_active }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast({ title: 'Error', description: json.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Status Updated', description: json.message });
      setLicenses((prev) =>
        prev.map((lic) => {
          if (lic.id !== id) return lic;
          const updated: License = { ...lic, is_active: !is_active };
          // Apply the auto-set 30-day expiry returned by the backend
          if (!is_active && json.valid_until) updated.valid_until = json.valid_until;
          return updated;
        })
      );
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setTogglingStatus(null);
    }
  };

  // --- Force deactivate ---
  const handleForceDeactivate = async () => {
    if (!confirmDeactivate) return;
    const id = confirmDeactivate.id;
    setConfirmDeactivate(null);
    setTogglingStatus(id);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/licenses/${id}/status`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ is_active: false }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast({ title: 'Error', description: json.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'License Deactivated', description: 'License has been force-deactivated.' });
      setLicenses((prev) =>
        prev.map((lic) => (lic.id === id ? { ...lic, is_active: false } : lic))
      );
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setTogglingStatus(null);
    }
  };

  // --- Expiry helpers ---
  const openExpiryDialog = (lic: License) => {
    setExpiryDialog(lic);
    setExpiryDate(lic.valid_until ? lic.valid_until.slice(0, 10) : '');
  };

  const handleSaveExpiry = async () => {
    if (!expiryDialog) return;
    setSavingExpiry(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/licenses/${expiryDialog.id}/expiry`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ valid_until: expiryDate || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast({ title: 'Error', description: json.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Expiry Updated', description: json.message });
      setLicenses((prev) =>
        prev.map((lic) =>
          lic.id === expiryDialog.id ? { ...lic, valid_until: json.valid_until } : lic
        )
      );
      setExpiryDialog(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingExpiry(false);
    }
  };

  const toggleExpand = (licenseId: string) => {
    setExpandedLicenses((prev) => {
      const next = new Set(prev);
      if (next.has(licenseId)) next.delete(licenseId);
      else next.add(licenseId);
      return next;
    });
  };

  const owner = (lic: License) => lic.users.find((u) => u.is_owner);

  const totalUsers = licenses.reduce((s, l) => s + l.users.length, 0);
  const activeCount = licenses.filter((l) => l.is_active).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm sticky top-0 z-10">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-destructive" />
            <div>
              <h1 className="text-lg font-semibold">LoopAcc Admin Panel</h1>
              <p className="text-xs text-muted-foreground">License &amp; User Management</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchLicenses} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={logout} className="text-destructive hover:bg-destructive/10">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Licenses', value: licenses.length },
            { label: 'Active Licenses', value: activeCount },
            { label: 'Total Users', value: totalUsers },
            { label: 'Inactive Licenses', value: licenses.length - activeCount },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* License list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Licenses</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading licenses…</p>
            ) : licenses.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No licenses found.</p>
            ) : (
              <div className="divide-y">
                {licenses.map((lic) => {
                  const ownerUser = owner(lic);
                  const isExpanded = expandedLicenses.has(lic.id);
                  const isExpired = lic.valid_until ? new Date(lic.valid_until) < new Date() : false;
                  return (
                    <Collapsible key={lic.id} open={isExpanded} onOpenChange={() => toggleExpand(lic.id)}>
                      <div className="px-6 py-4">
                        {/* License header row */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <CollapsibleTrigger asChild>
                            <button className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </CollapsibleTrigger>

                          {/* Owner info */}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {ownerUser?.full_name || '—'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {ownerUser?.email || 'No owner found'}
                            </p>
                          </div>

                          {/* Plan badge */}
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${PLAN_COLORS[lic.plan] || 'bg-muted'}`}>
                            {lic.plan}
                          </span>

                          {/* Users count */}
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="h-3.5 w-3.5" />
                            {lic.users.length} / {lic.max_users}
                          </div>

                          {/* Active status */}
                          <Badge variant={lic.is_active ? 'default' : 'secondary'} className="text-xs">
                            {lic.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                          {isExpired && (
                            <Badge variant="destructive" className="text-xs">Expired</Badge>
                          )}

                          {/* Plan selector */}
                          <Select
                            value={lic.plan}
                            onValueChange={(val) => handlePlanChange(lic.id, val)}
                            disabled={updatingPlan === lic.id}
                          >
                            <SelectTrigger className="h-7 w-32 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PLANS.map((p) => (
                                <SelectItem key={p.value} value={p.value} className="text-xs">
                                  {p.label} ({p.max_users} user{p.max_users > 1 ? 's' : ''})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Toggle active */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 ${lic.is_active ? 'text-green-600 hover:text-amber-600' : 'text-muted-foreground hover:text-green-600'}`}
                            title={lic.is_active ? 'Deactivate license' : 'Activate license'}
                            disabled={togglingStatus === lic.id}
                            onClick={() => setConfirmToggle(lic)}
                          >
                            {lic.is_active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                          </Button>

                          {/* Extend expiry */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => openExpiryDialog(lic)}
                            title="Update license expiry"
                          >
                            <CalendarDays className="h-3.5 w-3.5" />
                            Expiry
                          </Button>

                          {/* Force deactivate — only when active */}
                          {lic.is_active && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              title="Force deactivate license"
                              disabled={togglingStatus === lic.id}
                              onClick={() => setConfirmDeactivate(lic)}
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        {/* License ID + dates */}
                        <p className="text-[10px] text-muted-foreground mt-1 ml-6">
                          ID: {lic.id} · Created: {lic.created_at ? new Date(lic.created_at).toLocaleDateString() : '—'}
                          {' '}· Expiry: {lic.valid_until
                            ? <span className={isExpired ? 'text-destructive font-medium' : ''}>{new Date(lic.valid_until).toLocaleDateString()}{isExpired ? ' (Expired)' : ''}</span>
                            : 'None'}
                        </p>
                      </div>

                      {/* Expanded user list */}
                      <CollapsibleContent>
                        <div className="bg-muted/40 px-10 pb-4 pt-2 space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Users</p>
                          {lic.users.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No users.</p>
                          ) : (
                            lic.users.map((u) => (
                              <div key={u.id} className="flex items-center gap-3 text-sm">
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <span className="text-xs font-semibold text-primary">
                                    {(u.full_name || u.email).charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium">{u.full_name || '—'}</span>
                                  <span className="text-muted-foreground ml-2 text-xs">{u.email}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {u.is_owner && (
                                    <Badge variant="secondary" className="text-xs gap-1">
                                      <ShieldCheck className="h-3 w-3" /> Owner
                                    </Badge>
                                  )}
                                  {u.must_change_password && (
                                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
                                      Pwd change req.
                                    </Badge>
                                  )}
                                  <Badge variant={u.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                                    {u.status}
                                  </Badge>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activate/Deactivate toggle confirm */}
      <AlertDialog open={!!confirmToggle} onOpenChange={(open) => { if (!open) setConfirmToggle(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmToggle?.is_active ? 'Deactivate License?' : 'Activate License?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmToggle?.is_active
                ? 'Users under this license will no longer be able to log in.'
                : 'Users under this license will be able to log in again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirmToggle?.is_active ? 'bg-destructive hover:bg-destructive/90' : ''}
              onClick={handleToggleStatus}
            >
              {confirmToggle?.is_active ? 'Deactivate' : 'Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Force deactivate confirm */}
      <AlertDialog open={!!confirmDeactivate} onOpenChange={(open) => { if (!open) setConfirmDeactivate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Force Deactivate License?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately block all users under this license from logging in.
              {confirmDeactivate && (
                <> Owner: <strong>{confirmDeactivate.users.find((u) => u.is_owner)?.email}</strong></>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleForceDeactivate}
            >
              Force Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Expiry date dialog */}
      <Dialog open={!!expiryDialog} onOpenChange={(open) => { if (!open) setExpiryDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Update License Expiry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground">
              Owner: <span className="font-medium text-foreground">{expiryDialog?.users.find((u) => u.is_owner)?.email}</span>
            </div>
            {expiryDialog?.valid_until && (
              <div className="text-sm">
                Current expiry:{' '}
                <span className={expiryDialog.valid_until && new Date(expiryDialog.valid_until) < new Date() ? 'text-destructive font-medium' : 'font-medium'}>
                  {new Date(expiryDialog.valid_until).toLocaleDateString()}
                </span>
              </div>
            )}
            <div>
              <Label htmlFor="expiry-date">New Expiry Date</Label>
              <Input
                id="expiry-date"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Leave blank to remove expiry (no expiration).</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpiryDialog(null)} disabled={savingExpiry}>
              Cancel
            </Button>
            <Button onClick={handleSaveExpiry} disabled={savingExpiry}>
              {savingExpiry ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPanel;
