import nodemailer, { type Transporter } from "nodemailer";
import { config, emailConfigured } from "../config.js";

let transporter: Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

/**
 * Sends an email. Returns "SENT" only when the mail server accepted the message,
 * "NOT_CONFIGURED" when SMTP isn't set up, or "FAILED". We never report a send that didn't happen.
 */
export async function sendMail(to: string, subject: string, text: string): Promise<"SENT" | "FAILED" | "NOT_CONFIGURED"> {
  if (!emailConfigured()) return "NOT_CONFIGURED";
  try {
    const info = await getTransporter().sendMail({ from: config.smtp.from, to, subject, text });
    return (info.accepted?.length ?? 0) > 0 ? "SENT" : "FAILED";
  } catch (err) {
    console.error("[mail] send failed:", (err as Error).message);
    return "FAILED";
  }
}
