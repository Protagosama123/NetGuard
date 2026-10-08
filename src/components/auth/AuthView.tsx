import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card.tsx';
import { Input } from '../ui/input.tsx';
import { Button } from '../ui/button.tsx';
import { Alert } from '../ui/alert.tsx';
import { Shield, KeyRound, UserPlus, Lock, Mail, AlertCircle, Sparkles } from 'lucide-react';

export const AuthView: React.FC = () => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === 'login') {
        const result = await login(email, password);
        if (!result.success) {
          setError(result.error || 'Authentication failed');
        }
      } else {
        if (password.length < 8) {
          setError('Password must be at least 8 characters in length');
          setSubmitting(false);
          return;
        }
        const result = await register(email, password);
        if (!result.success) {
          setError(result.error || 'Registration failed');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handlePreFillAdmin = () => {
    setEmail('lead_admin@netguard.local');
    setPassword('SecurePassword123!');
    setError(null);
  };

  const handlePreFillViewer = () => {
    setEmail('analyst_candidate@netguard.local');
    setPassword('ViewerPassword123!');
    setError(null);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-zinc-950 text-zinc-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-zinc-800/20 via-zinc-950 to-zinc-950 -z-10 pointer-events-none" />

      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 shadow-sm">
            <Shield className="h-6 w-6 text-zinc-300" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">NetGuard</h1>
          <p className="text-xs font-mono uppercase tracking-widest text-zinc-500">
            Security Telemetry & Access Control V0
          </p>
        </div>

        {/* Auth Card */}
        <Card className="border-zinc-800 bg-zinc-900/40 shadow-xl backdrop-blur-md">
          <CardHeader className="space-y-1 pb-4">
            <div className="flex rounded-md bg-zinc-900 p-1 border border-zinc-800">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); }}
                className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                  mode === 'login'
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setError(null); }}
                className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                  mode === 'register'
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Register
              </button>
            </div>
            <CardTitle className="pt-2 text-base text-zinc-200">
              {mode === 'login' ? 'Access NetGuard Console' : 'Create Operator Account'}
            </CardTitle>
            <CardDescription className="text-xs text-zinc-400">
              {mode === 'login'
                ? 'Sign in with your role-verified credentials to proceed.'
                : 'Initial system registrant receives ADMIN role. Subsequent users receive VIEWER.'}
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive" className="py-2.5 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                  <span>{error}</span>
                </Alert>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-zinc-500" />
                  Operator Email
                </label>
                <Input
                  type="email"
                  placeholder="analyst@netguard.local"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={submitting}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-zinc-500" />
                  Password
                </label>
                <Input
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={submitting}
                  className="text-xs"
                />
                {mode === 'register' && (
                  <p className="text-[11px] text-zinc-500">
                    Must be at least 8 characters in length.
                  </p>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-2">
              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-9 text-xs font-medium flex items-center justify-center gap-1.5"
              >
                {submitting ? (
                  'Processing...'
                ) : mode === 'login' ? (
                  <>
                    <KeyRound className="h-3.5 w-3.5" /> Authenticate
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3.5 w-3.5" /> Register Account
                  </>
                )}
              </Button>

              {/* Quick pre-fill helpers for demo evaluation */}
              <div className="w-full pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
                <span className="flex items-center gap-1 text-zinc-500">
                  <Sparkles className="h-3 w-3" /> Quick fill:
                </span>
                <div className="space-x-2 font-mono">
                  <button
                    type="button"
                    onClick={handlePreFillAdmin}
                    className="hover:text-zinc-200 underline cursor-pointer"
                  >
                    Admin
                  </button>
                  <span className="text-zinc-700">|</span>
                  <button
                    type="button"
                    onClick={handlePreFillViewer}
                    className="hover:text-zinc-200 underline cursor-pointer"
                  >
                    Viewer/Analyst
                  </button>
                </div>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
};
