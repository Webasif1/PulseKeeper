import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { NotificationItem } from './NotificationItem';

import type { AppNotification } from '@/types/api';

const unread: AppNotification = {
  id: '1',
  siteId: 'site-1',
  type: 'SITE_DOWN',
  title: 'Movie Spark is down',
  message: 'Server returned HTTP 503',
  read: false,
  createdAt: new Date(Date.now() - 120_000).toISOString(),
};

function renderItem(overrides: Partial<AppNotification> = {}) {
  const onMarkRead = vi.fn();

  render(
    <MemoryRouter>
      <NotificationItem
        notification={{ ...unread, ...overrides }}
        onMarkRead={onMarkRead}
      />
    </MemoryRouter>,
  );

  return onMarkRead;
}

describe('NotificationItem', () => {
  it('shows the title, message, and relative time', () => {
    renderItem();

    expect(screen.getByText('Movie Spark is down')).toBeInTheDocument();
    expect(screen.getByText('Server returned HTTP 503')).toBeInTheDocument();
    expect(screen.getByText('2 minutes ago')).toBeInTheDocument();
  });

  it('marks unread state with a label, not styling alone', () => {
    renderItem();

    // A bold-versus-normal difference is easy to miss in a long list, and
    // invisible to anyone not seeing the styling at all.
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('offers "Mark read" only while unread', () => {
    renderItem({ read: true });

    expect(screen.queryByText('New')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark read/i })).not.toBeInTheDocument();
  });

  it('reports the notification id when marked read', async () => {
    const onMarkRead = renderItem();

    await userEvent.click(screen.getByRole('button', { name: /mark read/i }));

    expect(onMarkRead).toHaveBeenCalledWith('1');
  });

  it('links to the affected site when there is one', () => {
    renderItem();

    expect(screen.getByRole('link', { name: /view website/i })).toHaveAttribute(
      'href',
      '/sites/site-1',
    );
  });

  it('omits the site link for a notification with no site', () => {
    renderItem({ siteId: undefined });

    expect(screen.queryByRole('link', { name: /view website/i })).not.toBeInTheDocument();
  });

  it('uses a recovery icon and tone for a site coming back up', () => {
    const { container } = render(
      <MemoryRouter>
        <NotificationItem
          notification={{ ...unread, type: 'SITE_UP', title: 'Movie Spark is back online' }}
          onMarkRead={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(container.querySelector('.text-online')).toBeInTheDocument();
  });
});
