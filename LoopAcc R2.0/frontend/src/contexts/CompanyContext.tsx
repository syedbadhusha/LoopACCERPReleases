import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from '@/hooks/use-toast';


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
  settings?: {
    [key: string]: string;
  };
}

interface CompanyUser {
  id: string;
  company_id: string;
  user_id: string;
  username: string;
  role_id?: string;
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

  const fetchCompanies = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:5000/api/companies/${user.id}`);
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
      const response = await fetch('http://localhost:5000/api/companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyData,
          userId: user.id
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
      const response = await fetch(`http://localhost:5000/api/companies/${selectedCompany.id}/login`, {
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
        const response = await fetch('http://localhost:5000/api/companies/session/logout', {
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
        const response = await fetch('http://localhost:5000/api/companies/session/validate', {
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