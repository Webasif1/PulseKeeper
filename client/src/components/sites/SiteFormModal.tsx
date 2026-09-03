import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Textarea } from '@/components/ui/Textarea';
import { MONITORING_INTERVALS } from '@/constants/status';
import { useToast } from '@/hooks/useToast';
import { ApiError } from '@/services/api';
import * as siteService from '@/services/site.service';

import type { Site } from '@/types/api';

interface FormState {
  name: string;
  url: string;
  healthEndpoint: string;
  description: string;
  tags: string;
  monitoringEnabled: boolean;
  intervalMinutes: number;
  timeoutSeconds: number;
  slowThresholdMs: number;
  failureThreshold: number;
}

const EMPTY_FORM: FormState = {
  name: '',
  url: '',
  healthEndpoint: '',
  description: '',
  tags: '',
  monitoringEnabled: true,
  intervalMinutes: 5,
  timeoutSeconds: 10,
  slowThresholdMs: 3000,
  failureThreshold: 3,
};

function toFormState(site: Site): FormState {
  return {
    name: site.name,
    url: site.url,
    healthEndpoint: site.healthEndpoint ?? '',
    description: site.description ?? '',
    tags: site.tags.join(', '),
    monitoringEnabled: site.monitoringEnabled,
    intervalMinutes: site.intervalMinutes,
    timeoutSeconds: site.timeoutSeconds,
    slowThresholdMs: site.slowThresholdMs,
    failureThreshold: site.failureThreshold,
  };
}

/**
 * The URL that will actually be requested.
 *
 * Shown live because the distinction between the site URL and a dedicated
 * health endpoint is the single most confusing part of this form: without it,
 * nobody can tell which one the monitor is going to hit.
 */
function checkUrlPreview(form: FormState): string {
  return form.healthEndpoint.trim() || form.url.trim();
}

/** Client-side checks that mirror the server's, for immediate feedback. */
function validate(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.name.trim()) {
    errors.name = 'Name is required';
  }

  const url = form.url.trim();
  if (!url) {
    errors.url = 'URL is required';
  } else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        errors.url = 'Only http:// and https:// URLs can be monitored';
      }
    } catch {
      errors.url = 'Enter a valid URL, including http:// or https://';
    }
  }

  // The full SSRF rules live on the server and are enforced there; repeating
  // them here would duplicate security logic that must not diverge. This only
  // catches the obvious typo before a round trip.
  if (form.healthEndpoint.trim()) {
    try {
      new URL(form.healthEndpoint.trim());
    } catch {
      errors.healthEndpoint = 'Enter a valid URL, including http:// or https://';
    }
  }

  if (form.tags.trim().split(',').filter(Boolean).length > 10) {
    errors.tags = 'A site can have at most 10 tags';
  }

  return errors;
}

