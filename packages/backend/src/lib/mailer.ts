import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error-handler.js';

let transporterPromise: Promise<nodemailer.Transporter> | null = null;

export function isMailerConfigured(): boolean {
  return Boolean(
    env.SMTP_HOST.trim()
    && env.SMTP_USER.trim()
    && env.SMTP_PASS.trim()
    && env.MAIL_FROM.trim(),
  );
}

async function getTransporter() {
  if (!isMailerConfigured()) {
    throw new AppError(
      503,
      'MAILER_NOT_CONFIGURED',
      'Отправка писем пока не настроена. Укажите SMTP-параметры в окружении.',
    );
  }

  transporterPromise ??= Promise.resolve(nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  }));

  return transporterPromise;
}

export async function sendMail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const transporter = await getTransporter();

  await transporter.sendMail({
    from: env.MAIL_FROM,
    replyTo: env.MAIL_REPLY_TO || undefined,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
}
