import { Activity, Lock, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/services/api';

interface LocationState {
  from?: { pathname: string };
}

export function LoginPage() {
  const { login, isAuthenticated, isLoading: isCheckingSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isCheckingSession && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
      // Back to wherever they were headed before the redirect.
      const state = location.state as LocationState | null;
      navigate(state?.from?.pathname ?? '/', { replace: true });
    } catch (caught) {
      // The server answers a wrong password and an unknown account
      // identically, and so does this: showing anything more would let the
      // form be used to discover which addresses are registered.
      setError(
        caught instanceof ApiError ? caught.message : 'Could not sign in. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span
            className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-brand-600)]"
            aria-hidden="true"
          >
            <Activity className="h-6 w-6 text-white" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">Sign in to your PulseKeeper dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="surface-card space-y-4 p-6" noValidate>
          {error && (
            <div
              role="alert"
              className="rounded-lg bg-[var(--color-offline-soft)] px-3 py-2.5 text-sm text-[var(--color-offline)]"
            >
              {error}
            </div>
          )}

          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
          />

          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            leftIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
          />

          <Button type="submit" variant="primary" className="w-full" isLoading={isSubmitting}>
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Don&apos;t have an account?{' '}
          <Link
            to="/register"
            className="font-medium text-[var(--color-brand-500)] hover:underline"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
