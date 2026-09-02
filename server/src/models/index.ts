/**
 * Model registry.
 *
 * Importing from here guarantees every schema is registered with mongoose
 * before any populate() call needs it.
 */
export { HealthCheck } from './HealthCheck.js';
export type { HealthCheckDocument, IHealthCheck } from './HealthCheck.js';

export { Incident } from './Incident.js';
export type { IIncident, IncidentDocument } from './Incident.js';

export { MonitorRun } from './MonitorRun.js';
export type { IMonitorRun, MonitorRunDocument } from './MonitorRun.js';

export { Notification } from './Notification.js';
export type { INotification, NotificationDocument } from './Notification.js';

export { Settings } from './Settings.js';
export type { ISettings, SettingsDocument } from './Settings.js';

export { Site } from './Site.js';
export type { ISite, SiteDocument } from './Site.js';

export { User } from './User.js';
export type { IUser, UserDocument } from './User.js';
