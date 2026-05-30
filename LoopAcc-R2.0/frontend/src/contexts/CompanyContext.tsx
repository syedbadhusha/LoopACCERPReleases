import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/config/runtime';

/** Compute financial year start/end for a given country and reference date */
function computeFinancialYear(country: string, referenceDate: Date): { from: string; to: string } {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() + 1;
  const code = (country || '').toUpperCase();

  let startMonth = 1;
  let fyStartYear = year;

  if (['IN', 'INDIA', 'SG', 'SINGAPORE', 'GB', 'UK', 'UNITED KINGDOM'].includes(code)) {
    startMonth = 4;
    fyStartYear = month < 4 ? year - 1 : year;
  } else if (['AU', 'AUSTRALIA', 'NZ', 'NEW ZEALAND'].includes(code)) {
    startMonth = 7;
    fyStartYear = month < 7 ? year - 1 : year;
  } else {
    startMonth = 1;
    fyStartYear = year;
  }

  const fyEndYear = startMonth === 1 ? fyStartYear : fyStartYear + 1;
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const lastDay = new Date(fyEndYear, endMonth, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');

  return {
    from: `${fyStartYear}-${pad(startMonth)}-01`,
    to: `${fyEndYear}-${pad(endMonth)}-${pad(lastDay)}`,
  };
}

interface Company {
  id: string;
  name: string;
  address?: string;
  country: string;
  state?: string;
  city?: string;
  postal_code?: string;
  financial_year_start: string;
  financial_year_end: string;
  currency: string;
  tax_registration_number?: string;
  tax_type?: string;
  admin_username: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  books_beginning: string;
  last_voucher_date?: string;
  settings?: {
    [key: string]: string;
  };
}

interface CompanyUser {
  id: string;
  company_id: string;
  user_id: string | null;
  username: string;
  full_name?: string;
  role_id?: string | null;
  is_admin: boolean;
  is_active: boolean;
}

interface CompanySession {
  id: string;
  company_id: string;
  company_user_id: string;
  session_token: string;
  expires_at: string;
}

interface CompanyContextType {
  companies: Company[];
  selectedCompany: Company | null;
  currentUser: CompanyUser | null;
  currentSession: CompanySession | null;
  loading: boolean;
  isRestoringSession: boolean;
  /** Current global period used by dashboard and all reports */
  periodFrom: string;
  periodTo: string;
  setPeriod: (from: string, to: string) => void;
  /** Working date — used as default for new vouchers and Voucher History report */
  currentDate: string;
  setCurrentDate: (date: string) => void;
  selectCompany: (company: Company) => void;
  updateSelectedCompany: (companyData: Partial<Company>) => void;
  loginToCompany: (username: string, password: string) => Promise<{ error?: any }>;
  logoutFromCompany: () => void;
  createCompany: (companyData: any) => Promise<{ error?: any }>;
  fetchCompanies: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | null>(null);

export const useCompany = () => {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
};

interface CompanyProviderProps {
  children: ReactNode;
}

export const CompanyProvider = ({ children }: CompanyProviderProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [currentUser, setCurrentUser] = useState<CompanyUser | null>(null);
  const [currentSession, setCurrentSession] = useState<CompanySession | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  // Global period — initialized from localStorage, updated when company changes
  const today = new Date().toISOString().slice(0, 10);
  const [periodFrom, setPeriodFrom] = useState<string>(
    () => localStorage.getItem('global_period_from') || today
  );
  const [periodTo, setPeriodTo] = useState<string>(
    () => localStorage.getItem('global_period_to') || today
  );
  const [currentDate, setCurrentDateState] = useState<string>(
    () => localStorage.getItem('global_current_date') || today
  );

  /** Clamp a date string to [from, to] */
  const clampDate = (date: string, from: string, to: string) =>
    date < from ? from : date > to ? to : date;

  const setPeriod = (from: string, to: string) => {
    setPeriodFrom(from);
    setPeriodTo(to);
    localStorage.setItem('global_period_from', from);
    localStorage.setItem('global_period_to', to);
    // Keep currentDate inside the new period
    const clamped = clampDate(currentDate, from, to);
    if (clamped !== currentDate) {
      setCurrentDateState(clamped);
      localStorage.setItem('global_current_date', clamped);
    }
  };

  const setCurrentDate = (date: string) => {
    const clamped = clampDate(date, periodFrom, periodTo);
    setCurrentDateState(clamped);
    localStorage.setItem('global_current_date', clamped);
  };

  const fetchCompanies = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const licenseId = user.license_id || '';
      const url = licenseId
        ? `${API_BASE_URL}/companies/${user.id}?licenseId=${licenseId}`
        : `${API_BASE_URL}/companies/${user.id}`;
      const response = await fetch(url);
      const result = await response.json();

      if (result && result.success) {
        setCompanies(result.data || []);
      } else {
        console.error('Error fetching companies:', result?.message);
        setCompanies([]);
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  };

  const createCompany = async (companyData: any) => {
    if (!user) return { error: 'User not authenticated' };
    
    setLoading(true);
    try {
      console.debug('Creating company via backend API:', companyData);
      
      // Call backend API to create company
      const response = await fetch(`${API_BASE_URL}/companies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyData,
          userId: user.id,
          licenseId: user.license_id || null,
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to create company');
      }

      console.debug('Company created via backend:', result.company);
      
      await fetchCompanies();
      
      toast({
        title: "Success",
        description: result.message || "Company created successfully with default ledger groups"
      });
      
      return { error: null };
    } catch (error) {
      console.error('Error creating company:', error);
      toast({
        title: "Error",
        description: `Failed to create company: ${error?.message || String(error)}`,
        variant: "destructive"
      });
      return { error };
    } finally {
      setLoading(false);
    }
  };

  const selectCompany = (company: Company) => {
    setSelectedCompany(company);
    // Clear current session when selecting different company
    setCurrentUser(null);
    setCurrentSession(null);
  };

  const updateSelectedCompany = (companyData: Partial<Company>) => {
    if (selectedCompany) {
      const updatedCompany = { ...selectedCompany, ...companyData };
      setSelectedCompany(updatedCompany);
      
      // Also update in the companies array
      setCompanies(prev => 
        prev.map(company => 
          company.id === updatedCompany.id ? updatedCompany : company
        )
      );
    }
  };

  const loginToCompany = async (username: string, password: string) => {
    if (!selectedCompany || !user) return { error: 'No company selected or user not authenticated' };
    
    setLoading(true);
    try {
      console.log('Attempting login to company:', selectedCompany.id, 'with username:', username);
      
      // Call backend API to login
      const response = await fetch(`${API_BASE_URL}/companies/${selectedCompany.id}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          userId: user.id
        })
      });

      console.log('Login response status:', response.status);
      
      let result;
      try {
        result = await response.json();
        console.log('Login response body:', result);
      } catch (parseError) {
        console.error('Failed to parse response as JSON:', parseError);
        return { error: 'Invalid response from server' };
      }

      if (!response.ok || !result.success) {
        const errorMsg = result.message || 'Invalid username or password';
        console.log('Login failed:', errorMsg);
        return { error: errorMsg };
      }

      // Store session in localStorage
      localStorage.setItem('company_session', JSON.stringify(result.data));

      setCurrentSession(result.data);
      // If backend returned user info, set current user in context
      if (result.data?.user) {
        setCurrentUser(result.data.user);
      }
      
      toast({
        title: "Success",
        description: `Logged in to ${selectedCompany.name}`
      });
      
      return { error: null };
    } catch (error) {
      console.error('Error logging in to company:', error);
      return { error: error instanceof Error ? error.message : 'Failed to connect to server' };
    } finally {
      setLoading(false);
    }
  };

  const logoutFromCompany = async () => {
    if (currentSession) {
      // Delete session from backend
      try {
        const response = await fetch(`${API_BASE_URL}/companies/session/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: currentSession.id
          })
        });

        const result = await response.json();
        if (!response.ok) {
          console.error('Logout error:', result.message);
        }
      } catch (error) {
        console.error('Error logging out:', error);
      }
    }
    
    // Clear local state
    setCurrentUser(null);
    setCurrentSession(null);
    localStorage.removeItem('company_session');
    
    toast({
      title: "Logged out",
      description: "Successfully logged out from company"
    });
  };

  // Initialize companies when user changes
  useEffect(() => {
    if (user) {
      fetchCompanies();
    } else {
      setCompanies([]);
      setSelectedCompany(null);
      setCurrentUser(null);
      setCurrentSession(null);
    }
  }, [user]);

  // Re-compute period & current date when the selected company (or its last_voucher_date) changes
  useEffect(() => {
    if (selectedCompany) {
      const lastDate = selectedCompany.last_voucher_date || new Date().toISOString().slice(0, 10);
      const refDate = new Date(lastDate + 'T00:00:00');
      const fy = computeFinancialYear(selectedCompany.country, refDate);
      setPeriodFrom(fy.from);
      setPeriodTo(fy.to);
      localStorage.setItem('global_period_from', fy.from);
      localStorage.setItem('global_period_to', fy.to);
      // Default currentDate to last_voucher_date, clamped to FY
      const cd = clampDate(lastDate, fy.from, fy.to);
      setCurrentDateState(cd);
      localStorage.setItem('global_current_date', cd);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany?.id, selectedCompany?.last_voucher_date]);

  // Check for existing company session on load
  useEffect(() => {
    const checkExistingSession = async () => {
      if (!user) {
        console.log('No user, skipping session restoration');
        setIsRestoringSession(false);
        return;
      }
      
      const storedSession = localStorage.getItem('company_session');
      if (!storedSession) {
        console.log('No stored session in localStorage');
        setIsRestoringSession(false);
        return;
      }
      
      try {
        const sessionData = JSON.parse(storedSession);
        console.log('Found stored session, validating...', { sessionToken: sessionData.session_token?.substring(0, 8) });
        
        // Check if session is expired locally first
        if (new Date(sessionData.expires_at) <= new Date()) {
          console.log('Session expired locally');
          localStorage.removeItem('company_session');
          setIsRestoringSession(false);
          return;
        }
        
        // Validate session with backend
        const response = await fetch(`${API_BASE_URL}/companies/session/validate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionToken: sessionData.session_token,
            userId: user.id
          })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          console.log('Session validation failed:', result.message);
          localStorage.removeItem('company_session');
          setIsRestoringSession(false);
          return;
        }

        // Restore session from validated data
        console.log('Session validated, restoring state:', { 
          company: result.data.company?.name,
          user: result.data.user?.username 
        });
        setSelectedCompany(result.data.company);
        setCurrentUser(result.data.user);
        setCurrentSession(result.data.session);
        console.log('✓ Session restored successfully');
      } catch (error) {
        console.error('Error checking existing session:', error);
        localStorage.removeItem('company_session');
      } finally {
        setIsRestoringSession(false);
      }
    };
    
    checkExistingSession();
  }, [user]);

  return (
    <CompanyContext.Provider
      value={{
        companies,
        selectedCompany,
        currentUser,
        currentSession,
        loading,
        isRestoringSession,
        periodFrom,
        periodTo,
        setPeriod,
        currentDate,
        setCurrentDate,
        selectCompany,
        updateSelectedCompany,
        loginToCompany,
        logoutFromCompany,
        createCompany,
        fetchCompanies
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
};