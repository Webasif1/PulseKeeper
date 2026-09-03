import { AlertTriangle, CircleDashed, CircleHelp, CircleX, PauseCircle, Zap } from 'lucide-react';

import type { SiteStatus } from '@/types/api';

/**
 * How each status is presented.
 *
 * Every status carries a label and an icon as well as a colour (SPEC §32):
 * colour alone excludes anyone who cannot distinguish these hues, and it is the
 * one accessibility failure a status dashboard absolutely cannot make.
 */
export interface StatusPresentation {
  label: string;
  icon: typeof Zap;
  /** Text colour class. */
  text: string;
  /** Background for badges and soft fills. */
  background: string;
  /** Solid colour for dots and chart marks. */
  dot: string;
  description: string;
}

export const STATUS_PRESENTATION: Record<SiteStatus, StatusPresentation> = {
  ONLINE: {
    label: 'Online',
    icon: Zap,
    text: 'text-online',
    background: 'bg-online-soft',
    dot: 'bg-online',
    description: 'Responding normally',
  },
  SLOW: {
    label: 'Slow',
    icon: AlertTriangle,
    text: 'text-slow',
    background: 'bg-slow-soft',
    dot: 'bg-slow',
    description: 'Responding above the slow threshold',
  },
  OFFLINE: {
    label: 'Offline',
    icon: CircleX,
    text: 'text-offline',
    background: 'bg-offline-soft',
    dot: 'bg-offline',
    description: 'Not responding',
  },
  CHECKING: {
    label: 'Checking',
    icon: CircleDashed,
    text: 'text-brand-500',
    background: 'bg-brand-50',
    dot: 'bg-brand-500',
    description: 'A check is in progress',
  },
  PAUSED: {
    label: 'Paused',
    icon: PauseCircle,
    text: 'text-paused',
    background: 'bg-paused-soft',
    dot: 'bg-paused',
    description: 'Monitoring is disabled',
  },
  UNKNOWN: {
    label: 'Unknown',
    icon: CircleHelp,
    text: 'text-paused',
    background: 'bg-paused-soft',
    dot: 'bg-paused',
    description: 'No check has run yet',
  },
};

export const MONITORING_INTERVALS = [
  { value: 1, label: 'Every minute' },
  { value: 5, label: 'Every 5 minutes' },
  { value: 10, label: 'Every 10 minutes' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
] as const;

export const RETENTION_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
] as const;

export const TIME_RANGES = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
] as const;
