import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { HealthTimeline } from './HealthTimeline';

import type { TimelineEntry } from '@/types/api';

const entries: TimelineEntry[] = [
  { checkedAt: '2026-09-03T10:00:00.000Z', success: true, statusCode: 200, responseTimeMs: 120 },
  { checkedAt: '2026-09-03T10:05:00.000Z', success: true, statusCode: 200, responseTimeMs: 4200 },
  {
    checkedAt: '2026-09-03T10:10:00.000Z',
    success: false,
    statusCode: 503,
    errorType: 'SERVER_ERROR',
  },
];

describe('HealthTimeline', () => {
  it('renders one segment per check', () => {
    render(<HealthTimeline entries={entries} slowThresholdMs={3000} />);

    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('labels each segment for assistive technology', () => {
    render(<HealthTimeline entries={entries} slowThresholdMs={3000} />);

    // The strip is meaningless as pure colour; each segment states its outcome.
    expect(screen.getByRole('button', { name: /Online/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Slow/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Failed — SERVER_ERROR/ })).toBeInTheDocument();
  });

  it('classifies a success above the threshold as slow, not online', () => {
    render(<HealthTimeline entries={entries} slowThresholdMs={3000} />);

    // 4200ms succeeded but exceeded the site's own threshold.
    const slow = screen.getByRole('button', { name: /Slow/ });
    expect(slow).toBeInTheDocument();
  });

  it('respects the site’s own slow threshold', () => {
    // With a higher threshold the same 4200ms check is simply online.
    render(<HealthTimeline entries={entries} slowThresholdMs={5000} />);

    expect(screen.queryByRole('button', { name: /Slow/ })).not.toBeInTheDocument();
  });

  it('shows detail on focus, so it is reachable by keyboard', async () => {
    render(<HealthTimeline entries={entries} slowThresholdMs={3000} />);

    expect(screen.getByText(/Hover or focus a segment/)).toBeInTheDocument();

    // A mouse-only timeline hides its detail from keyboard users entirely.
    await userEvent.tab();

    expect(screen.queryByText(/Hover or focus a segment/)).not.toBeInTheDocument();
    expect(screen.getByText('120 ms')).toBeInTheDocument();
  });

  it('explains itself when there is nothing to show', () => {
    render(<HealthTimeline entries={[]} slowThresholdMs={3000} />);

    expect(screen.getByText(/No checks recorded yet/)).toBeInTheDocument();
  });
});
