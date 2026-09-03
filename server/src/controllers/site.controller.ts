import type { Request, Response } from 'express';

import { getAuthUser } from '../middleware/requireAuth.js';
import { validatedBody, validatedParams, validatedQuery } from '../middleware/validate.js';
import {
  createSite,
  deleteSite,
  getSiteById,
  listSites,
  updateSite,
} from '../services/site.service.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/apiResponse.js';
import {
  createSiteSchema,
  listSitesQuerySchema,
  siteIdParamSchema,
  updateSiteSchema,
} from '../validators/site.validators.js';

export async function list(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);
  const query = validatedQuery(req, listSitesQuerySchema);

  const { items, total } = await listSites(userId, query);

  sendPaginated(res, items, total, query.page, query.limit, 'Sites');
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);
  const { id } = validatedParams(req, siteIdParamSchema);

  const site = await getSiteById(userId, id);

  sendSuccess(res, { site }, 'Site');
}

export async function create(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);
  const input = validatedBody(req, createSiteSchema);

  const site = await createSite(userId, input);

  sendCreated(res, { site }, 'Site added');
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);
  const { id } = validatedParams(req, siteIdParamSchema);
  const input = validatedBody(req, updateSiteSchema);

  const site = await updateSite(userId, id, input);

  sendSuccess(res, { site }, 'Site updated');
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);
  const { id } = validatedParams(req, siteIdParamSchema);

  await deleteSite(userId, id);

  sendSuccess(res, null, 'Site deleted');
}
