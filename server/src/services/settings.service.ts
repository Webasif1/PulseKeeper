import { Settings, type ISettings } from '../models/index.js';
import type { ThemePreferenceValue } from '../types/domain.js';
import type { UpdateSettingsInput } from '../validators/settings.validators.js';

export interface PublicSettings {
  defaultIntervalMinutes: number;
  defaultTimeoutSeconds: number;
  defaultSlowThresholdMs: number;
  defaultFailureThreshold: number;
  dataRetentionDays: number;
  notifications: { onDown: boolean; onUp: boolean; onSlow: boolean };
  theme: ThemePreferenceValue;
}

function toPublicSettings(settings: ISettings): PublicSettings {
  return {
    defaultIntervalMinutes: settings.defaultIntervalMinutes,
    defaultTimeoutSeconds: settings.defaultTimeoutSeconds,
    defaultSlowThresholdMs: settings.defaultSlowThresholdMs,
    defaultFailureThreshold: settings.defaultFailureThreshold,
    dataRetentionDays: settings.dataRetentionDays,
    notifications: settings.notifications,
    theme: settings.theme,
  };
}

/**
 * Read a user's settings, creating them if absent.
 *
 * Registration creates the document, so this normally finds one. The upsert
 * covers accounts created before settings existed and any future path that
 * makes a user without going through registration — the endpoint should never
 * fail because a defaults document is missing.
 */
export async function getSettings(userId: string): Promise<PublicSettings> {
  const settings = await Settings.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  return toPublicSettings(settings as ISettings);
}

/**
 * Update settings.
 *
 * Monitoring values here are defaults for *new* sites. Existing sites keep
 * their own copies, so changing a default never silently alters how a site
 * already being monitored is checked.
 */
export async function updateSettings(
  userId: string,
  input: UpdateSettingsInput,
): Promise<PublicSettings> {
  const update: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (key === 'notifications' && value && typeof value === 'object') {
      // Dotted paths so a partial notifications object does not wipe the
      // preferences it omits.
      for (const [preference, enabled] of Object.entries(value)) {
        update[`notifications.${preference}`] = enabled;
      }
    } else if (value !== undefined) {
      update[key] = value;
    }
  }

  const settings = await Settings.findOneAndUpdate(
    { userId },
    { $set: update, $setOnInsert: { userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
  ).lean();

  return toPublicSettings(settings as ISettings);
}
