import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface DropdownItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** Renders in the danger colour and is separated from the safe actions. */
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * A menu of actions.
 *
 * Closes on Escape, on outside click, and after a selection. Items are real
 * buttons in a `menu`, so keyboard users can reach every action.
 */
export function Dropdown({
  trigger,
  items,
  align = 'right',
  label = 'Open menu',
}: {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
  label?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const safeItems = items.filter((item) => !item.destructive);
  const destructiveItems = items.filter((item) => item.destructive);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={label}
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex"
      >
        {trigger}
      </button>

      {isOpen && (
        <div
          role="menu"
          className={cn(
            'absolute z-40 mt-1.5 min-w-44 animate-[fade-in_0.12s_ease-out] py-1',
            'rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {safeItems.map((item) => (
            <MenuItem key={item.label} item={item} onDone={() => setIsOpen(false)} />
          ))}

          {destructiveItems.length > 0 && safeItems.length > 0 && (
            // A visual gap so a destructive action is never the neighbour of a
            // routine one.
            <div className="my-1 h-px bg-[var(--border-subtle)]" role="separator" />
          )}

          {destructiveItems.map((item) => (
            <MenuItem key={item.label} item={item} onDone={() => setIsOpen(false)} />
          ))}
        </div>
      )}
    </div>
  );
}

function MenuItem({ item, onDone }: { item: DropdownItem; onDone: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      onClick={() => {
        item.onSelect();
        onDone();
      }}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
        'hover:bg-[var(--surface-hover)] disabled:pointer-events-none disabled:opacity-50',
        item.destructive ? 'text-[var(--color-offline)]' : 'text-[var(--text-primary)]',
      )}
    >
      {item.icon}
      {item.label}
    </button>
  );
}
