import clsx, { type ClassValue } from 'clsx';

/**
 * Join class names conditionally.
 *
 * Plain clsx, without tailwind-merge: the components here are written so that
 * conflicting utilities are not passed in the first place, and the extra
 * dependency would earn its place only once that stops being true.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
