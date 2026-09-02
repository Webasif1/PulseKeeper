import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validate a request against Zod schemas.
 *
 * Results land on `req.validated` rather than replacing `req.body`/`req.query`,
 * because Express 5 defines `req.query` as a getter and assigning to it throws.
 * Controllers read the parsed values through the typed helpers below, which
 * also means an unvalidated route cannot accidentally read coerced input.
 *
 * Failures are thrown as ZodError; the error handler renders them as
 * field-level messages.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const validated: NonNullable<Request['validated']> = {};

      if (schemas.body) validated.body = schemas.body.parse(req.body);
      if (schemas.query) validated.query = schemas.query.parse(req.query);
      if (schemas.params) validated.params = schemas.params.parse(req.params);

      req.validated = validated;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validatedBody<T extends ZodTypeAny>(req: Request, _schema: T): z.infer<T> {
  return req.validated?.body as z.infer<T>;
}

export function validatedQuery<T extends ZodTypeAny>(req: Request, _schema: T): z.infer<T> {
  return req.validated?.query as z.infer<T>;
}

export function validatedParams<T extends ZodTypeAny>(req: Request, _schema: T): z.infer<T> {
  return req.validated?.params as z.infer<T>;
}
