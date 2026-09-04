import { AlertTriangle, Hash, Mail, MessageSquare, Plus, Send, Trash2, Webhook } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/ui/Switch';
import { useRelativeTime } from '@/hooks/useRelativeTime';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/cn';
import { ApiError } from '@/services/api';
import * as channelService from '@/services/channel.service';

import { ChannelFormModal } from './ChannelFormModal';

import type { ChannelType, NotificationChannel } from '@/types/api';

const TYPE_ICON: Record<ChannelType, typeof Webhook> = {
  SLACK: Hash,
  DISCORD: MessageSquare,
  WEBHOOK: Webhook,
  EMAIL: Mail,
};

const TYPE_LABEL: Record<ChannelType, string> = {
  SLACK: 'Slack',
  DISCORD: 'Discord',
  WEBHOOK: 'Webhook',
  EMAIL: 'Email',
};

/** Where notifications are delivered, beyond the in-app feed (SPEC §18). */
export function ChannelList() {
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [emailAvailable, setEmailAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationChannel | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const result = await channelService.listChannels();
      setChannels(result.channels);
      setEmailAvailable(result.emailAvailable);
    } catch {
      toast.error('Could not load your notification channels');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleTest = async (channel: NotificationChannel) => {
    setTestingId(channel.id);

    try {
      await channelService.testChannel(channel.id);
      toast.success(`Test sent to ${channel.name}`, 'Check that it arrived.');
    } catch (caught) {
      // The failure is the answer someone pressing "test" is looking for, so
      // it is shown in full rather than reduced to "something went wrong".
      toast.error(
        `Test to ${channel.name} failed`,
        caught instanceof ApiError ? caught.message : 'Delivery failed',
      );
    } finally {
      setTestingId(null);
      void load();
    }
  };

  const handleToggle = async (channel: NotificationChannel, enabled: boolean) => {
    setChannels((current) =>
      current.map((entry) => (entry.id === channel.id ? { ...entry, enabled } : entry)),
    );

    try {
      await channelService.updateChannel(channel.id, { enabled });
    } catch {
      toast.error('Could not change that channel');
      void load();
    }
  };

  const handleDelete = async (channel: NotificationChannel) => {
    try {
      await channelService.deleteChannel(channel.id);
      setChannels((current) => current.filter((entry) => entry.id !== channel.id));
      toast.success(`${channel.name} removed`);
    } catch {
      toast.error('Could not remove that channel');
    }
  };

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <div className="space-y-4">
      {channels.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No delivery channels yet"
          description="Without one, alerts only appear in this dashboard. Add Slack, Discord, a webhook, or email to be told when something breaks."
          action={
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null);
                setIsFormOpen(true);
              }}
              leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            >
              Add channel
            </Button>
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-[var(--border-subtle)]">
            {channels.map((channel) => (
              <ChannelRow
                key={channel.id}
                channel={channel}
                isTesting={testingId === channel.id}
                onTest={() => void handleTest(channel)}
                onToggle={(enabled) => void handleToggle(channel, enabled)}
                onEdit={() => {
                  setEditing(channel);
                  setIsFormOpen(true);
                }}
                onDelete={() => void handleDelete(channel)}
              />
            ))}
          </ul>

          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setIsFormOpen(true);
            }}
            leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
          >
            Add channel
          </Button>
        </>
      )}

      <ChannelFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        channel={editing}
        emailAvailable={emailAvailable}
        onSaved={load}
      />
    </div>
  );
}

function ChannelRow({
  channel,
  isTesting,
  onTest,
  onToggle,
  onEdit,
  onDelete,
}: {
  channel: NotificationChannel;
  isTesting: boolean;
  onTest: () => void;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = TYPE_ICON[channel.type];
  const lastUsed = useRelativeTime(channel.lastUsedAt);

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-inset)]">
        <Icon className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{channel.name}</span>
          <span className="rounded-full bg-[var(--surface-inset)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
            {TYPE_LABEL[channel.type]}
          </span>
        </div>

        <p className="mt-0.5 truncate font-mono text-xs text-muted">{channel.targetPreview}</p>

        {channel.lastError ? (
          // A channel that quietly stopped working is worse than one that was
          // never configured, so the last failure is shown rather than hidden.
          <p className="mt-1 flex items-start gap-1.5 text-xs text-offline">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="min-w-0">{channel.lastError}</span>
          </p>
        ) : (
          channel.lastUsedAt && <p className="mt-1 text-xs text-muted">Last used {lastUsed.toLowerCase()}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Switch
          id={`channel-${channel.id}`}
          checked={channel.enabled}
          onChange={onToggle}
          label={`Deliver notifications to ${channel.name}`}
          hideLabel
        />

        <Button size="sm" onClick={onTest} isLoading={isTesting}>
          Test
        </Button>

        <Button size="sm" onClick={onEdit}>
          Edit
        </Button>

        <button
          type="button"
          onClick={onDelete}
          aria-label={`Remove ${channel.name}`}
          className={cn(
            'rounded-lg p-2 text-[var(--text-muted)] transition-colors',
            'hover:bg-[var(--surface-hover)] hover:text-offline',
          )}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
