import { useCallback, useEffect, useState } from 'react';

import { AppShell } from '@/components/layout/AppShell';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/ui/Switch';
import { MONITORING_INTERVALS, RETENTION_OPTIONS } from '@/constants/status';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/hooks/useToast';
import { ApiError } from '@/services/api';
import * as settingsService from '@/services/settings.service';
import { formatDateTime } from '@/utils/format';

import type { Settings, ThemePreference } from '@/types/api';

/** Account settings (SPEC §36). */
export function SettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { settings: loaded } = await settingsService.getSettings();
      setSettings(loaded);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load your settings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Save one field at a time.
   *
   * There is no Save button: each control writes on change, which suits a page
   * of independent preferences and removes the "did that stick?" question a
   * form-wide save leaves behind. The field name drives a per-control busy
   * state so the whole page does not freeze for one toggle.
   */
  const save = useCallback(
    async (changes: Partial<Settings>, fieldName: string) => {
      const previous = settings;
      setSavingField(fieldName);

      // Optimistic, so the control responds immediately.
      setSettings((current) => (current ? { ...current, ...changes } : current));

      try {
        const { settings: updated } = await settingsService.updateSettings(changes);
        setSettings(updated);
      } catch (caught) {
        setSettings(previous);
        toast.error(
          'Could not save that change',
          caught instanceof ApiError ? caught.message : 'Please try again',
        );
      } finally {
        setSavingField(null);
      }
    },
    [settings, toast],
  );

  const handleThemeChange = (next: ThemePreference) => {
    // Applied locally first so the change is instant and survives a reload
    // before the request finishes, then stored on the account so a different
    // device picks it up.
    setTheme(next);
    void save({ theme: next }, 'theme');
  };

  if (error) {
    return (
      <AppShell title="Settings">
        <Card>
          <ErrorState message={error} onRetry={() => void load()} />
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Settings" description="Defaults, notifications, appearance, and your account">
      <div className="max-w-3xl space-y-6">
        <Card>
          <CardHeader
            title="Monitoring defaults"
            description="Applied to new websites. Existing websites keep their own settings."
          />
          <CardBody className="space-y-4">
            {isLoading || !settings ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Default check interval"
                  value={settings.defaultIntervalMinutes}
                  disabled={savingField === 'interval'}
                  onChange={(event) =>
                    void save(
                      { defaultIntervalMinutes: Number(event.target.value) },
                      'interval',
                    )
                  }
                  options={MONITORING_INTERVALS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                />

                <Input
                  label="Default timeout (seconds)"
                  type="number"
                  min={1}
                  max={60}
                  value={settings.defaultTimeoutSeconds}
                  disabled={savingField === 'timeout'}
                  onChange={(event) =>
                    void save({ defaultTimeoutSeconds: Number(event.target.value) }, 'timeout')
                  }
                />

                <Input
                  label="Default slow threshold (ms)"
                  type="number"
                  min={100}
                  max={60000}
                  step={100}
                  value={settings.defaultSlowThresholdMs}
                  disabled={savingField === 'slow'}
                  onChange={(event) =>
                    void save({ defaultSlowThresholdMs: Number(event.target.value) }, 'slow')
                  }
                />

                <Input
                  label="Default failure threshold"
                  type="number"
                  min={1}
                  max={10}
                  value={settings.defaultFailureThreshold}
                  disabled={savingField === 'failure'}
                  onChange={(event) =>
                    void save(
                      { defaultFailureThreshold: Number(event.target.value) },
                      'failure',
                    )
                  }
                  hint="Consecutive failures before an incident opens"
                />
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Notifications"
            description="Which events add a notification to your feed"
          />
          <CardBody className="space-y-4">
            {isLoading || !settings ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <Switch
                  id="notify-down"
                  checked={settings.notifications.onDown}
                  onChange={(checked) =>
                    void save({ notifications: { ...settings.notifications, onDown: checked } }, 'onDown')
                  }
                  label="When a website goes down"
                  description="Sent when an incident opens after repeated failures"
                />
                <Switch
                  id="notify-up"
                  checked={settings.notifications.onUp}
                  onChange={(checked) =>
                    void save({ notifications: { ...settings.notifications, onUp: checked } }, 'onUp')
                  }
                  label="When a website recovers"
                  description="Sent when an open incident resolves"
                />
                <Switch
                  id="notify-slow"
                  checked={settings.notifications.onSlow}
                  onChange={(checked) =>
                    void save({ notifications: { ...settings.notifications, onSlow: checked } }, 'onSlow')
                  }
                  label="When a website becomes slow"
                  description="Responses above the site's slow threshold. Off by default, as this can be noisy."
                />
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Appearance" description="How PulseKeeper looks" />
          <CardBody>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Colour theme</p>
                <p className="mt-0.5 text-xs text-muted">
                  System follows your device. Your choice is saved to your account.
                </p>
              </div>
              <ThemeToggle onChange={handleThemeChange} value={theme} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Data retention"
            description="How long individual health checks are kept before being deleted"
          />
          <CardBody className="space-y-3">
            {isLoading || !settings ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <>
                <Select
                  label="Keep health checks for"
                  className="sm:max-w-xs"
                  value={settings.dataRetentionDays}
                  disabled={savingField === 'retention'}
                  onChange={(event) =>
                    void save({ dataRetentionDays: Number(event.target.value) }, 'retention')
                  }
                  options={RETENTION_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                />
                <p className="text-xs text-muted">
                  Older checks are removed by a daily cleanup. Incidents are kept regardless, so
                  outage history survives beyond this window.
                </p>
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Account" description="Your sign-in details" />
          <CardBody>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs tracking-wide text-muted uppercase">Name</dt>
                <dd className="mt-0.5 text-sm">{user?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs tracking-wide text-muted uppercase">Email</dt>
                <dd className="mt-0.5 text-sm">{user?.email ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs tracking-wide text-muted uppercase">Member since</dt>
                <dd className="mt-0.5 text-sm">{formatDateTime(user?.createdAt)}</dd>
              </div>
            </dl>

            <p className="mt-4 text-xs text-muted">
              Changing your name, email, or password is not available yet.
            </p>
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}
