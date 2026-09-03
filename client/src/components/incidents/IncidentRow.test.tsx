import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { IncidentRow } from './IncidentRow';

import type { Incident } from '@/types/api';

const resolved: Incident = {
  id: '1',
  siteId: 'site-1',
  siteName: 'Movie Spark',
  siteUrl: 'https://moviespark.example.com',
  status: 'RESOLVED',
  reason: 'Server returned HTTP 503',
  startedAt: '2026-09-03T02:14:00.000Z',
  resolvedAt: '2026-09-03T02:19:00.000Z',
  durationSeconds: 300,
  failedChecks: 3,
};

const active: Incident = {
  ...resolved,
  id: '2',
  status: 'ACTIVE',
  resolvedAt: undefined,
  durationSeconds: 1921,
};

describe('IncidentRow', () => {
  it('shows the site, reason, and duration', () => {
    render(
      <MemoryRouter>
        <IncidentRow incident={resolved} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Movie Spark')).toBeInTheDocument();
    expect(screen.getByText('Server returned HTTP 503')).toBeInTheDocument();
    expect(screen.getByText('5m')).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
  });

  it('labels an ongoing incident and its running duration', () => {
    render(
      <MemoryRouter>
        <IncidentRow incident={active} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Ongoing')).toBeInTheDocument();
    // The heading changes too: "Duration" would imply the outage has finished.
    expect(screen.getByText('Ongoing for')).toBeInTheDocument();
    expect(screen.getByText('32m')).toBeInTheDocument();
  });

  it('shows a dash where an unresolved incident has no end time', () => {
    render(
      <MemoryRouter>
        <IncidentRow incident={active} />
      </MemoryRouter>,
    );

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('links to the affected site', () => {
    render(
      <MemoryRouter>
        <IncidentRow incident={resolved} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Movie Spark' })).toHaveAttribute(
      'href',
      '/sites/site-1',
    );
  });
});
