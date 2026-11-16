import type { Locale } from "@roundcut/auth/locale";

const en = {
  account: {
    menu: {
      label: "My account",
      sessions: "Active sessions",
      signIn: "Sign in",
      signOut: "Sign out",
    },
    sessions: {
      createdAt: "Signed in {date}",
      current: "This device",
      description:
        "Devices currently signed in to your account. Revoke any session you don't recognize.",
      ipAddress: "IP {ip}",
      lastActive: "Last active {date}",
      noOtherDescription:
        "You're only signed in on this device. Sessions on other browsers or devices will show up here.",
      noOtherTitle: "No other active sessions",
      otherTitle: "Other sessions",
      revoke: "Revoke",
      revokeOthers: "Sign out of all other devices",
      revoking: "Revoking…",
      signInAgain: "Sign in again",
      signingOut: "Signing out…",
      signOut: "Sign out",
      staleDescription:
        "For your security, sign in again to view and manage your active sessions.",
      staleTitle: "Confirm it's you",
      title: "Active sessions",
      unknownBrowser: "Unknown browser",
      unknownDevice: "Unknown device",
      unknownIp: "Unknown IP",
    },
  },
  auth: {
    checkEmail: {
      back: "Back to sign in",
      description:
        "We sent a verification link to {email}. Open it to activate your account and continue to onboarding.",
      resend: "Resend email",
      resending: "Sending…",
      resent: "A new verification email is on its way.",
      title: "Check your inbox",
      unverifiedDescription:
        "Your email isn't verified yet. We sent a new verification link to {email}: open it to sign in.",
    },
    errors: {
      generic: "Please try again in a moment.",
      googleAccountNotLinked:
        "An account already uses this email. Sign in with your password and verify your email first.",
      googleCancelled: "Google sign-in was cancelled.",
      googleFailed:
        "Google sign-in failed. Try again or continue with your email.",
      invalidCredentials: "Invalid email or password.",
      passwordTooShort: "Password must be at least {min} characters.",
      title: "Something went wrong",
      userExists: "An account already exists with this email.",
    },
    fields: {
      email: "Email",
      emailPlaceholder: "you@example.com",
      hidePassword: "Hide password",
      name: "Name",
      namePlaceholder: "Jane Doe",
      newPassword: "New password",
      password: "Password",
      passwordPlaceholder: "At least {min} characters",
      showPassword: "Show password",
    },
    forgotPassword: {
      back: "Back to sign in",
      description:
        "Enter your account email and we'll send you a link to choose a new password.",
      sentDescription:
        "If an account exists for {email}, we sent it a link to reset your password. The link is valid for 1 hour.",
      sentTitle: "Check your inbox",
      submit: "Send reset link",
      submitting: "Sending…",
      title: "Forgot your password?",
    },
    google: {
      continue: "Continue with Google",
      redirecting: "Redirecting to Google…",
      separator: "Or continue with email",
    },
    resetPassword: {
      description:
        "Choose a new password. You will be signed out of your other devices.",
      invalidDescription:
        "This reset link is invalid, already used or expired. Request a new one to continue.",
      invalidTitle: "Link expired",
      requestNew: "Request a new link",
      signIn: "Sign in",
      submit: "Update password",
      submitting: "Updating…",
      successDescription:
        "Your password has been changed. Sign in with your new password.",
      successTitle: "Password updated",
      title: "Choose a new password",
    },
    signIn: {
      description: "Sign in to continue to your workspace.",
      forgotPassword: "Forgot password?",
      submit: "Sign in",
      submitting: "Signing in…",
      switchAction: "Create account",
      switchPrompt: "Don't have an account?",
      title: "Welcome back",
    },
    signUp: {
      description: "Track revision rounds and get paid for the extra ones.",
      submit: "Create account",
      submitting: "Creating account…",
      switchAction: "Sign in",
      switchPrompt: "Already have an account?",
      title: "Create your account",
    },
    validation: {
      emailInvalid: "Enter a valid email address.",
      nameMin: "Name must be at least 2 characters.",
      passwordMin: "Password must be at least {min} characters.",
      passwordRequired: "Enter your password.",
    },
  },
  onboarding: {
    continue: "Go to dashboard",
    description: "Your email is verified. Let's set up your workspace.",
    title: "Welcome to RoundCut",
  },
};

export type Messages = typeof en;

