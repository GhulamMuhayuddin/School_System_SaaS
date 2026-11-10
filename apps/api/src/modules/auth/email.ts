import nodemailer, { type Transporter } from 'nodemailer';
import type { Logger } from 'pino';
import type { Env } from '../../config/env';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailService {
  send(message: EmailMessage): Promise<void>;
}

/** Development transport: writes the email to the server log. It does NOT send anything. */
export class ConsoleEmailService implements EmailService {
  constructor(private readonly logger: Logger) {}
  async send(message: EmailMessage): Promise<void> {
    this.logger.warn({ to: message.to, subject: message.subject, body: message.text }, 'EMAIL NOT SENT (console transport, development only)');
  }
}

/** Real delivery over SMTP. Configure SMTP_* in .env. */
export class SmtpEmailService implements EmailService {
  private readonly transporter: Transporter;
  constructor(
    private readonly from: string,
    options: { host: string; port: number; secure: boolean; user?: string; pass?: string },
  ) {
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      // fail in seconds with a readable error instead of hanging until the platform kills the request
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      ...(options.user ? { auth: { user: options.user, pass: options.pass ?? '' } } : {}),
    });
  }
  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to: message.to, subject: message.subject, text: message.text, html: message.html });
  }
}

export function createEmailService(env: Env, logger: Logger): EmailService {
  if (env.EMAIL_TRANSPORT === 'smtp') {
    return new SmtpEmailService(env.EMAIL_FROM, {
      host: env.SMTP_HOST ?? '',
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    });
  }
  return new ConsoleEmailService(logger);
}

export function resetPasswordEmail(to: string, link: string, minutes: number): EmailMessage {
  const text = [
    'Nexora School ERP',
    '',
    `We received a request to reset your password. Open this link within ${minutes} minutes:`,
    link,
    '',
    'If you did not ask for this, you can ignore this email; your password stays the same.',
    '',
    `پاس ورڈ ری سیٹ کرنے کی درخواست موصول ہوئی۔ ${minutes} منٹ کے اندر یہ لنک کھولیں۔ اگر آپ نے درخواست نہیں کی تو اس ای میل کو نظر انداز کر دیں۔`,
  ].join('\n');
  const html = `<p>We received a request to reset your Nexora School ERP password.</p><p><a href="${link}">Reset password</a> (valid for ${minutes} minutes)</p><p>If you did not ask for this, ignore this email.</p>`;
  return { to, subject: 'Reset your password - Nexora School ERP', text, html };
}
