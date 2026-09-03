import { Monitor, Moon, Sun } from 'lucide-react';

import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/cn';

import type { ThemePreference } from '@/types/api';

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/**
 * Theme switcher (SPEC §30).
 *
 * A three-way segmented control rather than a two-state toggle, because
 * "system" is a distinct choice: a toggle cannot express "follow the OS", and
 * collapsing it loses the setting the majority of users want.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-0.5"
    >
      {OPTIONS.map((option) => {
        const isSelected = theme === option.value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={option.label}
            onClick={() => setTheme(option.value)}
            className={cn(
              'rounded-md p-1.5 transition-colors',
              isSelected
                ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
            )}
          >
            <option.icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
