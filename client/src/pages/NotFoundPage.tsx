import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

import { EmptyState } from '@/components/ui/EmptyState';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="surface-card w-full max-w-md">
        <EmptyState
          icon={Compass}
          title="Page not found"
          description="That page does not exist, or it moved somewhere else."
          action={
            // A link, styled as a button. Wrapping an anchor in a <button>
            // would be invalid markup and would break middle-click and
            // open-in-new-tab.
            <Link
              to="/"
              className="inline-flex h-9.5 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              Back to dashboard
            </Link>
          }
        />
      </div>
    </div>
  );
}
