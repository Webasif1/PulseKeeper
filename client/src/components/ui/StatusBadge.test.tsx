import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from './StatusBadge';

import type { SiteStatus } from '@/types/api';

describe('StatusBadge', () => {
  it.each<[SiteStatus, string]>([
    ['ONLINE', 'Online'],
    ['SLOW', 'Slow'],
    ['OFFLINE', 'Offline'],
    ['PAUSED', 'Paused'],
    ['UNKNOWN', 'Unknown'],
    ['CHECKING', 'Checking'],
  ])('renders %s with a text label, not colour alone', (status, label) => {
    render(<StatusBadge status={status} />);

    // SPEC §32: status must never be communicated by colour alone. Anyone with
    // a red/green colour vision deficiency would otherwise be unable to read
    // the single most important field on the page.
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('hides its decorative icon from assistive technology', () => {
    const { container } = render(<StatusBadge status="ONLINE" />);

    // The label already carries the meaning; announcing the icon too would
    // just repeat it.
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
