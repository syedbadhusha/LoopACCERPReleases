import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '@/contexts/CompanyContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Building2 } from 'lucide-react';

const getFinancialYearRangeByCountry = (countryCode: string, currentDate = new Date()) => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  let startMonth = 1;
  let startDay = 1;
  let fyStartYear = year;

  switch (countryCode) {
    case 'IN': // India → Apr–Mar
    case 'SG': // Singapore → Apr–Mar
    case 'GB': // UK → Apr–Mar
      startMonth = 4;
      startDay = 1;
      fyStartYear = month < 4 ? year - 1 : year;
      break;

    case 'AU': // Australia → Jul–Jun
      startMonth = 7;
      startDay = 1;
      fyStartYear = month < 7 ? year - 1 : year;
      break;

    default: // Calendar year for all others
      startMonth = 1;
      startDay = 1;
      fyStartYear = year;
      break;
  }

  const fyEndYear = startMonth === 1 ? fyStartYear : fyStartYear + 1;

  const fyStart = new Date(fyStartYear, startMonth - 1, startDay);
  const fyEnd = new Date(fyEndYear, startMonth - 2 < 0 ? 11 : startMonth - 2, 31);

  // ✅ Format date without UTC shift
  const formatLocalDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return {
    start: formatLocalDate(fyStart),
    end: formatLocalDate(fyEnd)
  };
};
const CreateCompany = () => {
  const navigate = useNavigate();
  const { createCompany, loading } = useCompany();
  
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    country: 'IN', // Store country code for proper Select display
    state: '',
    city: '',
    postal_code: '',
    currency: 'INR',
    tax_registration_number: '',
    tax_type: 'GST',
    books_beginning: getFinancialYearRangeByCountry('IN').start,
    financial_year_start: getFinancialYearRangeByCountry('IN').start,
    financial_year_end: getFinancialYearRangeByCountry('IN').end,
    admin_username: '',
    admin_password: ''
  });

  const countries = [
    { code: 'IN', name: 'India', currency: 'INR', taxType: 'GST', booksbeginning: getFinancialYearRangeByCountry('IN'), financialyearstart: getFinancialYearRangeByCountry('IN'), financialyearend: getFinancialYearRangeByCountry('IN')},
    { code: 'US', name: 'United States', currency: 'USD', taxType: 'Sales Tax', booksbeginning: getFinancialYearRangeByCountry('US'), financialyearstart: getFinancialYearRangeByCountry('US'), financialyearend: getFinancialYearRangeByCountry('US')},
    { code: 'GB', name: 'United Kingdom', currency: 'GBP', taxType: 'VAT', booksbeginning: getFinancialYearRangeByCountry('GBP'), financialyearstart: getFinancialYearRangeByCountry('GBP'), financialyearend: getFinancialYearRangeByCountry('GBP') },
    { code: 'CA', name: 'Canada', currency: 'CAD', taxType: 'GST/HST' , booksbeginning: getFinancialYearRangeByCountry('CA'), financialyearstart: getFinancialYearRangeByCountry('CA'), financialyearend: getFinancialYearRangeByCountry('CA') },
    { code: 'AU', name: 'Australia', currency: 'AUD', taxType: 'GST' , booksbeginning: getFinancialYearRangeByCountry('AU'), financialyearstart: getFinancialYearRangeByCountry('AU'), financialyearend: getFinancialYearRangeByCountry('AU') },
    { code: 'DE', name: 'Germany', currency: 'EUR', taxType: 'VAT', booksbeginning: getFinancialYearRangeByCountry('DE'), financialyearstart: getFinancialYearRangeByCountry('DE'), financialyearend: getFinancialYearRangeByCountry('DE') },
    { code: 'FR', name: 'France', currency: 'EUR', taxType: 'VAT', booksbeginning: getFinancialYearRangeByCountry('FR'), financialyearstart: getFinancialYearRangeByCountry('FR'), financialyearend: getFinancialYearRangeByCountry('FR') },
    { code: 'SG', name: 'Singapore', currency: 'SGD', taxType: 'GST', booksbeginning: getFinancialYearRangeByCountry('SG'), financialyearstart: getFinancialYearRangeByCountry('SG'), financialyearend: getFinancialYearRangeByCountry('SG') },
    // Gulf Countries
    { code: 'AE', name: 'United Arab Emirates', currency: 'AED', taxType: 'VAT', booksbeginning: getFinancialYearRangeByCountry('AE'), financialyearstart: getFinancialYearRangeByCountry('AE'), financialyearend: getFinancialYearRangeByCountry('AE') },
    { code: 'SA', name: 'Saudi Arabia', currency: 'SAR', taxType: 'VAT', booksbeginning: getFinancialYearRangeByCountry('SA'), financialyearstart: getFinancialYearRangeByCountry('SA'), financialyearend: getFinancialYearRangeByCountry('SA') },
    { code: 'KW', name: 'Kuwait', currency: 'KWD', taxType: 'VAT', booksbeginning: getFinancialYearRangeByCountry('KW'), financialyearstart: getFinancialYearRangeByCountry('KW'), financialyearend: getFinancialYearRangeByCountry('KW') },
    { code: 'QA', name: 'Qatar', currency: 'QAR', taxType: 'VAT', booksbeginning: getFinancialYearRangeByCountry('QA'), financialyearstart: getFinancialYearRangeByCountry('QA'), financialyearend: getFinancialYearRangeByCountry('QA') },
    { code: 'BH', name: 'Bahrain', currency: 'BHD', taxType: 'VAT', booksbeginning: getFinancialYearRangeByCountry('BH'), financialyearstart: getFinancialYearRangeByCountry('BH'), financialyearend: getFinancialYearRangeByCountry('BH') },
    { code: 'OM', name: 'Oman', currency: 'OMR', taxType: 'VAT', booksbeginning: getFinancialYearRangeByCountry('OM'), financialyearstart: getFinancialYearRangeByCountry('OM'), financialyearend: getFinancialYearRangeByCountry('OM') },
  ];

  const handleCountryChange = (countryCode: string) => {
    const country = countries.find(c => c.code === countryCode);
    if (country) {
      setFormData({
        ...formData,
        country: countryCode, // Store the country code for Select display
        currency: country.currency,
        tax_type: country.taxType,
        books_beginning: country.booksbeginning.start,
        financial_year_start: country.financialyearstart.start,
        financial_year_end: country.financialyearend.end
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Convert country code to country name for database storage
    const selectedCountry = countries.find(c => c.code === formData.country);
    const submitData = {
      ...formData,
      country: selectedCountry?.name || formData.country
    };
    
    console.debug('Creating company with data:', submitData);
    const { error } = await createCompany(submitData);
    
    if (error) {
      console.error('Company creation error:', error);
      alert(`Error: ${error?.message || JSON.stringify(error)}`);
    } else {
      navigate('/company-selection');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <Building2 className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">LoopAcc</h1>
              <p className="text-sm text-muted-foreground">Create New Company</p>
            </div>
          </div>
          
          <Button variant="ghost" onClick={() => navigate('/company-selection')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Companies
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Building2 className="mr-3 h-6 w-6" />
                Create New Company
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Information */}
                <div>
                  <h3 className="text-lg font-medium mb-4">Basic Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <Label htmlFor="name">Company Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        placeholder="Enter company name"
                        required
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="country">Country *</Label>
                      <Select value={formData.country} onValueChange={handleCountryChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select country" />
                        </SelectTrigger>
                        <SelectContent>
                          {countries.map((country) => (
                            <SelectItem key={country.code} value={country.code}>
                              {country.name}
                            </SelectItem>
                          ))}
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
                      <Label htmlFor="postal_code">Postal Code</Label>
                      <Input
                        id="postal_code"
                        value={formData.postal_code}
                        onChange={(e) => setFormData({...formData, postal_code: e.target.value})}
                        placeholder="Enter postal code"
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
                  </div>
                </div>

                {/* Financial Configuration */}
                <div>
                  <h3 className="text-lg font-medium mb-4">Financial Configuration</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="currency">Currency</Label>
                      <Input
                        id="currency"
                        value={formData.currency}
                        onChange={(e) => setFormData({...formData, currency: e.target.value})}
                        placeholder="Enter currency code"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="tax_type">Tax Type</Label>
                      <Input
                        id="tax_type"
                        value={formData.tax_type}
                        onChange={(e) => setFormData({...formData, tax_type: e.target.value})}
                        placeholder="Tax type (GST, VAT, etc.)"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="books_beginning">Books Beginning From</Label>
                      <Input
                        id="books_beginning"
                        type="date"
                        value={formData.books_beginning}
                        onChange={(e) => setFormData({...formData, books_beginning: e.target.value})}
                      />
                    </div>

                    <div>
                      <Label htmlFor="financial_year_start">Financial Year Start</Label>
                      <Input
                        id="financial_year_start"
                        type="date"
                        value={formData.financial_year_start}
                        onChange={(e) => setFormData({...formData, financial_year_start: e.target.value})}
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="financial_year_end">Financial Year End</Label>
                      <Input
                        id="financial_year_end"
                        type="date"
                        value={formData.financial_year_end}
                        onChange={(e) => setFormData({...formData, financial_year_end: e.target.value})}
                      />
                    </div>
                    
                    <div className="md:col-span-2">
                      <Label htmlFor="tax_registration_number">Tax Registration Number</Label>
                      <Input
                        id="tax_registration_number"
                        value={formData.tax_registration_number}
                        onChange={(e) => setFormData({...formData, tax_registration_number: e.target.value.toUpperCase()})}
                        placeholder="Enter tax registration number"
                      />
                    </div>
                  </div>
                </div>

                {/* Admin User Setup */}
                <div>
                  <h3 className="text-lg font-medium mb-4">Administrator Account</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="admin_username">Admin Username *</Label>
                      <Input
                        id="admin_username"
                        value={formData.admin_username}
                        onChange={(e) => setFormData({...formData, admin_username: e.target.value})}
                        placeholder="Enter admin username"
                        required
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="admin_password">Admin Password *</Label>
                      <Input
                        id="admin_password"
                        type="password"
                        value={formData.admin_password}
                        onChange={(e) => setFormData({...formData, admin_password: e.target.value})}
                        placeholder="Enter admin password"
                        required
                        minLength={6}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-4 pt-6">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => navigate('/company-selection')}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Creating Company...' : 'Create Company'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CreateCompany;