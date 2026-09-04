import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '../../config/env.js';
import { ChannelType } from '../../types/domain.js';
import { AppError } from '../../utils/AppError.js';

import type { ChannelAdapter, ChannelMessage } from './types.js';

/**
 * Email delivery over SMTP.
 *
 * Unavailable unless SMTP is configured. A self-hosted monitoring tool run by
 * one developer often has no mail relay, and offering a channel that silently
 * fails would be worse than not offering it.
 */

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (!env.isSmtpConfigured) {
    throw AppError.badRequest(
      'Email notifications are not available because SMTP is not configured on this server',
    );
  }

  // Created once and reused: nodemailer pools connections, and building a
  // transport per message would open a new SMTP session for every alert.
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER && env.SMTP_PASSWORD
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
      : {}),
  });

  return transporter;
}

/** Deliberately strict: a typo here means alerts silently go nowhere. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const emailAdapter: ChannelAdapter = {
  type: ChannelType.EMAIL,

  validateTarget(target) {
    if (!env.isSmtpConfigured) {
      return Promise.reject(
        AppError.badRequest(
          'Email notifications are not available because SMTP is not configured on this server',
        ),
      );
    }

    if (!EMAIL_PATTERN.test(target)) {
      return Promise.reject(AppError.badRequest('Enter a valid email address'));
    }

    return Promise.resolve();
  },

  async send(target, message: ChannelMessage) {
    const link = message.dashboardUrl ?? message.siteUrl;
    const accent = message.isRecovery ? '#16a34a' : '#dc2626';

    await getTransporter().sendMail({
      from: env.SMTP_FROM,
      to: target,
      subject: message.title,
      // Plain text first: some clients show it, and every client can read it.
      text: `${message.title}\n\n${message.body}\n\n${message.siteName} — ${message.siteUrl}\n${message.occurredAt.toISOString()}\n\n${link}`,
      html: `
        <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px">
          <p style="border-left:3px solid ${accent};margin:0 0 16px;padding:0 0 0 12px;font-size:16px;font-weight:600">
            ${escapeHtml(message.title)}
          </p>
          <p style="margin:0 0 16px;color:#374151">${escapeHtml(message.body)}</p>
          <p style="margin:0 0 16px;color:#6b7280;font-size:13px">
            ${escapeHtml(message.siteName)} — ${escapeHtml(message.siteUrl)}<br>
            ${message.occurredAt.toISOString()}
          </p>
          <a href="${escapeHtml(link)}" style="display:inline-block;background:#4f46e5;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:14px">
            Open PulseKeeper
          </a>
        </div>
      `,
    });
  },
};
