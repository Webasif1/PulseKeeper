import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/hooks/useAuth';

/**
 * Gate for signed-in routes.
 *
 * While the initial session check is in flight it renders a spinner rather than
 * redirecting: redirecting first would bounce an already-signed-in user to the
 * login page on every refresh.
 */
export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6 text-[var(--text-muted)]" label="Checking your session" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Remember where they were headed so signing in returns them there.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
