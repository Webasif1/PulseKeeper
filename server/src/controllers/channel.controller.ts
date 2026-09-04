import type { Request, Response } from 'express';

import { getAuthUser } from '../middleware/requireAuth.js';
import { validatedBody, validatedParams } from '../middleware/validate.js';
import * as channelService from '../services/channel.service.js';
import { env } from '../config/env.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import {
  channelIdParamSchema,
  createChannelSchema,
  updateChannelSchema,
} from '../validators/channel.validators.js';

import type { ChannelTypeValue } from '../types/domain.js';

export async function list(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);

  const channels = await channelService.listChannels(userId);

  // The client needs to know whether to offer email at all, and only the
  // server knows whether a relay is configured.
  sendSuccess(res, { channels, emailAvailable: env.isSmtpConfigured }, 'Notification channels');
}

export async function create(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);
  const input = validatedBody(req, createChannelSchema);

  const channel = await channelService.createChannel(userId, {
    type: input.type as ChannelTypeValue,
    name: input.name,
    target: input.target,
  });

  sendCreated(res, { channel }, 'Notification channel added');
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);
  const { id } = validatedParams(req, channelIdParamSchema);
  const input = validatedBody(req, updateChannelSchema);

  const channel = await channelService.updateChannel(userId, id, input);

  sendSuccess(res, { channel }, 'Notification channel updated');
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);
  const { id } = validatedParams(req, channelIdParamSchema);

  await channelService.deleteChannel(userId, id);

  sendSuccess(res, null, 'Notification channel deleted');
}

export async function test(req: Request, res: Response): Promise<void> {
  const { id: userId } = getAuthUser(req);
  const { id } = validatedParams(req, channelIdParamSchema);

  await channelService.testChannel(userId, id);

  sendSuccess(res, null, 'Test notification sent');
}
