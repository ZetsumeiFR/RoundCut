import type { Locale } from "./locale";

export interface EmailConfig {
  EMAIL_FROM?: string;
  NODE_ENV: "development" | "production" | "test";
  RESEND_API_KEY?: string;
}

export interface EmailAttachment {
  content: Uint8Array;
  filename: string;
}

interface EmailMessage {
  attachments?: EmailAttachment[];
  // Where the recipient's reply goes, when not to the sender.
  replyTo?: string;
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
    const attached = (message.attachments ?? [])
      .map(
        (attachment) =>
          `\n[attachment] ${attachment.filename} (${attachment.content.byteLength} bytes)`
      )
      .join("");
    console.info(
      `[email] to=${message.to}${message.replyTo ? ` reply-to=${message.replyTo}` : ""} subject="${message.subject}"\n${message.text}${attached}`
    );
    return;
  }

  const response = await fetch(RESEND_ENDPOINT, {
    body: JSON.stringify({
      attachments: message.attachments?.map((attachment) => ({
        content: Buffer.from(attachment.content).toString("base64"),
        filename: attachment.filename,
      })),
      from: config.EMAIL_FROM,
      reply_to: message.replyTo,
      subject: message.subject,
      text: message.text,
      to: message.to,
    }),
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

export interface VersionApprovedDetails {
  approverName: string;
  deliverableTitle: string;
  projectName: string;
  snapshotHash: string;
  url: string;
  versionNumber: number;
}

const versionApprovedEmails = {
  en: (details: VersionApprovedDetails) => ({
    subject: `${details.projectName}: ${details.deliverableTitle} V${details.versionNumber} approved`,
    text: `${details.approverName} approved ${details.deliverableTitle} V${details.versionNumber} (${details.projectName}) as the final version, with an email code.\n\nAgreement record fingerprint (SHA-256): ${details.snapshotHash}\n\nOpen the version:\n${details.url}`,
  }),
  fr: (details: VersionApprovedDetails) => ({
    subject: `${details.projectName} : ${details.deliverableTitle} V${details.versionNumber} validée`,
    text: `${details.approverName} a validé ${details.deliverableTitle} V${details.versionNumber} (${details.projectName}) comme version finale, avec un code reçu par email.\n\nEmpreinte du journal d'accord (SHA-256) : ${details.snapshotHash}\n\nOuvrir la version :\n${details.url}`,
  }),
} satisfies Record<
  Locale,
  (details: VersionApprovedDetails) => Omit<EmailMessage, "to">
>;

// Tells the editor the decider approved a version as final (APPR-01).
export function versionApprovedEmail(
  locale: Locale,
  to: string,
  details: VersionApprovedDetails
): EmailMessage {
  return { to, ...versionApprovedEmails[locale](details) };
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

const approvalCodeEmails = {
  en: (details: ReviewerCodeDetails) => ({
    subject: `${details.code} is your code to approve the version`,
    text: `Hello ${details.reviewerName},\n\nYour code to approve the current version of ${details.projectName}, delivered by ${details.studioName}:\n\n${details.code}\n\nIt is valid for ${details.validityMinutes} minutes. If you didn't ask for it, ignore this email: nothing is approved without the code.`,
  }),
  fr: (details: ReviewerCodeDetails) => ({
    subject: `${details.code} est votre code pour valider la version`,
    text: `Bonjour ${details.reviewerName},\n\nVotre code pour valider la version actuelle de ${details.projectName}, livrée par ${details.studioName} :\n\n${details.code}\n\nIl est valable ${details.validityMinutes} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : rien n'est validé sans le code.`,
  }),
} satisfies Record<
  Locale,
  (details: ReviewerCodeDetails) => Omit<EmailMessage, "to">
>;

// The code the decider types to approve a version (EXTRA-06).
export function approvalCodeEmail(
  locale: Locale,
  to: string,
  details: ReviewerCodeDetails
): EmailMessage {
  return { to, ...approvalCodeEmails[locale](details) };
}

export interface ExtraRoundContactDetails {
  deciderEmail: string;
  deciderName: string;
  deliverableTitle: string;
  message: string;
  projectName: string;
  roundNumber: number;
  url: string;
}

const extraRoundContactEmails = {
  en: (details: ExtraRoundContactDetails) => ({
    subject: `${details.projectName}: ${details.deciderName} declined extra round ${details.roundNumber} and wrote to you`,
    text: `${details.deciderName} (${details.deciderEmail}) declined extra round ${details.roundNumber} on ${details.deliverableTitle} (${details.projectName}) and sent you this message:\n\n${details.message}\n\nReply to this email to answer them. Project history:\n${details.url}`,
  }),
  fr: (details: ExtraRoundContactDetails) => ({
    subject: `${details.projectName} : ${details.deciderName} a refusé le tour supplémentaire ${details.roundNumber} et vous écrit`,
    text: `${details.deciderName} (${details.deciderEmail}) a refusé le tour supplémentaire ${details.roundNumber} sur ${details.deliverableTitle} (${details.projectName}) et vous a envoyé ce message :\n\n${details.message}\n\nRépondez à cet email pour lui répondre. Historique du projet :\n${details.url}`,
  }),
} satisfies Record<
  Locale,
  (details: ExtraRoundContactDetails) => Omit<EmailMessage, "to">
>;

// The decider's message to the editor after declining an extra round
// (EXTRA-06); replies go straight to the decider.
export function extraRoundContactEmail(
  locale: Locale,
  to: string,
  details: ExtraRoundContactDetails
): EmailMessage {
  return {
    replyTo: details.deciderEmail,
    to,
    ...extraRoundContactEmails[locale](details),
  };
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

export interface AgreementReceiptDetails {
  deliverableTitle: string;
  // "paid" re-sends the receipt once the online payment is confirmed
  // (EXTRA-04); "agreed" sends it when the decider accepts.
  event: "agreed" | "paid";
  projectName: string;
  roundNumber: number;
  signerName: string;
  studioName: string;
}

const agreementReceiptEmails = {
  en: (details: AgreementReceiptDetails) =>
    details.event === "paid"
      ? {
          subject: `${details.projectName}: extra round ${details.roundNumber} paid, your receipt`,
          text: `Hello,\n\nThe payment of extra round ${details.roundNumber} on ${details.deliverableTitle} (${details.projectName}), accepted by ${details.signerName}, is confirmed.\n\nThe updated agreement receipt is attached as a PDF.`,
        }
      : {
          subject: `${details.projectName}: agreement receipt for extra round ${details.roundNumber}`,
          text: `Hello,\n\n${details.signerName} accepted extra round ${details.roundNumber} on ${details.deliverableTitle} (${details.projectName}) with ${details.studioName}.\n\nThe agreement receipt is attached as a PDF: it shows the amounts, who agreed, when, and the fingerprint that seals the agreement record.`,
        },
  fr: (details: AgreementReceiptDetails) =>
    details.event === "paid"
      ? {
          subject: `${details.projectName} : tour supplémentaire ${details.roundNumber} payé, votre reçu`,
          text: `Bonjour,\n\nLe paiement du tour supplémentaire ${details.roundNumber} sur ${details.deliverableTitle} (${details.projectName}), accepté par ${details.signerName}, est confirmé.\n\nLe reçu d'accord à jour est joint en PDF.`,
        }
      : {
          subject: `${details.projectName} : reçu d'accord du tour supplémentaire ${details.roundNumber}`,
          text: `Bonjour,\n\n${details.signerName} a accepté le tour supplémentaire ${details.roundNumber} sur ${details.deliverableTitle} (${details.projectName}) avec ${details.studioName}.\n\nLe reçu d'accord est joint en PDF : il reprend les montants, qui a donné son accord, quand, et l'empreinte qui scelle le journal d'accord.`,
        },
} satisfies Record<
  Locale,
  (details: AgreementReceiptDetails) => Omit<EmailMessage, "to">
>;

// The extra round agreement receipt (EXTRA-07), sent to the editor and the
// decider with the PDF attached.
export function agreementReceiptEmail(
  locale: Locale,
  to: string,
  details: AgreementReceiptDetails,
  pdf: EmailAttachment
): EmailMessage {
  return { attachments: [pdf], to, ...agreementReceiptEmails[locale](details) };
}

export interface ReviewLinkDetails {
  // Already formatted in the recipient's language; null when it never expires.
  expiresOn: string | null;
  projectName: string;
  studioName: string;
  url: string;
}

const reviewLinkEmails = {
  en: (details: ReviewLinkDetails) => ({
    subject: `${details.studioName} shared ${details.projectName} for your review`,
    text: `Hello,\n\n${details.studioName} invites you to review ${details.projectName} on RoundCut: watch the latest versions and leave timestamped comments, without creating an account.\n\nOpen the private review link${details.expiresOn ? ` (valid until ${details.expiresOn})` : ""}:\n${details.url}\n\nKeep this email: the link is personal to your team and isn't shown elsewhere.`,
  }),
  fr: (details: ReviewLinkDetails) => ({
    subject: `${details.studioName} partage ${details.projectName} pour votre revue`,
    text: `Bonjour,\n\n${details.studioName} vous invite à revoir ${details.projectName} sur RoundCut : regardez les dernières versions et laissez des commentaires horodatés, sans créer de compte.\n\nOuvrez le lien de revue privé${details.expiresOn ? ` (valable jusqu'au ${details.expiresOn})` : ""} :\n${details.url}\n\nConservez cet email : le lien est réservé à votre équipe et n'est affiché nulle part ailleurs.`,
  }),
} satisfies Record<
  Locale,
  (details: ReviewLinkDetails) => Omit<EmailMessage, "to">
>;

// The project's review link (REV-01), sent by the editor to the client's
// decider and reviewers right after generating it (NOTIF-01).
export function reviewLinkEmail(
  locale: Locale,
  to: string,
  details: ReviewLinkDetails
): EmailMessage {
  return { to, ...reviewLinkEmails[locale](details) };
}

export interface ExtraRoundProposedDetails {
  deliverableTitle: string;
  // Excluding VAT, already formatted in the recipient's language.
  price: string;
  projectName: string;
  reviewerName: string;
  roundNumber: number;
  url: string;
}

const extraRoundProposedEmails = {
  en: (details: ExtraRoundProposedDetails) => ({
    subject: `${details.projectName}: extra round ${details.roundNumber} offered to your client`,
    text: `${details.reviewerName} started a new batch of feedback on ${details.deliverableTitle} (${details.projectName}) after the included rounds. RoundCut offered them extra round ${details.roundNumber} at ${details.price} excl. VAT: the feedback is kept until the decider accepts it.\n\nProject:\n${details.url}`,
  }),
  fr: (details: ExtraRoundProposedDetails) => ({
    subject: `${details.projectName} : tour supplémentaire ${details.roundNumber} proposé à votre client`,
    text: `${details.reviewerName} a commencé un nouveau lot de retours sur ${details.deliverableTitle} (${details.projectName}) après les tours inclus. RoundCut lui a proposé le tour supplémentaire ${details.roundNumber} à ${details.price} HT : les retours sont conservés jusqu'à l'accord du décideur.\n\nProjet :\n${details.url}`,
  }),
} satisfies Record<
  Locale,
  (details: ExtraRoundProposedDetails) => Omit<EmailMessage, "to">
>;

// Tells the editor an extra round was offered to the client (EXTRA-01,
// NOTIF-01).
export function extraRoundProposedEmail(
  locale: Locale,
  to: string,
  details: ExtraRoundProposedDetails
): EmailMessage {
  return { to, ...extraRoundProposedEmails[locale](details) };
}

export interface DigestComment {
  // Who wrote it, or for a status change the comment's author.
  authorName: string;
  body: string;
  // What the editor did, for the reviewers' digest; "comment" for new
  // feedback, "reply" for an answer in a thread.
  kind: "comment" | "done" | "open" | "rejected" | "reply";
  // The refusal reason of a "rejected" comment.
  reason?: string | null;
  // "Teaser V2 · 00:41", already formatted.
  where: string;
}

const digestLabels = {
  en: {
    comment: "new comment",
    done: "marked done",
    open: "reopened",
    reason: "reason: ",
    rejected: "declined",
    reply: "reply",
  },
  fr: {
    comment: "nouveau commentaire",
    done: "marqué traité",
    open: "rouvert",
    reason: "motif : ",
    rejected: "refusé",
    reply: "réponse",
  },
} satisfies Record<Locale, Record<string, string>>;

const digestLines = (locale: Locale, items: DigestComment[]) =>
  items
    .map((item) => {
      const labels = digestLabels[locale];
      const reason = item.reason ? ` (${labels.reason}${item.reason})` : "";
      return `- ${item.where} · ${labels[item.kind]} · ${item.authorName}${reason}\n  ${item.body}`;
    })
    .join("\n");

export interface EditorDigestDetails {
  items: DigestComment[];
  projectName: string;
  url: string;
}

const editorDigestEmails = {
  en: (details: EditorDigestDetails) => ({
    subject: `${details.projectName}: ${details.items.length === 1 ? "1 new comment" : `${details.items.length} new comments`}`,
    text: `Your client wrote on ${details.projectName} in the last few minutes:\n\n${digestLines("en", details.items)}\n\nComments written during an open round reach you as drafts: the client submits them as a batch.\n\nOpen the project:\n${details.url}`,
  }),
  fr: (details: EditorDigestDetails) => ({
    subject: `${details.projectName} : ${details.items.length === 1 ? "1 nouveau commentaire" : `${details.items.length} nouveaux commentaires`}`,
    text: `Votre client a écrit sur ${details.projectName} ces dernières minutes :\n\n${digestLines("fr", details.items)}\n\nLes commentaires d'un tour ouvert vous parviennent en brouillon : le client les soumet par lot.\n\nOuvrir le projet :\n${details.url}`,
  }),
} satisfies Record<
  Locale,
  (details: EditorDigestDetails) => Omit<EmailMessage, "to">
>;

// The editor's grouped email of the client's new comments and replies,
// sent at most every 15 minutes per project (NOTIF-01).
export function editorDigestEmail(
  locale: Locale,
  to: string,
  details: EditorDigestDetails
): EmailMessage {
  return { to, ...editorDigestEmails[locale](details) };
}

export interface ReviewerDigestDetails {
  items: DigestComment[];
  projectName: string;
  reviewerName: string;
  studioName: string;
}

const reviewerDigestEmails = {
  en: (details: ReviewerDigestDetails) => ({
    subject: `${details.projectName}: ${details.studioName} answered your feedback`,
    text: `Hello ${details.reviewerName},\n\n${details.studioName} answered on ${details.projectName}:\n\n${digestLines("en", details.items)}\n\nOpen the review link ${details.studioName} shared with you to read the threads and reply.`,
  }),
  fr: (details: ReviewerDigestDetails) => ({
    subject: `${details.projectName} : ${details.studioName} a répondu à vos retours`,
    text: `Bonjour ${details.reviewerName},\n\n${details.studioName} a répondu sur ${details.projectName} :\n\n${digestLines("fr", details.items)}\n\nOuvrez le lien de revue partagé par ${details.studioName} pour lire les fils et répondre.`,
  }),
} satisfies Record<
  Locale,
  (details: ReviewerDigestDetails) => Omit<EmailMessage, "to">
>;

// A reviewer's grouped email of the editor's replies and status changes,
// sent at most every 15 minutes per project (NOTIF-01). Without the review
// link: only its hash is stored.
export function reviewerDigestEmail(
  locale: Locale,
  to: string,
  details: ReviewerDigestDetails
): EmailMessage {
  return { to, ...reviewerDigestEmails[locale](details) };
}

export function resetPasswordEmail(
  locale: Locale,
  to: string,
  url: string
): EmailMessage {
  return { to, ...resetPasswordEmails[locale](url) };
}
