import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/config/runtime';

interface User {
  id: string;
  email: string;
  full_name: string;
  license_id?: string;
  is_owner?: boolean;
  status?: string;
  must_change_password?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LicenseOption {
  user_id: string;
  license_id: string;
  is_owner: boolean;
  plan: string;
  is_active: boolean;
  valid_until: string | null;
  company_name: string | null;
}

interface AuthContextType {
  user: User | null;
  session: any | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any; must_change_password?: boolean; requires_license_selection?: boolean; licenses?: LicenseOption[] }>;
  signInWithLicense: (email: string, password: string, userId: string) => Promise<{ error: any; must_change_password?: boolean }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ error: any }>;
  sendPasswordResetOTP: (email: string) => Promise<{ error: any }>;
  resetPasswordWithOTP: (newPassword: string, email: string, token: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const initSession = async () => {
      const storedUser = localStorage.getItem('user');
      const sessionToken = localStorage.getItem('session_token');

      if (storedUser && sessionToken) {
        try {
          const parsedUser = JSON.parse(storedUser);

          // Re-validate session + license expiry with backend
          const res = await fetch(`${API_BASE_URL}/auth/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_token: sessionToken }),
          });
          const data = await res.json();

          if (!res.ok || !data.success) {
            // Session invalid / license expired — force sign out
            localStorage.removeItem('user');
            localStorage.removeItem('license');
            localStorage.removeItem('company_session');
            localStorage.removeItem('session_token');
            toast({
              title: "Session Ended",
              description: data.message || "Your session has ended. Please log in again.",
              variant: "destructive",
            });
          } else {
            setUser(parsedUser);
            setSession({ user: parsedUser });
          }
        } catch (error) {
          console.error('Failed to validate session:', error);
          // On network error, allow offline use with cached data
          try {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
            setSession({ user: parsedUser });
          } catch {
            localStorage.removeItem('user');
          }
        }
      }
      setLoading(false);
    };

    initSession();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        const rawMessage = data.message || 'Login failed';
        const isDbError = /database|mongodb|initialize database|not available/i.test(rawMessage);
        const error = {
          message: isDbError
            ? 'Database is unavailable. Please verify backend MongoDB connection and try again.'
            : rawMessage,
        };
        toast({
          title: "Login Failed",
          description: error.message,
          variant: "destructive",
        });
        return { error };
      }

      // Multiple licenses — caller must show selection UI
      if (data.requires_license_selection) {
        return { error: null, requires_license_selection: true, licenses: data.licenses };
      }

      // Store user in state and localStorage (includes license_id, must_change_password, is_owner)
      setUser(data.user);
      setSession({ user: data.user });
      localStorage.setItem('user', JSON.stringify(data.user));
      // Store session token for concurrent-login prevention
      if (data.session_token) {
        localStorage.setItem('session_token', data.session_token);
      }
      // Also cache license info so CompanyContext can read it without an extra fetch
      if (data.license) {
        localStorage.setItem('license', JSON.stringify(data.license));
      }

      if (data.must_change_password) {
        toast({
          title: "Password Change Required",
          description: "Please change your temporary password to continue.",
          variant: "destructive",
        });
        return { error: null, must_change_password: true };
      }

      toast({
        title: "Welcome back!",
        description: "You have been successfully logged in.",
      });

      return { error: null, must_change_password: false };
    } catch (error: any) {
      const authError = { message: error.message || 'An unexpected error occurred' };
      toast({
        title: "Login Failed", 
        description: authError.message,
        variant: "destructive",
      });
      return { error: authError };
    }
  };

  const signInWithLicense = async (email: string, password: string, userId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/signin-select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, user_id: userId }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        const error = { message: data.message || 'Login failed' };
        toast({ title: "Login Failed", description: error.message, variant: "destructive" });
        return { error };
      }

      setUser(data.user);
      setSession({ user: data.user });
      localStorage.setItem('user', JSON.stringify(data.user));
      if (data.session_token) localStorage.setItem('session_token', data.session_token);
      if (data.license) localStorage.setItem('license', JSON.stringify(data.license));

      if (data.must_change_password) {
        toast({ title: "Password Change Required", description: "Please change your temporary password to continue.", variant: "destructive" });
        return { error: null, must_change_password: true };
      }

      toast({ title: "Welcome back!", description: "You have been successfully logged in." });
      return { error: null, must_change_password: false };
    } catch (error: any) {
      const authError = { message: error.message || 'An unexpected error occurred' };
      toast({ title: "Login Failed", description: authError.message, variant: "destructive" });
      return { error: authError };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, fullName }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        const error = { message: data.message || 'Registration failed' };
        
        if (data.message?.includes('already registered')) {
          toast({
            title: "Account Exists",
            description: "This email is already registered. Please sign in instead.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Registration Failed",
            description: error.message,
            variant: "destructive",
          });
        }
        return { error };
      }

      // Do NOT auto-login — license is inactive until admin activates it
      toast({
        title: "Registration Successful!",
        description: "Your account has been created. Please contact LoopAcc Support for license activation.",
      });

      return { error: null };
    } catch (error: any) {
      const authError = { message: error.message || 'An unexpected error occurred' };
      toast({
        title: "Registration Failed",
        description: authError.message,
        variant: "destructive",
      });
      return { error: authError };
    }
  };

  const signOut = async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/signout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: localStorage.getItem('session_token') }),
      });
      
      setUser(null);
      setSession(null);
      localStorage.removeItem('user');
      localStorage.removeItem('license');
      localStorage.removeItem('company_session');
      localStorage.removeItem('session_token');
      
      toast({
        title: "Logged Out",
        description: "You have been successfully logged out.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to log out. Please try again.",
        variant: "destructive",
      });
    }
  };

  const sendPasswordResetOTP = async (email: string) => {
    try {
      const normalizedEmail = email.trim().toLowerCase();

      const response = await fetch(`${API_BASE_URL}/auth/request-password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        toast({
          title: "Error",
          description: data.message || "Failed to send reset link",
          variant: "destructive",
        });
        return { error: { message: data.message } };
      }

      if (data.emailDispatched === false) {
        const error = {
          message: data.message || "No account found for this email.",
        };
        toast({
          title: "Unable To Send Code",
          description: error.message,
          variant: "destructive",
        });
        return { error };
      }

      toast({
        title: "Reset Code Sent!",
        description: "A 6-digit verification code has been sent to your email. Please check your inbox.",
        duration: 8000,
      });

      return { error: null, data };
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send reset link",
        variant: "destructive",
      });
      return { error };
    }
  };

  const resetPasswordWithOTP = async (newPassword: string, email: string, token: string) => {
    try {
      if (!email || !token) {
        const error = { message: 'Email or reset code is required' };
        toast({
          title: "Error",
          description: "Please provide both email and verification code.",
          variant: "destructive",
        });
        return { error };
      }

      const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email, 
          token, 
          newPassword 
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        const error = { message: data.message || 'Password reset failed' };
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
        return { error };
      }

      // Clear stored reset data
      localStorage.removeItem('resetEmail');
      localStorage.removeItem('resetToken');

      toast({
        title: "Password Reset Successful",
        description: "Your password has been updated successfully. You can now login.",
      });

      return { error: null };
    } catch (error: any) {
      const authError = { message: error.message || 'An unexpected error occurred' };
      toast({
        title: "Error",
        description: authError.message,
        variant: "destructive",
      });
      return { error: authError };
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      if (!user) return { error: { message: 'Not logged in' } };
      const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, currentPassword, newPassword }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        const error = { message: data.message || 'Failed to change password' };
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        return { error };
      }
      // Clear must_change_password flag locally
      const updatedUser = { ...user, must_change_password: false };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      toast({ title: 'Password Changed', description: 'Your password has been updated successfully.' });
      return { error: null };
    } catch (error: any) {
      const authError = { message: error.message || 'An unexpected error occurred' };
      toast({ title: 'Error', description: authError.message, variant: 'destructive' });
      return { error: authError };
    }
  };

  const value = {
    user,
    session,
    loading,
    signIn,
    signInWithLicense,
    signUp,
    signOut,
    changePassword,
    sendPasswordResetOTP,
    resetPasswordWithOTP,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};