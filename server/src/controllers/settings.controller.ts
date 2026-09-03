import type { Request, Response } from 'express';

import { getAuthUser } from '../middleware/requireAuth.js';
import { validatedBody } from '../middleware/validate.js';
import { getSettings, updateSettings } from '../services/settings.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { updateSettingsSchema } from '../validators/settings.validators.js';

export async function get(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);

  const settings = await getSettings(userId);

  sendSuccess(res, { settings }, 'Settings');
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);
  const input = validatedBody(req, updateSettingsSchema);

  const settings = await updateSettings(userId, input);

  sendSuccess(res, { settings }, 'Settings updated');
}