const fr: Messages = {
  account: {
    menu: {
      label: "Mon compte",
      sessions: "Sessions actives",
      signIn: "Se connecter",
      signOut: "Se déconnecter",
    },
    sessions: {
      createdAt: "Connecté le {date}",
      current: "Cet appareil",
      description:
        "Appareils actuellement connectés à votre compte. Révoquez toute session que vous ne reconnaissez pas.",
      ipAddress: "IP {ip}",
      lastActive: "Dernière activité le {date}",
      noOtherDescription:
        "Vous n'êtes connecté que sur cet appareil. Les sessions ouvertes sur d'autres navigateurs ou appareils apparaîtront ici.",
      noOtherTitle: "Aucune autre session active",
      otherTitle: "Autres sessions",
      revoke: "Révoquer",
      revokeOthers: "Déconnecter tous les autres appareils",
      revoking: "Révocation…",
      signInAgain: "Se reconnecter",
      signingOut: "Déconnexion…",
      signOut: "Se déconnecter",
      staleDescription:
        "Par sécurité, reconnectez-vous pour consulter et gérer vos sessions actives.",
      staleTitle: "Confirmez votre identité",
      title: "Sessions actives",
      unknownBrowser: "Navigateur inconnu",
      unknownDevice: "Appareil inconnu",
      unknownIp: "IP inconnue",
    },
  },
  auth: {
    checkEmail: {
      back: "Retour à la connexion",
      description:
        "Nous avons envoyé un lien de vérification à {email}. Ouvrez-le pour activer votre compte et passer à l'onboarding.",
      resend: "Renvoyer l'email",
      resending: "Envoi…",
      resent: "Un nouvel email de vérification est en route.",
      title: "Vérifiez votre boîte mail",
      unverifiedDescription:
        "Votre email n'est pas encore vérifié. Nous avons envoyé un nouveau lien de vérification à {email} : ouvrez-le pour vous connecter.",
    },
    errors: {
      generic: "Veuillez réessayer dans un instant.",
      googleAccountNotLinked:
        "Un compte utilise déjà cet email. Connectez-vous avec votre mot de passe et vérifiez d'abord votre email.",
      googleCancelled: "La connexion avec Google a été annulée.",
      googleFailed:
        "La connexion avec Google a échoué. Réessayez ou continuez avec votre email.",
      invalidCredentials: "Email ou mot de passe incorrect.",
      passwordTooShort:
        "Le mot de passe doit contenir au moins {min} caractères.",
      title: "Une erreur est survenue",
      userExists: "Un compte existe déjà avec cet email.",
    },
    fields: {
      email: "Email",
      emailPlaceholder: "vous@exemple.fr",
      hidePassword: "Masquer le mot de passe",
      name: "Nom",
      namePlaceholder: "Camille Martin",
      newPassword: "Nouveau mot de passe",
      password: "Mot de passe",
      passwordPlaceholder: "Au moins {min} caractères",
      showPassword: "Afficher le mot de passe",
    },
    forgotPassword: {
      back: "Retour à la connexion",
      description:
        "Saisissez l'email de votre compte : nous vous enverrons un lien pour choisir un nouveau mot de passe.",
      sentDescription:
        "Si un compte existe pour {email}, nous lui avons envoyé un lien de réinitialisation. Le lien est valable 1 heure.",
      sentTitle: "Vérifiez votre boîte mail",
      submit: "Envoyer le lien",
      submitting: "Envoi…",
      title: "Mot de passe oublié ?",
    },
    google: {
      continue: "Continuer avec Google",
      redirecting: "Redirection vers Google…",
      separator: "Ou continuer avec votre email",
    },
    resetPassword: {
      description:
        "Choisissez un nouveau mot de passe. Vos autres appareils seront déconnectés.",
      invalidDescription:
        "Ce lien de réinitialisation est invalide, déjà utilisé ou expiré. Demandez-en un nouveau pour continuer.",
      invalidTitle: "Lien expiré",
      requestNew: "Demander un nouveau lien",
      signIn: "Se connecter",
      submit: "Mettre à jour le mot de passe",
      submitting: "Mise à jour…",
      successDescription:
        "Votre mot de passe a été modifié. Connectez-vous avec votre nouveau mot de passe.",
      successTitle: "Mot de passe mis à jour",
      title: "Choisissez un nouveau mot de passe",
    },
    signIn: {
      description: "Connectez-vous pour accéder à votre espace.",
      forgotPassword: "Mot de passe oublié ?",
      submit: "Se connecter",
      submitting: "Connexion…",
      switchAction: "Créer un compte",
      switchPrompt: "Pas encore de compte ?",
      title: "Bon retour",
    },
    signUp: {
      description:
        "Suivez vos tours de révision et faites payer les tours supplémentaires.",
      submit: "Créer mon compte",
      submitting: "Création du compte…",
      switchAction: "Se connecter",
      switchPrompt: "Déjà un compte ?",
      title: "Créez votre compte",
    },
    validation: {
      emailInvalid: "Saisissez une adresse email valide.",
      nameMin: "Le nom doit contenir au moins 2 caractères.",
      passwordMin: "Le mot de passe doit contenir au moins {min} caractères.",
      passwordRequired: "Saisissez votre mot de passe.",
    },
  },
  onboarding: {
    continue: "Accéder au tableau de bord",
    description: "Votre email est vérifié. Configurons votre espace.",
    title: "Bienvenue sur RoundCut",
  },
};

const messages: Record<Locale, Messages> = { en, fr };

export const getMessages = (locale: Locale): Messages => messages[locale];

export const formatMessage = (
  template: string,
  values: Record<string, string | number>
) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) =>
    String(values[key] ?? match)
  );
