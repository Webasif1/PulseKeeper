import { Activity, Lock, Mail, User } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { ApiError } from '@/services/api';

import type { FieldError } from '@/types/api';

/** Field errors keyed by field name, so each input shows its own message. */
function toFieldMap(errors: FieldError[]): Record<string, string> {
  return errors.reduce<Record<string, string>>((map, entry) => {
    map[entry.field] = entry.message;
    return map;
  }, {});
}

export function RegisterPage() {
  const { register, isAuthenticated, isLoading: isCheckingSession } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isCheckingSession && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const update = (field: keyof typeof form) => (event: { target: { value: string } }) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    // Clear the message as soon as the field is touched: leaving it until
    // resubmission makes corrected input still look wrong.
    setFieldErrors((current) => ({ ...current, [field]: '' }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      await register(form.name, form.email, form.password);
      toast.success('Account created', 'Add your first website to start monitoring.');
      navigate('/', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.fieldErrors.length > 0) {
        // The server validates the same rules; showing its messages per field
        // keeps the two from disagreeing.
        setFieldErrors(toFieldMap(caught.fieldErrors));
      } else {
        setError(
          caught instanceof ApiError
            ? caught.message
            : 'Could not create your account. Please try again.',
        );
      }
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
          <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
          <p className="mt-1 text-sm text-muted">Start monitoring your projects in minutes</p>
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
            label="Name"
            name="name"
            autoComplete="name"
            required
            value={form.name}
            onChange={update('name')}
            error={fieldErrors.name}
            placeholder="Asif Rahman"
            leftIcon={<User className="h-4 w-4" aria-hidden="true" />}
          />

          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={update('email')}
            error={fieldErrors.email}
            placeholder="you@example.com"
            leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
          />

          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="new-password"
            required
            value={form.password}
            onChange={update('password')}
            error={fieldErrors.password}
            hint="At least 8 characters"
            placeholder="••••••••"
            leftIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
          />

          <Button type="submit" variant="primary" className="w-full" isLoading={isSubmitting}>
            Create account
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-[var(--color-brand-500)] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
