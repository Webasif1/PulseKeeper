import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { SiteCard } from './SiteCard';

import type { Site } from '@/types/api';

const baseSite: Site = {
  id: '507f1f77bcf86cd799439011',
  name: 'Recallix',
  url: 'https://recallix.example.com',
  checkUrl: 'https://recallix.example.com',
  tags: [],
  monitoringEnabled: true,
  intervalMinutes: 5,
  timeoutSeconds: 10,
  slowThresholdMs: 3000,
  failureThreshold: 3,
  currentStatus: 'ONLINE',
  currentResponseTime: 382,
  currentStatusCode: 200,
  lastCheckedAt: new Date(Date.now() - 32_000).toISOString(),
  consecutiveFailures: 0,
  uptimePercentage: 99.92,
  isDemo: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function renderCard(overrides: Partial<Site> = {}, props: Record<string, unknown> = {}) {
  const handlers = {
    onCheckNow: vi.fn(),
    onEdit: vi.fn(),
    onTogglePause: vi.fn(),
    onDelete: vi.fn(),
  };

  render(
    <MemoryRouter>
      <SiteCard
        site={{ ...baseSite, ...overrides }}
        isChecking={false}
        isCoolingDown={false}
        {...handlers}
        {...props}
      />
    </MemoryRouter>,
  );

  return handlers;
}

describe('SiteCard', () => {
  it('shows the metrics that answer "is this healthy"', () => {
    renderCard();

    expect(screen.getByText('Recallix')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('382 ms')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('99.92%')).toBeInTheDocument();
  });

  it('shows a relative last-checked time', () => {
    renderCard();

    expect(screen.getByText('32 seconds ago')).toBeInTheDocument();
  });

  it('says "Paused" instead of a stale timestamp when monitoring is off', () => {
    renderCard({ monitoringEnabled: false, currentStatus: 'PAUSED' });

    // A paused site's last check recedes into the past; showing "3 days ago"
    // would imply monitoring is broken rather than deliberately stopped.
    expect(screen.queryByText('32 seconds ago')).not.toBeInTheDocument();
    // Once in the status badge, once where the timestamp would be.
    expect(screen.getAllByText('Paused')).toHaveLength(2);
  });

  it('renders an em dash where there is no data, not a zero', () => {
    renderCard({ currentResponseTime: undefined, currentStatusCode: undefined });

    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('triggers a check when the check button is pressed', async () => {
    const handlers = renderCard();

    await userEvent.click(screen.getByRole('button', { name: /check recallix now/i }));

    expect(handlers.onCheckNow).toHaveBeenCalledOnce();
  });

  it('disables the check button while a check is running', () => {
    renderCard({}, { isChecking: true });

    expect(screen.getByRole('button', { name: /check recallix now/i })).toBeDisabled();
  });

  it('disables the check button during the cooldown', () => {
    renderCard({}, { isCoolingDown: true });

    // The server allows 10 checks a minute; the cooldown keeps a user from
    // spending that budget and meeting a 429 they did not cause deliberately.
    expect(screen.getByRole('button', { name: /check recallix now/i })).toBeDisabled();
  });

  it('shows CHECKING while a check is in flight', () => {
    renderCard({}, { isChecking: true });

    expect(screen.getByText('Checking')).toBeInTheDocument();
    expect(screen.queryByText('Online')).not.toBeInTheDocument();
  });

  it('marks demo data as such', () => {
    renderCard({ isDemo: true });

    // SPEC §39: demo data must never be mistakable for real monitoring.
    expect(screen.getByText('Demo')).toBeInTheDocument();
  });

  it('offers pause for a live site and resume for a paused one', async () => {
    const handlers = renderCard();

    await userEvent.click(screen.getByRole('button', { name: /actions for recallix/i }));
    const pause = screen.getByRole('menuitem', { name: /pause monitoring/i });
    await userEvent.click(pause);

    expect(handlers.onTogglePause).toHaveBeenCalledOnce();
  });

  it('opens the external link in a new tab safely', () => {
    renderCard();

    const link = screen.getByRole('link', { name: /open recallix in a new tab/i });
    expect(link).toHaveAttribute('target', '_blank');
    // Without noreferrer the opened page can reach back through window.opener.
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });
});
