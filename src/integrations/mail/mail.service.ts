import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../../config/env.schema.js';

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string | undefined;

  constructor(config: ConfigService<Env, true>) {
    this.from = config.get('SMTP_EMAIL', { infer: true });
    this.transporter = nodemailer.createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      auth: {
        user: this.from,
        pass: config.get('SMTP_PASSWORD', { infer: true }),
      },
    });
  }

  async send({ to, subject, html }: MailOptions) {
    await this.transporter.sendMail({ from: this.from, to, subject, html });
  }
}
