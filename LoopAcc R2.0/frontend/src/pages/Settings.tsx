import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { getCompanyTaxType, isCompanyTaxEnabled } from '@/lib/companyTax';
import { API_BASE_URL } from '@/config/runtime';

const Settings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo;
  const { toast } = useToast();
  const { selectedCompany, updateSelectedCompany } = useCompany();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<any>({});
  
  const currencySymbol = selectedCompany?.currency === 'INR' ? '₹' : selectedCompany?.currency === 'USD' ? '$' : selectedCompany?.currency || '₹';
  const defaultSettings = {
    auto_backup: 'true',
    backup_frequency: 'daily',
    invoice_prefix: 'INV',
    invoice_starting_number: '1',
    bill_prefix: 'BILL',
    bill_starting_number: '1',
    payment_prefix: 'PAY',
    payment_starting_number: '1',
    receipt_prefix: 'REC',
    receipt_starting_number: '1',
    decimal_places: '2',
    date_format: 'dd/mm/yyyy',
    currency_symbol: currencySymbol,
    gst_applicable: 'true',
    show_discount_column: 'false',

    email_invoice: 'false'
  };
  const companyTaxType = getCompanyTaxType(selectedCompany);
  const taxLabel = companyTaxType === 'GST' ? 'GST' : companyTaxType === 'VAT' ? 'VAT' : 'Tax';
  const taxApplicableKey = companyTaxType === 'VAT' ? 'vat_applicable' : 'gst_applicable';

  useEffect(() => {
    if (selectedCompany) {
      fetchSettings();
    }
  }, [selectedCompany]);

  const fetchSettings = async () => {
    if (!selectedCompany) return;

    try {
      const resp = await fetch(`http://localhost:5000/api/settings?companyId=${selectedCompany.id}`);
      if (!resp.ok) throw new Error('Failed to fetch settings');
      
      const json = await resp.json();
      const settingsMap: any = {};
      if (json?.data) {
        json.data.forEach((setting: any) => {
          settingsMap[setting.setting_key] = setting.setting_value;
        });
      }
      
      const merged = { ...defaultSettings, ...settingsMap };
      setSettings(merged);

      // Sync the latest settings from DB into the company context so all forms
      // (payment/receipt etc.) immediately reflect the correct enable_bills value
      // without needing to call updateSetting first.
      updateSelectedCompany({
        settings: {
          ...(selectedCompany.settings || {}),
          ...settingsMap,
        } as any,
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const updateSetting = async (key: string, value: string) => {
    if (!selectedCompany) return;

    try {
      const resp = await fetch(`http://localhost:5000/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: selectedCompany.id,
          setting_key: key,
          setting_value: value,
          setting_type: 'string'
        })
      });
      
      if (!resp.ok) throw new Error('Failed to update setting');

      setSettings((prev: any) => {
        const next = { ...prev, [key]: value };
        // Keep both flags aligned so all screens see the same tax on/off state.
        if (key === 'gst_applicable' || key === 'vat_applicable' || key === 'enable_tax') {
          next.gst_applicable = value;
          next.vat_applicable = value;
          next.enable_tax = value;
        }
        return next;
      });

      // Immediately sync selected company settings in context so masters/vouchers react without re-login.
      const mergedSettings = {
        ...(selectedCompany.settings || {}),
        [key]: value,
      } as Record<string, string>;
      if (key === 'gst_applicable' || key === 'vat_applicable' || key === 'enable_tax') {
        mergedSettings.gst_applicable = value;
        mergedSettings.vat_applicable = value;
        mergedSettings.enable_tax = value;
      }
      updateSelectedCompany({ settings: mergedSettings as any });
    } catch (error) {
      console.error('Error updating setting:', error);
      toast({
        title: "Error",
        description: "Failed to update setting",
        variant: "destructive"
      });
    }
  };

  const handleSaveAll = async () => {
    if (!selectedCompany) return;
    setLoading(true);

    try {
      const settingsArray = Object.entries(settings).map(([key, value]) => ({
        company_id: selectedCompany.id,
        setting_key: key,
        setting_value: value as string,
        setting_type: 'string'
      }));

      const resp = await fetch(`http://localhost:5000/api/settings/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: selectedCompany.id,
          settings: settingsArray
        })
      });

      if (!resp.ok) throw new Error('Failed to save settings');

      // Sync selected company settings in context after batch save.
      updateSelectedCompany({
        settings: {
          ...(selectedCompany.settings || {}),
          ...settings,
        } as any,
      });
      
      toast({
        title: "Success",
        description: "Settings saved successfully!"
      });

      // Navigate back to previous page or dashboard
      if (returnTo) {
        navigate(returnTo);
      } else {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center mb-6">
          <Button variant="ghost" onClick={() => { if (window.history.length > 1) { navigate(-1); } else { navigate('/dashboard'); } }} className="mr-4">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>

        <div className="space-y-6">
          {selectedCompany && (
            <Card>
              <CardHeader>
                <CardTitle>Company Information</CardTitle>
              </CardHeader>
              <CardContent>
                <Label>Selected Company</Label>
                <Input value={selectedCompany.name} readOnly className="bg-muted" />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Date Format</Label>
                  <Select 
                    value={settings.date_format || 'dd/mm/yyyy'} 
                    onValueChange={(value) => updateSetting('date_format', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dd/mm/yyyy">DD/MM/YYYY</SelectItem>
                      <SelectItem value="mm/dd/yyyy">MM/DD/YYYY</SelectItem>
                      <SelectItem value="yyyy-mm-dd">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* <div>
                  <Label>Currency Symbol</Label>
                  <Input 
                    value={settings.currency_symbol || '₹'}
                    onChange={(e) => updateSetting('currency_symbol', e.target.value)}
                    placeholder="Enter currency symbol"
                  />
                </div> */}
                
                <div>
                  <Label>Decimal Places</Label>
                  <Select 
                    value={settings.decimal_places || '2'} 
                    onValueChange={(value) => updateSetting('decimal_places', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0</SelectItem>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>{taxLabel} Applicable</Label>
                    <p className="text-sm text-muted-foreground">Enable {taxLabel} calculations</p>
                  </div>
                  <Switch 
                    checked={isCompanyTaxEnabled({ ...selectedCompany, settings })}
                    onCheckedChange={(checked) => updateSetting(taxApplicableKey, checked.toString())}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Show Discount Column</Label>
                    <p className="text-sm text-muted-foreground">Show discount column in sales and purchase forms</p>
                  </div>
                  <Switch 
                    checked={settings.show_discount_column === 'true'}
                    onCheckedChange={(checked) => {
                      updateSetting('show_discount_column', checked.toString());
                      if (!checked) updateSetting('discount_entry_mode', 'percent');
                    }}
                  />
                </div>

                {settings.show_discount_column === 'true' && (
                  <div className="flex items-center justify-between pl-4 border-l-2 border-muted">
                    <div>
                      <Label>Discount Entry Mode</Label>
                      <p className="text-sm text-muted-foreground">Which field the user types into manually</p>
                    </div>
                    <Select
                      value={settings.discount_entry_mode || 'percent'}
                      onValueChange={(val) => updateSetting('discount_entry_mode', val)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">Percentage (%)</SelectItem>
                        <SelectItem value="amount">Amount</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Bill-wise Allocation</Label>
                    <p className="text-sm text-muted-foreground">Allow bill-by-bill tracking in payment/receipt vouchers and ledger master</p>
                  </div>
                  <Switch
                    checked={settings.enable_bills !== 'false'}
                    onCheckedChange={async (checked) => {
                      if (!checked && selectedCompany) {
                        const resp = await fetch(`http://localhost:5000/api/bills/has-bills?companyId=${selectedCompany.id}`);
                        const json = await resp.json();
                        if (json.hasBills) {
                          toast({ title: 'Cannot disable', description: `${json.count} bill(s) already exist. Delete all bills before disabling.`, variant: 'destructive' });
                          return;
                        }
                      }
                      updateSetting('enable_bills', checked.toString());
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Batch Tracking</Label>
                    <p className="text-sm text-muted-foreground">Allow batch-wise stock tracking in item master and inventory vouchers</p>
                  </div>
                  <Switch
                    checked={settings.enable_batches !== 'false'}
                    onCheckedChange={async (checked) => {
                      if (!checked && selectedCompany) {
                        const resp = await fetch(`http://localhost:5000/api/batch-allocations/has-batches?companyId=${selectedCompany.id}`);
                        const json = await resp.json();
                        if (json.hasBatches) {
                          toast({ title: 'Cannot disable', description: `${json.count} batch record(s) already exist. Delete all batch records before disabling.`, variant: 'destructive' });
                          return;
                        }
                      }
                      updateSetting('enable_batches', checked.toString());
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable POS Module</Label>
                    <p className="text-sm text-muted-foreground">Enables the POS screen in Transactions and POS mode in Voucher Type Master</p>
                  </div>
                  <Switch
                    checked={settings.enable_pos === 'true'}
                    onCheckedChange={async (checked) => {
                      if (!checked && selectedCompany) {
                        const resp = await fetch(`${API_BASE_URL}/voucher-types?companyId=${selectedCompany.id}`);
                        const json = await resp.json();
                        const hasPosTypes = (json.data || []).some((vt: any) => vt.is_pos);
                        if (hasPosTypes) {
                          toast({
                            title: 'Cannot disable',
                            description: 'One or more voucher types have POS mode enabled. Disable POS mode on all voucher types first.',
                            variant: 'destructive',
                          });
                          return;
                        }
                      }
                      updateSetting('enable_pos', checked.toString());
                    }}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Email Invoice</Label>
                    <p className="text-sm text-muted-foreground">Enable email functionality for invoices</p>
                  </div>
                  <Switch 
                    checked={settings.email_invoice === 'true'}
                    onCheckedChange={(checked) => updateSetting('email_invoice', checked.toString())}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Backup Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto Backup</Label>
                  <p className="text-sm text-muted-foreground">Automatically backup data</p>
                </div>
                <Switch 
                  checked={settings.auto_backup === 'true'}
                  onCheckedChange={(checked) => updateSetting('auto_backup', checked.toString())}
                />
              </div>
              
              <div>
                <Label>Backup Frequency</Label>
                <Select 
                  value={settings.backup_frequency || 'daily'} 
                  onValueChange={(value) => updateSetting('backup_frequency', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end space-x-4">
            <Button type="button" variant="outline" onClick={() => navigate('/dashboard')}>
              Cancel
            </Button>
            <Button onClick={handleSaveAll} disabled={loading}>
              {loading ? 'Saving...' : 'Save All Settings'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;