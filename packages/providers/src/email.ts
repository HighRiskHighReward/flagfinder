import nodemailer, { type Transporter } from "nodemailer";
import type pg from "pg";
import type { Env } from "@ff/config";

export interface EmailMessage { to: string; subject: string; text: string }
export interface EmailTransport { name: string; send(m: EmailMessage): Promise<void> }

/** Dev/test catcher: writes to the email_outbox table and logs to console. Never delivers. */
export class OutboxTransport implements EmailTransport {
  name = "outbox";
  constructor(private db: pg.Pool) {}
  async send(m: EmailMessage) {
    await this.db.query(`INSERT INTO email_outbox (to_address, subject, body_text, transport) VALUES ($1,$2,$3,'outbox')`, [m.to, m.subject, m.text]);
    console.log(JSON.stringify({ level: "info", msg: "email captured in outbox (not sent)", to: m.to, subject: m.subject }));
  }
}

const LOCAL_SMTP = /^smtps?:\/\/(localhost|127\.0\.0\.1|mailpit|\[::1\])(:\d+)?/i;

/** SMTP to a local catcher such as Mailpit. Outside production only localhost/mailpit hosts are allowed. */
export class SmtpTransport implements EmailTransport {
  name = "smtp";
  private t: Transporter;
  constructor(url: string, private from: string, private db: pg.Pool, nodeEnv: string) {
    if (nodeEnv !== "production" && !LOCAL_SMTP.test(url)) throw new Error("Refusing non-local SMTP outside production (Invariant 12). Use Mailpit on localhost.");
    this.t = nodemailer.createTransport(url);
  }
  async send(m: EmailMessage) {
    await this.t.sendMail({ from: this.from, to: m.to, subject: m.subject, text: m.text });
    await this.db.query(`INSERT INTO email_outbox (to_address, subject, body_text, transport) VALUES ($1,$2,$3,'smtp')`, [m.to, m.subject, m.text]);
  }
}

/** Real delivery. Refuses to initialize outside production (Invariant 12). */
export class ProductionTransport implements EmailTransport {
  name = "production";
  private t: Transporter;
  constructor(url: string, private from: string, nodeEnv: string) {
    if (nodeEnv !== "production") throw new Error("Production email transport refuses to initialize outside APP_ENV=production (Invariant 12).");
    this.t = nodemailer.createTransport(url);
  }
  async send(m: EmailMessage) { await this.t.sendMail({ from: this.from, to: m.to, subject: m.subject, text: m.text }); }
}

export function createEmailTransport(env: Env, db: pg.Pool): EmailTransport {
  if (env.EMAIL_TRANSPORT === "production") {
    if (!env.SMTP_URL) throw new Error("EMAIL_TRANSPORT=production requires SMTP_URL");
    return new ProductionTransport(env.SMTP_URL, env.EMAIL_FROM, env.appEnv);
  }
  if (env.EMAIL_TRANSPORT === "smtp" && env.SMTP_URL) return new SmtpTransport(env.SMTP_URL, env.EMAIL_FROM, db, env.appEnv);
  return new OutboxTransport(db);
}
