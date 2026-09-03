import { Construction } from 'lucide-react';

import { AppShell } from '@/components/layout/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Standing in for pages that arrive in later phases.
 *
 * Every navigation item routes somewhere real from the first commit: a link
 * that goes nowhere is harder to review than one that says what is coming.
 */
export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <AppShell title={title}>
      <div className="surface-card">
        <EmptyState icon={Construction} title={`${title} is on the way`} description={description} />
      </div>
    </AppShell>
  );
}
