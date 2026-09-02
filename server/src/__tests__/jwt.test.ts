import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { AppError } from '../utils/AppError.js';
import { signAuthToken, verifyAuthToken } from '../utils/jwt.js';

const secret = process.env.JWT_SECRET as string;
const payload = { userId: '507f1f77bcf86cd799439011', email: 'asif@example.com' };

describe('signAuthToken', () => {
  it('round-trips the subject and email', () => {
    const { token } = signAuthToken(payload);
    const decoded = verifyAuthToken(token);

    expect(decoded.sub).toBe(payload.userId);
    expect(decoded.email).toBe(payload.email);
  });

  it('reports an expiry in the future', () => {
    const { expiresAt } = signAuthToken(payload);

    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('verifyAuthToken', () => {
  it('rejects a tampered signature', () => {
    const { token } = signAuthToken(payload);

    expect(() => verifyAuthToken(`${token.slice(0, -4)}aaaa`)).toThrow(AppError);
  });

  it('rejects a token signed with a different secret', () => {
    const forged = jwt.sign({ email: payload.email }, 'a-completely-different-secret-value', {
      subject: payload.userId,
      issuer: 'pulsekeeper',
      audience: 'pulsekeeper-dashboard',
    });

    expect(() => verifyAuthToken(forged)).toThrow(/Invalid authentication token/);
  });

  it('rejects a token from another issuer', () => {
    const foreign = jwt.sign({ email: payload.email }, secret, {
      subject: payload.userId,
      issuer: 'some-other-service',
      audience: 'pulsekeeper-dashboard',
    });

    expect(() => verifyAuthToken(foreign)).toThrow(/Invalid authentication token/);
  });

  it('rejects an unsigned "alg: none" token', () => {
    // The classic JWT downgrade: strip the signature and claim no algorithm.
    // Pinning algorithms: ['HS256'] at verification is what defeats it.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({
        sub: payload.userId,
        email: payload.email,
        iss: 'pulsekeeper',
        aud: 'pulsekeeper-dashboard',
      }),
    ).toString('base64url');

    expect(() => verifyAuthToken(`${header}.${body}.`)).toThrow(AppError);
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ email: payload.email }, secret, {
      subject: payload.userId,
      issuer: 'pulsekeeper',
      audience: 'pulsekeeper-dashboard',
      expiresIn: '-1s',
    });

    expect(() => verifyAuthToken(expired)).toThrow(/session has expired/);
  });

  it('rejects a malformed token', () => {
    expect(() => verifyAuthToken('not-a-token')).toThrow(AppError);
  });
});
