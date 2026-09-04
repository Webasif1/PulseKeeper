import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/hooks/useToast';
import { ApiError } from '@/services/api';
import * as channelService from '@/services/channel.service';

import type { ChannelType, NotificationChannel } from '@/types/api';

interface TypeMeta {
  label: string;
  targetLabel: string;
  placeholder: string;
  hint: string;
}

const TYPE_META: Record<ChannelType, TypeMeta> = {
  SLACK: {
    label: 'Slack',
    targetLabel: 'Incoming webhook URL',
    placeholder: 'https://hooks.slack.com/services/T000/B000/xxxx',
    hint: 'Slack → Apps → Incoming Webhooks → Add New Webhook to Workspace.',
  },
  DISCORD: {
    label: 'Discord',
    targetLabel: 'Webhook URL',
    placeholder: 'https://discord.com/api/webhooks/000/xxxx',
    hint: 'Discord → Server Settings → Integrations → Webhooks → New Webhook.',
  },
  WEBHOOK: {
    label: 'Webhook',
    targetLabel: 'Endpoint URL',
    placeholder: 'https://example.com/hooks/pulsekeeper',
    hint: 'Receives a JSON POST. Must be https, and must not be a private address.',
  },
  EMAIL: {
    label: 'Email',
    targetLabel: 'Email address',
    placeholder: 'alerts@example.com',
    hint: 'Sent through the mail relay this server is configured with.',
  },
};

/**
 * Add or edit a delivery channel.
 *
 * On edit the target is left blank rather than pre-filled, because the server
 * never returns it — a webhook URL is a bearer secret. Leaving it blank means
 * "keep the existing destination".
 */
export function ChannelFormModal({
  isOpen,
  onClose,
  channel,
  emailAvailable,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  channel?: NotificationChannel | null;
  emailAvailable: boolean;
  onSaved: () => void;
}) {
  const [type, setType] = useState<ChannelType>('SLACK');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();

  const isEditing = Boolean(channel);

  useEffect(() => {
    if (!isOpen) return;
    setType(channel?.type ?? 'SLACK');
    setName(channel?.name ?? '');
    setTarget('');
    setErrors({});
  }, [isOpen, channel]);

  const meta = TYPE_META[type];

  const typeOptions = (Object.keys(TYPE_META) as ChannelType[])
    // Email is hidden entirely when the server has no relay, rather than shown
    // and then rejected on submit.
    .filter((option) => option !== 'EMAIL' || emailAvailable)
    .map((option) => ({ value: option, label: TYPE_META[option].label }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = 'Give this channel a name';
    if (!isEditing && !target.trim()) nextErrors.target = `${meta.targetLabel} is required`;

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      if (channel) {
        await channelService.updateChannel(channel.id, {
          name: name.trim(),
          // Only sent when the user actually typed a new destination.
          ...(target.trim() ? { target: target.trim() } : {}),
        });
        toast.success(`${name.trim()} updated`);
      } else {
        await channelService.createChannel({ type, name: name.trim(), target: target.trim() });
        toast.success(`${name.trim()} added`, 'Send a test to confirm it works.');
      }

      onSaved();
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError && caught.fieldErrors.length > 0) {
        setErrors(
          caught.fieldErrors.reduce<Record<string, string>>((map, entry) => {
            map[entry.field] = entry.message;
            return map;
          }, {}),
        );
      } else if (caught instanceof ApiError) {
        // The SSRF guard and the per-type URL rules report here, and they
        // describe the destination, so they belong on that field.
        setErrors({ target: caught.message });
      } else {
        toast.error('Could not save this channel');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit channel' : 'Add notification channel'}
      description={
        isEditing
          ? 'Leave the destination blank to keep the current one.'
          : 'PulseKeeper will send alerts here when a website goes down or recovers.'
      }
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="channel-form" variant="primary" isLoading={isSubmitting}>
            {isEditing ? 'Save changes' : 'Add channel'}
          </Button>
        </>
      }
    >
      <form id="channel-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Select
          label="Type"
          value={type}
          // The destination format differs per type, so changing it after
          // creation would invalidate the stored target.
          disabled={isEditing}
          onChange={(event) => setType(event.target.value as ChannelType)}
          options={typeOptions}
          hint={isEditing ? 'The type cannot be changed. Delete and re-add instead.' : undefined}
        />

        <Input
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          placeholder="Team Slack"
          maxLength={60}
        />

        <Input
          label={meta.targetLabel}
          required={!isEditing}
          type={type === 'EMAIL' ? 'email' : 'url'}
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          error={errors.target}
          placeholder={isEditing ? 'Unchanged' : meta.placeholder}
          hint={meta.hint}
        />
      </form>
    </Modal>
  );
}
