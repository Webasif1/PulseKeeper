import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UptimeWindows } from './UptimeWindows';

describe('UptimeWindows', () => {
  it('shows each window with two decimals', () => {
    render(
      <UptimeWindows uptime={{ '24h': 99.99, '7d': 99.9, '30d': 98.5, '90d': 97.2 }} />,
    );

    expect(screen.getByText('99.99%')).toBeInTheDocument();
    expect(screen.getByText('99.90%')).toBeInTheDocument();
  });

  it('distinguishes a total outage from no data at all', () => {
    render(<UptimeWindows uptime={{ '24h': 0, '7d': null, '30d': 50, '90d': null }} />);

    // 0% means the site failed every check in that window — the single worst
    // reading in the product. Rendering it as "—" would hide a total outage,
    // and rendering an empty window as "0.00%" would invent one.
    expect(screen.getByText('0.00%')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('shows a dash before any data has loaded', () => {
    render(<UptimeWindows />);

    expect(screen.getAllByText('—')).toHaveLength(4);
  });

  it('labels all four reported windows', () => {
    render(<UptimeWindows uptime={{ '24h': 100, '7d': 100, '30d': 100, '90d': 100 }} />);

    expect(screen.getByText('Last 24 hours')).toBeInTheDocument();
    expect(screen.getByText('Last 7 days')).toBeInTheDocument();
    expect(screen.getByText('Last 30 days')).toBeInTheDocument();
    expect(screen.getByText('Last 90 days')).toBeInTheDocument();
  });
});
