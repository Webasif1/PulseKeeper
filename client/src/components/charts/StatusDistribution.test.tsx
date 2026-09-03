import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusDistribution } from './StatusDistribution';

describe('StatusDistribution', () => {
  it('shows each status with its count and share', () => {
    render(
      <StatusDistribution
        entries={[
          { statusCode: 200, count: 900 },
          { statusCode: 503, count: 100 },
        ]}
      />,
    );

    expect(screen.getByText('HTTP 200')).toBeInTheDocument();
    expect(screen.getByText('900 (90.0%)')).toBeInTheDocument();
    expect(screen.getByText('HTTP 503')).toBeInTheDocument();
    expect(screen.getByText('100 (10.0%)')).toBeInTheDocument();
  });

  it('names a missing status code rather than showing a blank row', () => {
    render(<StatusDistribution entries={[{ statusCode: null, count: 12 }]} />);

    // No status code means the request never got a reply — a timeout or DNS
    // failure — which is worse than any 5xx, not an absence of information.
    expect(screen.getByText('No response')).toBeInTheDocument();
  });

  it('explains an empty period', () => {
    render(<StatusDistribution entries={[]} />);

    expect(screen.getByText(/No checks in this period/)).toBeInTheDocument();
  });
});
