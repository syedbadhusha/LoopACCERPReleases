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

const CompanyProfile = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo;
  const { toast } = useToast();
  const { selectedCompany, updateSelectedCompany } = useCompany();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
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
    invoice_prefix: 'INV',
    invoice_starting_number: '1',
    credit_note_prefix: 'CN',
    credit_note_starting_number: '1',
    bill_prefix: 'BILL',
    bill_starting_number: '1',
    debit_note_prefix: 'DN',
    debit_note_starting_number: '1'
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
        financial_year_start: selectedCompany.financial_year_start || '',
        financial_year_end: selectedCompany.financial_year_end || '',
        invoice_prefix: selectedCompany.invoice_prefix || 'INV',
        invoice_starting_number: selectedCompany.invoice_starting_number || '1',
        credit_note_prefix: selectedCompany.credit_note_prefix || 'CN',
        credit_note_starting_number: selectedCompany.credit_note_starting_number || '1',
        bill_prefix: selectedCompany.bill_prefix || 'BILL',
        bill_starting_number: selectedCompany.bill_starting_number || '1',
        debit_note_prefix: selectedCompany.debit_note_prefix || 'DN',
        debit_note_starting_number: selectedCompany.debit_note_starting_number || '1'
      });
    }
  }, [selectedCompany]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    
    setLoading(true);

    try {
      const resp = await fetch(`http://localhost:5000/api/companies/${selectedCompany.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (!resp.ok) throw new Error('Failed to update company');
      
      const json = await resp.json();
      
      // Update the selected company in context with new data
      updateSelectedCompany(json?.data || selectedCompany);
      
      toast({
        title: "Success",
        description: "Company profile updated successfully!"
      });
      
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
          <Button variant="ghost" onClick={() => { if (window.history.length > 1) { navigate(-1); } else { navigate('/dashboard'); } }} className="mr-4">
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
                    <Label>Company Name</Label>
                    <Input 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="Enter company name"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label>Country</Label>
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
                    <Label>State</Label>
                    <Input 
                      value={formData.state}
                      onChange={(e) => setFormData({...formData, state: e.target.value})}
                      placeholder="Enter state"
                    />
                  </div>
                  
                  <div>
                    <Label>City</Label>
                    <Input 
                      value={formData.city}
                      onChange={(e) => setFormData({...formData, city: e.target.value})}
                      placeholder="Enter city"
                    />
                  </div>
                  
                  <div>
                    <Label>Postal Code</Label>
                    <Input 
                      value={formData.postal_code}
                      onChange={(e) => setFormData({...formData, postal_code: e.target.value})}
                      placeholder="Enter postal code"
                    />
                  </div>
                  
                  <div>
                    <Label>Currency</Label>
                    <Input 
                      value={formData.currency}
                      onChange={(e) => setFormData({...formData, currency: e.target.value})}
                      placeholder="Enter currency"
                    />
                  </div>
                  
                  <div>
                    <Label>Tax Registration Number</Label>
                    <Input 
                      value={formData.tax_registration_number}
                      onChange={(e) => setFormData({...formData, tax_registration_number: e.target.value.toUpperCase()})}
                      placeholder="Enter tax registration number"
                    />
                  </div>
                  
                  <div>
                    <Label>Tax Type</Label>
                    <Input 
                      value={formData.tax_type}
                      onChange={(e) => setFormData({...formData, tax_type: e.target.value})}
                      placeholder="Enter tax type (GST, VAT, etc.)"
                    />
                  </div>
                  
                  <div className="md:col-span-2">
                    <Label>Address</Label>
                    <Textarea 
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      placeholder="Enter complete address"
                      rows={3}
                    />
                  </div>
                  
                  <div>
                    <Label>Financial Year Start</Label>
                    <Input 
                      type="date"
                      value={formData.financial_year_start}
                      onChange={(e) => setFormData({...formData, financial_year_start: e.target.value})}
                    />
                  </div>
                  
                  <div>
                    <Label>Financial Year End</Label>
                    <Input 
                      type="date"
                      value={formData.financial_year_end}
                      onChange={(e) => setFormData({...formData, financial_year_end: e.target.value})}
                    />
                  </div>
                </div>

                {/* Voucher Numbering Settings */}
                <div className="border-t pt-6 mt-6">
                  <h3 className="text-lg font-semibold mb-4">Voucher Numbering Settings</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Sales Invoice Settings */}
                    <div>
                      <Label>Sales Invoice Prefix</Label>
                      <Input 
                        value={formData.invoice_prefix}
                        onChange={(e) => setFormData({...formData, invoice_prefix: e.target.value.toUpperCase()})}
                        placeholder="e.g., INV"
                        maxLength={10}
                      />
                    </div>
                    
                    <div>
                      <Label>Sales Invoice Starting Number</Label>
                      <Input 
                        type="number"
                        value={formData.invoice_starting_number}
                        onChange={(e) => setFormData({...formData, invoice_starting_number: e.target.value})}
                        placeholder="e.g., 1"
                        min="1"
                      />
                    </div>
                    
                    {/* Credit Note Settings */}
                    <div>
                      <Label>Credit Note Prefix</Label>
                      <Input 
                        value={formData.credit_note_prefix}
                        onChange={(e) => setFormData({...formData, credit_note_prefix: e.target.value.toUpperCase()})}
                        placeholder="e.g., CN"
                        maxLength={10}
                      />
                    </div>
                    
                    <div>
                      <Label>Credit Note Starting Number</Label>
                      <Input 
                        type="number"
                        value={formData.credit_note_starting_number}
                        onChange={(e) => setFormData({...formData, credit_note_starting_number: e.target.value})}
                        placeholder="e.g., 1"
                        min="1"
                      />
                    </div>
                    
                    {/* Purchase Bill Settings */}
                    <div>
                      <Label>Purchase Bill Prefix</Label>
                      <Input 
                        value={formData.bill_prefix}
                        onChange={(e) => setFormData({...formData, bill_prefix: e.target.value.toUpperCase()})}
                        placeholder="e.g., BILL"
                        maxLength={10}
                      />
                    </div>
                    
                    <div>
                      <Label>Purchase Bill Starting Number</Label>
                      <Input 
                        type="number"
                        value={formData.bill_starting_number}
                        onChange={(e) => setFormData({...formData, bill_starting_number: e.target.value})}
                        placeholder="e.g., 1"
                        min="1"
                      />
                    </div>
                    
                    {/* Debit Note Settings */}
                    <div>
                      <Label>Debit Note Prefix</Label>
                      <Input 
                        value={formData.debit_note_prefix}
                        onChange={(e) => setFormData({...formData, debit_note_prefix: e.target.value.toUpperCase()})}
                        placeholder="e.g., DN"
                        maxLength={10}
                      />
                    </div>
                    
                    <div>
                      <Label>Debit Note Starting Number</Label>
                      <Input 
                        type="number"
                        value={formData.debit_note_starting_number}
                        onChange={(e) => setFormData({...formData, debit_note_starting_number: e.target.value})}
                        placeholder="e.g., 1"
                        min="1"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end space-x-4 pt-6">
                  <Button type="button" variant="outline" onClick={() => navigate('/dashboard')}>
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