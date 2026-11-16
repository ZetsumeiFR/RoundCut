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

export interface InvitationDetails {
  inviterName: string;
  role: string;
  studioName: string;
  url: string;
}

const invitationRoles: Record<Locale, Record<string, string>> = {
  en: { editor: "editor", owner: "owner", viewer: "viewer" },
  fr: { editor: "éditeur", owner: "propriétaire", viewer: "lecteur" },
};

const invitationEmails = {
  en: ({ inviterName, role, studioName, url }: InvitationDetails) => ({
    subject: `${inviterName} invited you to the ${studioName} Studio on RoundCut`,
    text: `${inviterName} invited you to join the ${studioName} Studio on RoundCut as ${invitationRoles.en[role] ?? role}.\n\nOpen this link to accept the invitation (valid for 48 hours):\n${url}\n\nNo RoundCut account yet? Sign up with this email address: the invitation will wait for you under Settings > Team.\n\nIf you weren't expecting it, you can ignore this email.`,
  }),
  fr: ({ inviterName, role, studioName, url }: InvitationDetails) => ({
    subject: `${inviterName} vous invite dans le Studio ${studioName} sur RoundCut`,
    text: `${inviterName} vous invite à rejoindre le Studio ${studioName} sur RoundCut avec le rôle ${invitationRoles.fr[role] ?? role}.\n\nOuvrez ce lien pour accepter l'invitation (valable 48 heures) :\n${url}\n\nPas encore de compte RoundCut ? Inscrivez-vous avec cette adresse email : l'invitation vous attendra dans Paramètres > Équipe.\n\nSi vous n'attendiez pas cette invitation, ignorez cet email.`,
  }),
} satisfies Record<
  Locale,
  (details: InvitationDetails) => Omit<EmailMessage, "to">
>;

export function invitationEmail(
  locale: Locale,
  to: string,
  details: InvitationDetails
): EmailMessage {
  return { to, ...invitationEmails[locale](details) };
}

export interface BatchSubmittedDetails {
  count: number;
  deliverableTitle: string;
  projectName: string;
  reviewerName: string;
  roundNumber: number;
  url: string;
  versionNumber: number;
}

const batchSubmittedEmails = {
  en: (details: BatchSubmittedDetails) => ({
    subject: `${details.projectName}: round ${details.roundNumber} feedback submitted`,
    text: `${details.reviewerName} submitted ${details.count === 1 ? "1 comment" : `${details.count} comments`} on ${details.deliverableTitle} V${details.versionNumber} (${details.projectName}). Round ${details.roundNumber} is now closed to new feedback.\n\nReview the comments:\n${details.url}`,
  }),
  fr: (details: BatchSubmittedDetails) => ({
    subject: `${details.projectName} : retours du tour ${details.roundNumber} soumis`,
    text: `${details.reviewerName} a soumis ${details.count === 1 ? "1 retour" : `${details.count} retours`} sur ${details.deliverableTitle} V${details.versionNumber} (${details.projectName}). Le tour ${details.roundNumber} est clos aux nouveaux retours.\n\nConsultez les retours :\n${details.url}`,
  }),
} satisfies Record<
  Locale,
  (details: BatchSubmittedDetails) => Omit<EmailMessage, "to">
>;

// Tells the editor a client submitted the feedback batch of a round (REV-05).
export function batchSubmittedEmail(
  locale: Locale,
  to: string,
  details: BatchSubmittedDetails
): EmailMessage {
  return { to, ...batchSubmittedEmails[locale](details) };
}

export interface UnsubmittedFeedbackDetails {
  count: number;
  projectName: string;
  reviewerName: string;
  studioName: string;
}

const unsubmittedFeedbackEmails = {
  en: (details: UnsubmittedFeedbackDetails) => ({
    subject: `${details.projectName}: you have unsubmitted feedback`,
    text: `Hello ${details.reviewerName},\n\nYou wrote ${details.count === 1 ? "1 comment" : `${details.count} comments`} on ${details.projectName} that ${details.studioName} hasn't received yet: your feedback is only sent once you submit it.\n\nOpen the review link ${details.studioName} shared with you and click "Submit my feedback".`,
  }),
  fr: (details: UnsubmittedFeedbackDetails) => ({
    subject: `${details.projectName} : vous avez des retours non soumis`,
    text: `Bonjour ${details.reviewerName},\n\nVous avez écrit ${details.count === 1 ? "1 retour" : `${details.count} retours`} sur ${details.projectName} que ${details.studioName} n'a pas encore reçus : vos retours ne sont transmis qu'une fois soumis.\n\nOuvrez le lien de revue partagé par ${details.studioName} et cliquez sur « Soumettre mes retours ».`,
  }),
} satisfies Record<
  Locale,
  (details: UnsubmittedFeedbackDetails) => Omit<EmailMessage, "to">
>;

// Reminds a reviewer that their comments wait to be submitted (ROUND-04).
export function unsubmittedFeedbackEmail(
  locale: Locale,
  to: string,
  details: UnsubmittedFeedbackDetails
): EmailMessage {
  return { to, ...unsubmittedFeedbackEmails[locale](details) };
}

