import type { Locale } from "./locale";

export interface EmailConfig {
  EMAIL_FROM?: string;
  NODE_ENV: "development" | "production" | "test";
  RESEND_API_KEY?: string;
}

interface EmailMessage {
  subject: string;
  text: string;
  to: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendEmail(config: EmailConfig, message: EmailMessage) {
  if (!(config.RESEND_API_KEY && config.EMAIL_FROM)) {
    if (config.NODE_ENV === "production") {
      throw new Error(
        "RESEND_API_KEY and EMAIL_FROM are required to send emails in production"
      );
    }
    // Without a Resend key, development prints the email so its links stay usable.
    console.info(
      `[email] to=${message.to} subject="${message.subject}"\n${message.text}`
    );
    return;
  }

  const response = await fetch(RESEND_ENDPOINT, {
    body: JSON.stringify({ from: config.EMAIL_FROM, ...message }),
    headers: {
      Authorization: `Bearer ${config.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `Resend rejected the email (${response.status}): ${await response.text()}`
    );
  }
}

const verificationEmails = {
  en: (url: string) => ({
    subject: "Confirm your RoundCut email address",
    text: `Welcome to RoundCut!\n\nConfirm your email address to finish creating your account:\n${url}\n\nIf you did not sign up, you can ignore this email.`,
  }),
  fr: (url: string) => ({
    subject: "Confirmez votre adresse email RoundCut",
    text: `Bienvenue sur RoundCut !\n\nConfirmez votre adresse email pour finaliser la création de votre compte :\n${url}\n\nSi vous n'êtes pas à l'origine de cette inscription, ignorez cet email.`,
  }),
} satisfies Record<Locale, (url: string) => Omit<EmailMessage, "to">>;

export function verificationEmail(
  locale: Locale,
  to: string,
  url: string
): EmailMessage {
  return { to, ...verificationEmails[locale](url) };
}
