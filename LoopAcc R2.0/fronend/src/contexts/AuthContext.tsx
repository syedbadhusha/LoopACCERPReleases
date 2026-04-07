import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/config/runtime';

interface User {
  id: string;
  email: string;
  full_name: string;
  created_at?: string;
  updated_at?: string;
}

interface AuthContextType {
  user: User | null;
  session: any | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
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
    // Check for existing session in localStorage
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        setSession({ user: parsedUser });
      } catch (error) {
        console.error('Failed to parse stored user:', error);
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
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

      // Store user in state and localStorage
      setUser(data.user);
      setSession({ user: data.user });
      localStorage.setItem('user', JSON.stringify(data.user));

      toast({
        title: "Welcome back!",
        description: "You have been successfully logged in.",
      });

      return { error: null };
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

      // Auto login after signup
      setUser(data.user);
      setSession({ user: data.user });
      localStorage.setItem('user', JSON.stringify(data.user));

      toast({
        title: "Registration Successful!",
        description: "Your account has been created successfully.",
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
      });
      
      setUser(null);
      setSession(null);
      localStorage.removeItem('user');
      
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

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    sendPasswordResetOTP,
    resetPasswordWithOTP,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};