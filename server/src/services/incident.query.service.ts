import { Types, type FilterQuery } from 'mongoose';

import { Incident, type IIncident } from '../models/index.js';
import { IncidentStatus, type IncidentStatusValue } from '../types/domain.js';
import { AppError } from '../utils/AppError.js';

/**
 * Reading incidents for the UI.
 *
 * Kept apart from `incident.service.ts`, which owns the write side — opening
 * and resolving during a sweep. Mixing query concerns into that file would blur
 * a boundary worth keeping sharp.
 */

export interface PublicIncident {
  id: string;
  siteId: string;
  siteName: string;
  siteUrl: string;
  status: IncidentStatusValue;
  reason: string;
  errorType?: string;
  statusCode?: number;
  startedAt: Date;
  resolvedAt?: Date;
  durationSeconds?: number;
  failedChecks: number;
}

type IncidentRow = IIncident & {
  _id: Types.ObjectId;
  site?: { name: string; url: string } | null;
};

function toPublicIncident(incident: IncidentRow, now: Date): PublicIncident {
  // An open incident has no stored duration; report how long it has been
  // running so the UI does not have to compute it and disagree with the API.
  const durationSeconds =
    incident.durationSeconds ??
    (incident.status === IncidentStatus.ACTIVE
      ? Math.max(0, Math.round((now.getTime() - incident.startedAt.getTime()) / 1000))
      : undefined);

  return {
    id: incident._id.toString(),
    siteId: incident.siteId.toString(),
    siteName: incident.site?.name ?? 'Deleted site',
    siteUrl: incident.site?.url ?? '',
    status: incident.status,
    reason: incident.reason,
    ...(incident.errorType ? { errorType: incident.errorType } : {}),
    ...(incident.statusCode !== undefined ? { statusCode: incident.statusCode } : {}),
    startedAt: incident.startedAt,
    ...(incident.resolvedAt ? { resolvedAt: incident.resolvedAt } : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    failedChecks: incident.failedChecks,
  };
}

export interface ListIncidentsQuery {
  status?: IncidentStatusValue | 'ALL';
  siteId?: string;
  page: number;
  limit: number;
}

export async function listIncidents(
  userId: string,
  query: ListIncidentsQuery,
  now: Date = new Date(),
): Promise<{ items: PublicIncident[]; total: number }> {
  const filter: FilterQuery<IIncident> = { userId: new Types.ObjectId(userId) };

  if (query.status && query.status !== 'ALL') {
    filter.status = query.status;
  }

  if (query.siteId) {
    filter.siteId = new Types.ObjectId(query.siteId);
  }

  const [rows, total] = await Promise.all([
    Incident.aggregate<IncidentRow>([
      { $match: filter },
      // Active first, then newest: an ongoing outage matters more than history.
      { $sort: { status: 1, startedAt: -1 } },
      { $skip: (query.page - 1) * query.limit },
      { $limit: query.limit },
      {
        $lookup: {
          from: 'sites',
          localField: 'siteId',
          foreignField: '_id',
          pipeline: [{ $project: { name: 1, url: 1 } }],
          as: 'site',
        },
      },
      { $set: { site: { $first: '$site' } } },
    ]),
    Incident.countDocuments(filter),
  ]);

  return { items: rows.map((row) => toPublicIncident(row, now)), total };
}

export async function getIncidentById(
  userId: string,
  incidentId: string,
  now: Date = new Date(),
): Promise<PublicIncident> {
  const [row] = await Incident.aggregate<IncidentRow>([
    { $match: { _id: new Types.ObjectId(incidentId), userId: new Types.ObjectId(userId) } },
    {
      $lookup: {
        from: 'sites',
        localField: 'siteId',
        foreignField: '_id',
        pipeline: [{ $project: { name: 1, url: 1 } }],
        as: 'site',
      },
    },
    { $set: { site: { $first: '$site' } } },
  ]);

  if (!row) {
    throw AppError.notFound('Incident not found');
  }

  return toPublicIncident(row, now);
}
