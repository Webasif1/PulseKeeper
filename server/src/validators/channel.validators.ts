import { z } from 'zod';

import { CHANNEL_TYPES } from '../types/domain.js';

export const createChannelSchema = z
  .object({
    type: z.enum(CHANNEL_TYPES as unknown as [string, ...string[]]),
    name: z.string().trim().min(1, 'Name is required').max(60),
    // Shape only. The adapter performs the real validation, including the SSRF
    // guard for webhook types, because that check is asynchronous.
    target: z.string().trim().min(1, 'Destination is required').max(2048),
  })
  .strict();

export const updateChannelSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    target: z.string().trim().min(1).max(2048),
    enabled: z.boolean(),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'Provide at least one field to update');

export const channelIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid channel id'),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
