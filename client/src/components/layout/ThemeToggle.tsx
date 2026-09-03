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
export function ThemeToggle({
  value,
  onChange,
}: {
  /**
   * Optional overrides so the settings page can also persist the choice to the
   * account. Left out, the control reads and writes the theme context alone,
   * which is what the header needs.
   */
  value?: ThemePreference;
  onChange?: (theme: ThemePreference) => void;
} = {}) {
  const { theme: contextTheme, setTheme } = useTheme();

  const theme = value ?? contextTheme;
  const applyTheme = onChange ?? setTheme;

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
            onClick={() => applyTheme(option.value)}
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
