import { cn } from '@/lib/cn';

/**
 * Loading placeholder.
 *
 * Marked aria-hidden and paired with an sr-only "Loading" elsewhere: a screen
 * reader announcing a dozen empty grey boxes is worse than silence.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-[var(--surface-inset)]', className)}
    />
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          // A ragged last line reads as text rather than as a block.
          className={cn('h-3', index === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}
