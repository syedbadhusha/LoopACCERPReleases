import { useState, useEffect } from 'react';
import { Navigate, useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth, LicenseOption } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Eye, EyeOff, Building2, CheckCircle2 } from 'lucide-react';
import { API_BASE_URL } from '@/config/runtime';
const Auth = () => {
  const { user, loading, signIn, signInWithLicense, signUp, sendPasswordResetOTP, resetPasswordWithOTP } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [signupData, setSignupData] = useState({ email: '', password: '', fullName: '' });
  const [resetData, setResetData] = useState({ email: '', newPassword: '', confirmPassword: '', resetCode: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // License selection state
  const [licenseOptions, setLicenseOptions] = useState<LicenseOption[] | null>(null);
  const [pendingCredentials, setPendingCredentials] = useState<{ email: string; password: string } | null>(null);
  const [signupDone, setSignupDone] = useState(false);
  // Check if user clicked password reset link from email/console
  useEffect(() => {
    const type = searchParams.get('type');
    const token = searchParams.get('token');
    const email = searchParams.get('email');
    
    console.log('Password reset link params:', { type, token, email });
    
    if (type === 'recovery') {
      setShowForgotPassword(true);
      
      // If token and email are in URL, auto-fill them
      if (token && email) {
        setResetData(prev => ({ 
          ...prev, 
          email: decodeURIComponent(email),
          resetCode: token
        }));
        setIsCodeSent(true);
        setIsResetMode(true);
        console.log('Reset data from URL:', { token, email: decodeURIComponent(email) });
      }
    }
  }, [searchParams]);

  // Redirect if already authenticated — send to change-password first if needed
  if (!loading && user) {
    if (user.must_change_password) {
      return <Navigate to="/change-password" replace />;
    }
    return <Navigate to="/company-selection" replace />;
  }

  // Show loading spinner while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const result = await signIn(loginData.email, loginData.password);
      if (!result.error) {
        if (result.requires_license_selection && result.licenses) {
          // Store credentials temporarily and show license picker
          setPendingCredentials({ email: loginData.email, password: loginData.password });
          setLicenseOptions(result.licenses);
        } else if (result.must_change_password) {
          navigate('/change-password', { replace: true });
        } else {
          navigate('/company-selection', { replace: true });
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLicenseSelect = async (userId: string) => {
    if (!pendingCredentials) return;
    setIsLoading(true);
    try {
      const result = await signInWithLicense(pendingCredentials.email, pendingCredentials.password, userId);
      if (!result.error) {
        setLicenseOptions(null);
        setPendingCredentials(null);
        if (result.must_change_password) {
          navigate('/change-password', { replace: true });
        } else {
          navigate('/company-selection', { replace: true });
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const result = await signUp(signupData.email, signupData.password, signupData.fullName);
      if (!result.error) {
        setSignupDone(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendResetOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const { error } = await sendPasswordResetOTP(resetData.email);
      if (!error) {
        setIsCodeSent(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // Verify the reset code
      const response = await fetch(`${API_BASE_URL}/auth/verify-reset-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: resetData.email, 
          token: resetData.resetCode 
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        toast({
          title: "Verification Failed",
          description: data.message || "Invalid or expired code. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // Code verified, show password reset form
      toast({
        title: "Code Verified!",
        description: "Please enter your new password.",
      });
      setIsResetMode(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (resetData.newPassword !== resetData.confirmPassword) {
      return;
    }

    setIsLoading(true);
    
    try {
      console.log('Attempting password reset...');
      const { error } = await resetPasswordWithOTP(resetData.newPassword, resetData.email, resetData.resetCode);
      if (!error) {
        console.log('Password reset successful');
        setShowForgotPassword(false);
        setIsResetMode(false);
        setIsCodeSent(false);
        setResetData({ email: '', newPassword: '', confirmPassword: '', resetCode: '' });
      } else {
        console.error('Password reset error:', error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">LoopAcc</h1>
          <p className="text-muted-foreground">Complete Accounting Solution</p>
        </div>
        
        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              {showForgotPassword ? (isResetMode ? 'Reset Password' : 'Forgot Password') : 'Welcome'}
            </CardTitle>
            <CardDescription>
              {showForgotPassword 
                ? (isResetMode 
                    ? 'Enter your new password' 
                    : isCodeSent
                      ? 'Enter the 6-digit code sent to your email'
                      : 'Enter your email to receive a password reset code')
                : 'Sign in to your account or create a new one'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showForgotPassword ? (
              <div className="space-y-4">
                <Button
                  variant="ghost"
                  className="mb-2"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setIsResetMode(false);
                    setIsCodeSent(false);
                    setResetData({ email: '', newPassword: '', confirmPassword: '', resetCode: '' });
                  }}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Login
                </Button>

                {isResetMode ? (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    {resetData.email && (
                      <div className="bg-muted p-3 rounded-md text-sm">
                        <p className="text-muted-foreground">Resetting password for:</p>
                        <p className="font-medium">{resetData.email}</p>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="new-password">New Password</Label>
                      <div className="relative">
                        <Input
                          id="new-password"
                          type={showNewPassword ? "text" : "password"}
                          placeholder="Enter new password (min 6 characters)"
                          value={resetData.newPassword}
                          onChange={(e) => setResetData({ ...resetData, newPassword: e.target.value })}
                          required
                          minLength={6}
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                        >
                          {showNewPassword ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Confirm Password</Label>
                      <div className="relative">
                        <Input
                          id="confirm-password"
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="Confirm new password"
                          value={resetData.confirmPassword}
                          onChange={(e) => setResetData({ ...resetData, confirmPassword: e.target.value })}
                          required
                          minLength={6}
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                      {resetData.newPassword && resetData.confirmPassword && 
                       resetData.newPassword !== resetData.confirmPassword && (
                        <p className="text-sm text-destructive">Passwords do not match</p>
                      )}
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={isLoading || resetData.newPassword !== resetData.confirmPassword}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Resetting Password...
                        </>
                      ) : (
                        'Reset Password'
                      )}
                    </Button>
                  </form>
                ) : isCodeSent ? (
                  <form onSubmit={handleVerifyCode} className="space-y-4">
                    <div className="bg-muted p-3 rounded-md text-sm mb-4">
                      <p className="text-muted-foreground">Code sent to:</p>
                      <p className="font-medium">{resetData.email}</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reset-code">6-Digit Code</Label>
                      <Input
                        id="reset-code"
                        type="text"
                        placeholder="Enter 6-digit code"
                        value={resetData.resetCode}
                        onChange={(e) => setResetData({ ...resetData, resetCode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                        required
                        maxLength={6}
                        className="text-center text-2xl tracking-widest font-bold"
                      />
                      <p className="text-xs text-muted-foreground text-center">
                        Check your email for the verification code
                      </p>
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading || resetData.resetCode.length !== 6}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Verifying Code...
                        </>
                      ) : (
                        'Verify Code'
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="link"
                      className="w-full text-sm"
                      onClick={() => {
                        setIsCodeSent(false);
                        setResetData(prev => ({ ...prev, resetCode: '' }));
                      }}
                    >
                      Didn't receive code? Try again
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleSendResetOTP} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reset-email">Email</Label>
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder="Enter your email"
                        value={resetData.email}
                        onChange={(e) => setResetData({ ...resetData, email: e.target.value })}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending Code...
                        </>
                      ) : (
                        'Send Reset Code'
                      )}
                    </Button>
                  </form>
                )}
              </div>
            ) : licenseOptions ? (
              /* ── License selection screen ── */
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-base">Select a License to Continue</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Your email is linked to multiple licenses. Choose one to log in.
                </p>
                <div className="space-y-3">
                  {licenseOptions.map((lic) => (
                    <button
                      key={lic.user_id}
                      onClick={() => handleLicenseSelect(lic.user_id)}
                      disabled={isLoading}
                      className="w-full text-left border rounded-lg p-4 hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div>
                            <p className="font-medium">
                              {lic.company_name ?? <span className="italic text-muted-foreground">No company yet</span>}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {lic.plan} Plan · {lic.is_owner ? 'License Owner' : 'Sub-user'} · {' '}
                              {lic.valid_until
                                ? `Expires ${new Date(lic.valid_until).toLocaleDateString('en-GB')}`
                                : 'No expiry'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${lic.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {lic.is_active ? 'Active' : 'Inactive'}
                          </span>
                          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  className="w-full text-sm"
                  onClick={() => { setLicenseOptions(null); setPendingCredentials(null); }}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
                </Button>
              </div>
            ) : (
              <Tabs defaultValue="login" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Login</TabsTrigger>
                  <TabsTrigger value="signup">Sign Up</TabsTrigger>
                </TabsList>
              
              <TabsContent value="login" className="space-y-4">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="Enter your email"
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showLoginPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={loginData.password}
                        onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                        required
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                      >
                        {showLoginPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing In...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                  <div className="text-center mt-4">
                    <Button
                      type="button"
                      variant="link"
                      className="text-sm text-primary"
                      onClick={() => setShowForgotPassword(true)}
                    >
                      Forgot Password?
                    </Button>
                  </div>
                </form>
              </TabsContent>
              
              <TabsContent value="signup" className="space-y-4">
                {signupDone ? (
                  <div className="text-center py-6 space-y-4">
                    <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
                      <svg className="h-7 w-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Account Created!</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your account is pending activation.
                      </p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 text-left">
                      <p className="font-semibold mb-1">License Activation Required</p>
                      <p>Please contact <span className="font-medium">LoopAcc Support</span> to activate your license before you can log in.</p>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => { setSignupDone(false); setSignupData({ email: '', password: '', fullName: '' }); }}
                    >
                      Back to Sign In
                    </Button>
                  </div>
                ) : (
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="Enter your full name"
                      value={signupData.fullName}
                      onChange={(e) => setSignupData({ ...signupData, fullName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="Enter your email"
                      value={signupData.email}
                      onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showSignupPassword ? "text" : "password"}
                        placeholder="Create a password"
                        value={signupData.password}
                        onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                        required
                        minLength={6}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowSignupPassword(!showSignupPassword)}
                      >
                        {showSignupPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating Account...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </Button>
                </form>
                )}
              </TabsContent>
            </Tabs>
            )}
          </CardContent>
        </Card>

        {/* App owner admin access */}
        <p className="text-center mt-4">
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            App Admin
          </button>
        </p>
      </div>
    </div>
  );
};

export default Auth;