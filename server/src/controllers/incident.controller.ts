import type { Request, Response } from 'express';

import { getAuthUser } from '../middleware/requireAuth.js';
import { validatedParams, validatedQuery } from '../middleware/validate.js';
import {
  getIncidentById,
  listIncidents,
  type ListIncidentsQuery,
} from '../services/incident.query.service.js';
import { sendPaginated, sendSuccess } from '../utils/apiResponse.js';
import {
  incidentIdParamSchema,
  listIncidentsQuerySchema,
} from '../validators/analytics.validators.js';

export async function list(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);
  const query = validatedQuery(req, listIncidentsQuerySchema);

  const { items, total } = await listIncidents(userId, query as ListIncidentsQuery);

  sendPaginated(res, items, total, query.page, query.limit, 'Incidents');
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);
  const { id } = validatedParams(req, incidentIdParamSchema);

  const incident = await getIncidentById(userId, id);

  sendSuccess(res, { incident }, 'Incident');
}
