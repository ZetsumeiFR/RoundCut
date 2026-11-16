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

const resetPasswordEmails = {
  en: (url: string) => ({
    subject: "Reset your RoundCut password",
    text: `We received a request to reset the password of your RoundCut account.\n\nChoose a new password with this link (valid for 1 hour):\n${url}\n\nIf you did not ask for it, you can ignore this email: your password stays unchanged.`,
  }),
  fr: (url: string) => ({
    subject: "Réinitialisez votre mot de passe RoundCut",
    text: `Nous avons reçu une demande de réinitialisation du mot de passe de votre compte RoundCut.\n\nChoisissez un nouveau mot de passe avec ce lien (valable 1 heure) :\n${url}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.`,
  }),
} satisfies Record<Locale, (url: string) => Omit<EmailMessage, "to">>;

export function resetPasswordEmail(
  locale: Locale,
  to: string,
  url: string
): EmailMessage {
  return { to, ...resetPasswordEmails[locale](url) };
}
