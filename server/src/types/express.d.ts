import type { Types } from 'mongoose';

/** The authenticated principal attached by `requireAuth`. */
export interface AuthenticatedUser {
  id: string;
  objectId: Types.ObjectId;
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      /** Present only after `requireAuth` has run. */
      user?: AuthenticatedUser;
      /**
       * Output of the `validate` middleware. Express 5 exposes `req.query` as a
       * getter, so parsed input is stored here rather than written back onto
       * the request.
       */
      validated?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
