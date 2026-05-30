import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCompany } from '@/contexts/CompanyContext';
import { API_BASE_URL } from '@/config/runtime';

const CompanyProfile = () => {
  const { currentUser } = useCompany();
  const navigate = useNavigate();
  useEffect(() => {
    if (currentUser && !currentUser.is_admin) {
      navigate('/dashboard');
    }
  }, [currentUser, navigate]);
  const location = useLocation() as {
    state?: {
      returnTo?: string;
    };
  };
  const returnTo = location.state?.returnTo;
  const { toast } = useToast();
  const { selectedCompany, updateSelectedCompany } = useCompany();
  const [loading, setLoading] = useState(false);
  interface CompanyFormData {
  name: string;
  address: string;
  country: string;
  state: string;
  city: string;
  postal_code: string;
  currency: string;
  tax_registration_number: string;
  tax_type: string;
  financial_year_start: string;
  financial_year_end: string;
}
  const [formData, setFormData] = useState<CompanyFormData>({
    name: '',
    address: '',
    country: 'India',
    state: '',
    city: '',
    postal_code: '',
    currency: 'INR',
    tax_registration_number: '',
    tax_type: 'GST',
    financial_year_start: '',
    financial_year_end: '',
  });

  useEffect(() => {
    if (selectedCompany) {
      setFormData({
        name: selectedCompany.name || '',
        address: selectedCompany.address || '',
        country: selectedCompany.country || 'India',
        state: selectedCompany.state || '',
        city: selectedCompany.city || '',
        postal_code: selectedCompany.postal_code || '',
        currency: selectedCompany.currency || 'INR',
        tax_registration_number: selectedCompany.tax_registration_number || '',
        tax_type: selectedCompany.tax_type || 'GST',
        financial_year_start: selectedCompany.financial_year_start? selectedCompany.financial_year_start.split('T')[0]: '',
        financial_year_end: selectedCompany.financial_year_end? selectedCompany.financial_year_end.split('T')[0]: '',
      });
    }
  }, [selectedCompany]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/companies/${selectedCompany.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateData: formData,
          userId: currentUser?.user_id || currentUser?.id
        })
      });      
  const json = await resp.json();
    if (!resp.ok || !json.success) {
        throw new Error(json.message || 'Failed to update company');
    }
  const updatedCompany = {
          ...selectedCompany,
          ...formData,
        };
  updateSelectedCompany(updatedCompany);      
      // Navigate back to previous page or dashboard
      if (returnTo) {
        navigate(returnTo);
      } else {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Error updating company:', error);
      toast({
        title: "Error",
        description: "Failed to update company profile",
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
          <Button variant="ghost" onClick={() => { if (returnTo) { navigate(returnTo);} else {navigate('/dashboard');} }} className="mr-4">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Company Profile</h1>
        </div>
        {!selectedCompany ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-center text-muted-foreground">Please select a company to update profile information.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="company-name">Company Name</Label>
                    <Input 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="Enter company name"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="country">Country</Label>
                    <Select value={formData.country} onValueChange={(value) => setFormData({...formData, country: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Country" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="India">India</SelectItem>
                        <SelectItem value="United States">United States</SelectItem>
                        <SelectItem value="United Kingdom">United Kingdom</SelectItem>
                        <SelectItem value="Canada">Canada</SelectItem>
                        <SelectItem value="Australia">Australia</SelectItem>
                        <SelectItem value="Germany">Germany</SelectItem>
                        <SelectItem value="France">France</SelectItem>
                        <SelectItem value="Japan">Japan</SelectItem>
                        <SelectItem value="Singapore">Singapore</SelectItem>
                        <SelectItem value="UAE">UAE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="state">State</Label>
                    <Input 
                      id="state"
                      value={formData.state}
                      onChange={(e) => setFormData({...formData, state: e.target.value})}
                      placeholder="Enter state"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input 
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData({...formData, city: e.target.value})}
                      placeholder="Enter city"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="postal-code">Postal Code</Label>
                    <Input 
                      id="postal-code"
                      value={formData.postal_code}
                      onChange={(e) => setFormData({...formData, postal_code: e.target.value})}
                      placeholder="Enter postal code"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="currency">Currency</Label>
                    <Input 
                      id="currency"
                      value={formData.currency}
                      onChange={(e) => setFormData({...formData, currency: e.target.value.toUpperCase()})}
                      placeholder="Enter currency"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="tax-registration-number">Tax Registration Number</Label>
                    <Input 
                      id="tax-registration-number"
                      value={formData.tax_registration_number}
                      onChange={(e) => setFormData({...formData, tax_registration_number: e.target.value.toUpperCase()})}
                      placeholder="Enter tax registration number"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="tax-type">Tax Type</Label>
                    <Input 
                      id="tax-type"
                      value={formData.tax_type}
                      onChange={(e) => setFormData({...formData, tax_type: e.target.value.toUpperCase()})}
                      placeholder="Enter tax type (GST, VAT, etc.)"
                    />
                  </div>
                  
                  <div className="md:col-span-2">
                    <Label htmlFor="address">Address</Label>
                    <Textarea 
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      placeholder="Enter complete address"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="financial-year-start">Financial Year Start</Label>
                    <Input 
                      type="date"
                      id="financial-year-start"
                      value={formData.financial_year_start}
                      onChange={(e) => setFormData({...formData, financial_year_start: e.target.value})}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="financial-year-end">Financial Year End</Label>
                    <Input 
                      type="date"
                      id="financial-year-end"
                      value={formData.financial_year_end}
                      onChange={(e) => setFormData({...formData, financial_year_end: e.target.value})}
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-4 pt-6">
                  <Button type="button" variant="outline" onClick={() => {if (returnTo) {navigate(returnTo);} else {navigate('/dashboard');}}}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CompanyProfile;