export interface AwaitingFeedbackDetails {
  deciderName: string;
  deliverableTitle: string;
  projectName: string;
  studioName: string;
  versionNumber: number;
}

const awaitingFeedbackEmails = {
  en: (details: AwaitingFeedbackDetails) => ({
    subject: `${details.projectName}: version awaiting your feedback`,
    text: `Hello ${details.deciderName},\n\nVersion V${details.versionNumber} of ${details.deliverableTitle} (${details.projectName}) is waiting for your feedback: ${details.studioName} can't move on to the next round until it gets it.\n\nOpen the review link ${details.studioName} shared with you, add your comments and click "Submit my feedback".`,
  }),
  fr: (details: AwaitingFeedbackDetails) => ({
    subject: `${details.projectName} : version en attente de vos retours`,
    text: `Bonjour ${details.deciderName},\n\nLa version V${details.versionNumber} de ${details.deliverableTitle} (${details.projectName}) est en attente de vos retours : ${details.studioName} ne peut pas passer au tour suivant sans eux.\n\nOuvrez le lien de revue partagé par ${details.studioName}, ajoutez vos commentaires et cliquez sur « Soumettre mes retours ».`,
  }),
} satisfies Record<
  Locale,
  (details: AwaitingFeedbackDetails) => Omit<EmailMessage, "to">
>;

// Reminds the client's decider that a version waits for feedback (ROUND-05).
export function awaitingFeedbackEmail(
  locale: Locale,
  to: string,
  details: AwaitingFeedbackDetails
): EmailMessage {
  return { to, ...awaitingFeedbackEmails[locale](details) };
}

export interface ReviewerCodeDetails {
  code: string;
  projectName: string;
  reviewerName: string;
  studioName: string;
  validityMinutes: number;
}

const extraRoundCodeEmails = {
  en: (details: ReviewerCodeDetails) => ({
    subject: `${details.code} is your code to accept the extra round`,
    text: `Hello ${details.reviewerName},\n\nYour code to accept the extra round offered by ${details.studioName} on ${details.projectName}:\n\n${details.code}\n\nIt is valid for ${details.validityMinutes} minutes. If you didn't ask for it, ignore this email: nothing is accepted without the code.`,
  }),
  fr: (details: ReviewerCodeDetails) => ({
    subject: `${details.code} est votre code pour accepter le tour supplémentaire`,
    text: `Bonjour ${details.reviewerName},\n\nVotre code pour accepter le tour supplémentaire proposé par ${details.studioName} sur ${details.projectName} :\n\n${details.code}\n\nIl est valable ${details.validityMinutes} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : rien n'est accepté sans le code.`,
  }),
} satisfies Record<
  Locale,
  (details: ReviewerCodeDetails) => Omit<EmailMessage, "to">
>;

// The code the decider types to accept an extra round (EXTRA-02).
export function extraRoundCodeEmail(
  locale: Locale,
  to: string,
  details: ReviewerCodeDetails
): EmailMessage {
  return { to, ...extraRoundCodeEmails[locale](details) };
}

export interface ExtraRoundForwardDetails {
  deciderName: string;
  deliverableTitle: string;
  projectName: string;
  reviewerName: string;
  roundNumber: number;
  studioName: string;
  url: string;
}

const extraRoundForwardEmails = {
  en: (details: ExtraRoundForwardDetails) => ({
    subject: `${details.projectName}: extra round ${details.roundNumber} waits for your agreement`,
    text: `Hello ${details.deciderName},\n\n${details.reviewerName} started a new batch of feedback on ${details.deliverableTitle} (${details.projectName}), beyond the rounds included with ${details.studioName}. Only you can accept extra round ${details.roundNumber}: the feedback is kept until you answer.\n\nReview the offer and accept it:\n${details.url}`,
  }),
  fr: (details: ExtraRoundForwardDetails) => ({
    subject: `${details.projectName} : le tour supplémentaire ${details.roundNumber} attend votre accord`,
    text: `Bonjour ${details.deciderName},\n\n${details.reviewerName} a commencé un nouveau lot de retours sur ${details.deliverableTitle} (${details.projectName}), au-delà des tours inclus avec ${details.studioName}. Le tour supplémentaire ${details.roundNumber} ne peut être accepté que par vous : les retours sont conservés en attendant votre réponse.\n\nConsultez la proposition et acceptez-la :\n${details.url}`,
  }),
} satisfies Record<
  Locale,
  (details: ExtraRoundForwardDetails) => Omit<EmailMessage, "to">
>;

// A reviewer who can't accept forwards the extra round offer to the decider
// (EXTRA-02).
export function extraRoundForwardEmail(
  locale: Locale,
  to: string,
  details: ExtraRoundForwardDetails
): EmailMessage {
  return { to, ...extraRoundForwardEmails[locale](details) };
}

export function resetPasswordEmail(
  locale: Locale,
  to: string,
  url: string
): EmailMessage {
  return { to, ...resetPasswordEmails[locale](url) };
}