/** Add or edit a website (SPEC §34). */
export function SiteFormModal({
  isOpen,
  onClose,
  site,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Present when editing; absent when adding. */
  site?: Site | null;
  onSaved: (site: Site, mode: 'created' | 'updated') => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();

  const isEditing = Boolean(site);

  // Reset whenever the dialog opens, so a previous edit never bleeds into the
  // next one.
  useEffect(() => {
    if (!isOpen) return;
    setForm(site ? toFormState(site) : EMPTY_FORM);
    setErrors({});
  }, [isOpen, site]);

  const update = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);

    const payload = {
      name: form.name.trim(),
      url: form.url.trim(),
      healthEndpoint: form.healthEndpoint.trim() || undefined,
      description: form.description.trim() || undefined,
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      monitoringEnabled: form.monitoringEnabled,
      intervalMinutes: form.intervalMinutes,
      timeoutSeconds: form.timeoutSeconds,
      slowThresholdMs: form.slowThresholdMs,
      failureThreshold: form.failureThreshold,
    };

    try {
      const result = site
        ? await siteService.updateSite(site.id, payload)
        : await siteService.createSite(payload);

      onSaved(result.site, site ? 'updated' : 'created');
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError && caught.fieldErrors.length > 0) {
        // The SSRF guard reports on the `url` field, so a blocked address lands
        // next to the input that caused it rather than in a detached banner.
        setErrors(
          caught.fieldErrors.reduce<Record<string, string>>((map, entry) => {
            map[entry.field] = entry.message;
            return map;
          }, {}),
        );
      } else {
        toast.error(
          site ? 'Could not save changes' : 'Could not add website',
          caught instanceof ApiError ? caught.message : 'Please try again',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const preview = checkUrlPreview(form);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit website' : 'Add website'}
      description={
        isEditing
          ? 'Every field can be changed. Monitoring settings apply from the next check.'
          : 'PulseKeeper will check this URL on the interval you choose.'
      }
      size="lg"
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="site-form"
            variant="primary"
            isLoading={isSubmitting}
          >
            {isEditing ? 'Save changes' : 'Add website'}
          </Button>
        </>
      }
    >
      <form id="site-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
        <Input
          label="Website name"
          required
          value={form.name}
          onChange={(event) => update('name', event.target.value)}
          error={errors.name}
          placeholder="Recallix"
          maxLength={80}
        />

        <Input
          label="Website URL"
          required
          type="url"
          inputMode="url"
          value={form.url}
          onChange={(event) => update('url', event.target.value)}
          error={errors.url}
          placeholder="https://recallix.onrender.com"
          hint="Public http:// or https:// address. Private and internal addresses are refused."
        />

        <Input
          label="Health check URL"
          type="url"
          inputMode="url"
          value={form.healthEndpoint}
          onChange={(event) => update('healthEndpoint', event.target.value)}
          error={errors.healthEndpoint}
          placeholder="https://recallix.onrender.com/api/health"
          hint="Optional. A lightweight endpoint is cheaper to check than a full page."
        />

        {preview && (
          <div className="rounded-lg bg-[var(--surface-inset)] px-3 py-2.5">
            <p className="text-[11px] tracking-wide text-muted uppercase">Will check</p>
            <p className="mt-0.5 font-mono text-xs break-all">{preview}</p>
          </div>
        )}

        <Textarea
          label="Description"
          value={form.description}
          onChange={(event) => update('description', event.target.value)}
          placeholder="What this project is, for your own reference"
          maxLength={280}
        />

        <Input
          label="Tags"
          value={form.tags}
          onChange={(event) => update('tags', event.target.value)}
          error={errors.tags}
          placeholder="react, render, side-project"
          hint="Comma separated, up to 10. Useful for filtering later."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Check interval"
            value={form.intervalMinutes}
            onChange={(event) => update('intervalMinutes', Number(event.target.value))}
            options={MONITORING_INTERVALS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />

          <Input
            label="Timeout (seconds)"
            type="number"
            min={1}
            max={60}
            value={form.timeoutSeconds}
            onChange={(event) => update('timeoutSeconds', Number(event.target.value))}
            hint="1–60. A check that takes longer counts as offline."
          />

          <Input
            label="Slow threshold (ms)"
            type="number"
            min={100}
            max={60000}
            step={100}
            value={form.slowThresholdMs}
            onChange={(event) => update('slowThresholdMs', Number(event.target.value))}
            hint="Responses slower than this are marked slow, not offline."
          />

          <Input
            label="Failure threshold"
            type="number"
            min={1}
            max={10}
            value={form.failureThreshold}
            onChange={(event) => update('failureThreshold', Number(event.target.value))}
            hint="Consecutive failures before an incident opens."
          />
        </div>

        <div className="border-t border-[var(--border-subtle)] pt-4">
          <Switch
            id="monitoring-enabled"
            checked={form.monitoringEnabled}
            onChange={(checked) => update('monitoringEnabled', checked)}
            label="Monitoring enabled"
            description="Turn off to pause scheduled checks without deleting the site."
          />
        </div>
      </form>
    </Modal>
  );
}
