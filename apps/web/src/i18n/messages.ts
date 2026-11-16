import type { Locale } from "@roundcut/auth/locale";

const en = {
  account: {
    menu: {
      label: "My account",
      security: "Security",
      sessions: "Active sessions",
      signIn: "Sign in",
      signOut: "Sign out",
      terms: "Plan terms",
      workspace: "Workspace",
    },
    nav: {
      description:
        "Manage your workspace, plan terms, security and signed-in devices.",
      label: "Settings sections",
      title: "Settings",
    },
    security: {
      backupCodesDescription:
        "Each code signs you in once if you lose access to your authenticator app. Store them somewhere safe: they won't be shown again.",
      backupCodesTitle: "Save your backup codes",
      cancel: "Cancel",
      code: "Verification code",
      codeInvalid: "Enter the 6-digit code.",
      confirm: "Continue",
      confirming: "Checking…",
      confirmPassword: "Enter your password to continue.",
      description:
        "Protect your account with a code from an authenticator app, on top of your password.",
      disable: "Disable",
      done: "Done",
      enable: "Enable",
      manualKey: "Can't scan it? Enter this key manually:",
      noPasswordDescription:
        "Two-factor authentication protects password sign-in. Your account signs in with Google, which runs its own verification.",
      noPasswordTitle: "Not available for this account",
      off: "Off",
      offDescription:
        "Turn it on to be asked for a code from your authenticator app when you sign in.",
      on: "On",
      onDescription:
        "You are asked for a code from your authenticator app when you sign in on an untrusted device.",
      qrLabel: "QR code to add RoundCut to your authenticator app",
      regenerateCodes: "New backup codes",
      scanDescription:
        "Scan this QR code with your authenticator app (Google Authenticator, 1Password, Authy…), then enter the 6-digit code it shows.",
      scanTitle: "Scan the QR code",
      title: "Two-factor authentication",
      verify: "Turn on",
      verifying: "Turning on…",
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
    terms: {
      cancel: "Cancel",
      delay: "Extra delay",
      delayDescription: "Days added to the due date for each extra round.",
      delayInvalid: "Enter a whole number of days between 0 and {max}.",
      delaySuffix: "days",
      description:
        "Defaults applied to your new clients and projects. You can still adjust them per project.",
      includedRounds: "Included rounds",
      includedRoundsDescription: "Revision rounds covered by the flat fee.",
      loadErrorDescription: "Check your connection and try again.",
      loadErrorTitle: "Couldn't load your plan terms",
      price: "Extra round price",
      priceDescription:
        "Excluding VAT. Enter 0 to offer extra rounds for free.",
      priceInvalid:
        "Enter an amount between 0 and {max} with at most two decimals.",
      priceSuffix: "{currency} excl. VAT",
      requirePayment: "Payment before opening",
      requirePaymentDescription:
        "Your client pays for an extra round before it opens.",
      retry: "Try again",
      save: "Save changes",
      saved: "Plan terms saved.",
      saveError: "Couldn't save your changes. Try again.",
      saving: "Saving…",
      scope: "Round scope",
      scopeDeliverable: "Per deliverable",
      scopeDescription:
        "Count included rounds for each deliverable or across the whole project.",
      scopeProject: "Per project",
      title: "Plan terms",
    },
    workspace: {
      cancel: "Cancel",
      currency: "Currency",
      currencyDescription: "Used for extra round prices and billable lines.",
      description: "Defaults applied to your clients, projects and billing.",
      language: "Language",
      languageDescription:
        "Default language for what you send to your clients.",
      loadErrorDescription: "Check your connection and try again.",
      loadErrorTitle: "Couldn't load your workspace",
      name: "Workspace name",
      nameDescription: "Shown to your clients on review links and emails.",
      nameRequired: "Enter a workspace name.",
      nameTooLong: "The name must be at most {max} characters.",
      retry: "Try again",
      save: "Save changes",
      saved: "Workspace settings saved.",
      saveError: "Couldn't save your changes. Try again.",
      saving: "Saving…",
      timezone: "Time zone",
      timezoneDescription: "Used for due dates and reminders.",
      title: "Workspace",
      vatRate: "Default VAT rate",
      vatRateDescription: "Applied to new billable lines.",
      vatRateInvalid:
        "Enter a rate between 0 and 100 with at most two decimals.",
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
      accountLocked:
        "Too many failed attempts. Your account is temporarily locked: try again later.",
      generic: "Please try again in a moment.",
      googleAccountNotLinked:
        "An account already uses this email. Sign in with your password and verify your email first.",
      googleCancelled: "Google sign-in was cancelled.",
      googleFailed:
        "Google sign-in failed. Try again or continue with your email.",
      invalidCode: "Invalid code. Check it and try again.",
      invalidCredentials: "Invalid email or password.",
      invalidPassword: "Incorrect password.",
      passwordTooShort: "Password must be at least {min} characters.",
      title: "Something went wrong",
      tooManyRequests: "Too many attempts. Wait a minute before trying again.",
      twoFactorExpired: "Verification expired. Sign in again.",
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
    twoFactor: {
      back: "Back to sign in",
      backupCode: "Backup code",
      backupCodeInvalid: "Enter a backup code such as abcde-12345.",
      backupDescription:
        "Enter one of your backup codes. Each code works only once.",
      code: "Verification code",
      codeInvalid: "Enter the 6-digit code.",
      submit: "Verify",
      submitting: "Verifying…",
      title: "Two-step verification",
      totpDescription: "Enter the 6-digit code from your authenticator app.",
      trustDevice: "Trust this device for 30 days",
      useAuthenticator: "Use your authenticator app",
      useBackupCode: "Use a backup code",
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
      security: "Sécurité",
      sessions: "Sessions actives",
      signIn: "Se connecter",
      signOut: "Se déconnecter",
      terms: "Conditions de forfait",
      workspace: "Espace de travail",
    },
    nav: {
      description:
        "Gérez votre espace de travail, vos conditions de forfait, votre sécurité et vos appareils connectés.",
      label: "Sections des réglages",
      title: "Réglages",
    },
    security: {
      backupCodesDescription:
        "Chaque code vous connecte une fois si vous perdez l'accès à votre application d'authentification. Conservez-les en lieu sûr : ils ne seront plus affichés.",
      backupCodesTitle: "Enregistrez vos codes de secours",
      cancel: "Annuler",
      code: "Code de vérification",
      codeInvalid: "Saisissez le code à 6 chiffres.",
      confirm: "Continuer",
      confirming: "Vérification…",
      confirmPassword: "Saisissez votre mot de passe pour continuer.",
      description:
        "Protégez votre compte avec un code issu d'une application d'authentification, en plus de votre mot de passe.",
      disable: "Désactiver",
      done: "Terminé",
      enable: "Activer",
      manualKey: "Impossible de scanner ? Saisissez cette clé manuellement :",
      noPasswordDescription:
        "La double authentification protège la connexion par mot de passe. Votre compte se connecte avec Google, qui applique sa propre vérification.",
      noPasswordTitle: "Indisponible pour ce compte",
      off: "Désactivée",
      offDescription:
        "Activez-la pour qu'un code de votre application d'authentification vous soit demandé à la connexion.",
      on: "Activée",
      onDescription:
        "Un code de votre application d'authentification vous est demandé lors d'une connexion depuis un appareil non approuvé.",
      qrLabel:
        "QR code pour ajouter RoundCut à votre application d'authentification",
      regenerateCodes: "Nouveaux codes de secours",
      scanDescription:
        "Scannez ce QR code avec votre application d'authentification (Google Authenticator, 1Password, Authy…), puis saisissez le code à 6 chiffres affiché.",
      scanTitle: "Scannez le QR code",
      title: "Double authentification",
      verify: "Activer",
      verifying: "Activation…",
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
    terms: {
      cancel: "Annuler",
      delay: "Délai additionnel",
      delayDescription:
        "Jours ajoutés à l'échéance pour chaque tour supplémentaire.",
      delayInvalid: "Saisissez un nombre entier de jours entre 0 et {max}.",
      delaySuffix: "jours",
      description:
        "Valeurs appliquées par défaut à vos nouveaux clients et projets. Vous pouvez les ajuster par projet.",
      includedRounds: "Tours inclus",
      includedRoundsDescription:
        "Nombre de tours de révision couverts par le forfait.",
      loadErrorDescription: "Vérifiez votre connexion et réessayez.",
      loadErrorTitle: "Impossible de charger vos conditions de forfait",
      price: "Prix du tour supplémentaire",
      priceDescription:
        "Hors taxes. Saisissez 0 pour offrir les tours supplémentaires.",
      priceInvalid:
        "Saisissez un montant entre 0 et {max}, avec au plus deux décimales.",
      priceSuffix: "{currency} HT",
      requirePayment: "Paiement avant ouverture",
      requirePaymentDescription:
        "Le client règle le tour supplémentaire avant son ouverture.",
      retry: "Réessayer",
      save: "Enregistrer",
      saved: "Conditions de forfait enregistrées.",
      saveError: "Impossible d'enregistrer vos modifications. Réessayez.",
      saving: "Enregistrement…",
      scope: "Portée des tours",
      scopeDeliverable: "Par livrable",
      scopeDescription:
        "Les tours inclus sont comptés pour chaque livrable ou sur l'ensemble du projet.",
      scopeProject: "Par projet",
      title: "Conditions de forfait",
    },
    workspace: {
      cancel: "Annuler",
      currency: "Devise",
      currencyDescription:
        "Utilisée pour le prix des tours supplémentaires et les lignes facturables.",
      description:
        "Valeurs par défaut appliquées à vos clients, projets et à la facturation.",
      language: "Langue",
      languageDescription:
        "Langue par défaut de ce que vous envoyez à vos clients.",
      loadErrorDescription: "Vérifiez votre connexion et réessayez.",
      loadErrorTitle: "Impossible de charger votre espace",
      name: "Nom de l'espace",
      nameDescription:
        "Affiché à vos clients sur les liens de revue et dans les emails.",
      nameRequired: "Saisissez un nom d'espace.",
      nameTooLong: "Le nom doit contenir au plus {max} caractères.",
      retry: "Réessayer",
      save: "Enregistrer",
      saved: "Réglages de l'espace enregistrés.",
      saveError: "Impossible d'enregistrer vos modifications. Réessayez.",
      saving: "Enregistrement…",
      timezone: "Fuseau horaire",
      timezoneDescription: "Utilisé pour les échéances et les relances.",
      title: "Espace de travail",
      vatRate: "Taux de TVA par défaut",
      vatRateDescription: "Appliqué aux nouvelles lignes facturables.",
      vatRateInvalid:
        "Saisissez un taux entre 0 et 100, avec au plus deux décimales.",
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
      accountLocked:
        "Trop de tentatives échouées. Votre compte est temporairement bloqué : réessayez plus tard.",
      generic: "Veuillez réessayer dans un instant.",
      googleAccountNotLinked:
        "Un compte utilise déjà cet email. Connectez-vous avec votre mot de passe et vérifiez d'abord votre email.",
      googleCancelled: "La connexion avec Google a été annulée.",
      googleFailed:
        "La connexion avec Google a échoué. Réessayez ou continuez avec votre email.",
      invalidCode: "Code invalide. Vérifiez-le et réessayez.",
      invalidCredentials: "Email ou mot de passe incorrect.",
      invalidPassword: "Mot de passe incorrect.",
      passwordTooShort:
        "Le mot de passe doit contenir au moins {min} caractères.",
      title: "Une erreur est survenue",
      tooManyRequests:
        "Trop de tentatives. Patientez une minute avant de réessayer.",
      twoFactorExpired: "La vérification a expiré. Reconnectez-vous.",
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
    twoFactor: {
      back: "Retour à la connexion",
      backupCode: "Code de secours",
      backupCodeInvalid:
        "Saisissez un code de secours, par exemple abcde-12345.",
      backupDescription:
        "Saisissez l'un de vos codes de secours. Chaque code ne fonctionne qu'une fois.",
      code: "Code de vérification",
      codeInvalid: "Saisissez le code à 6 chiffres.",
      submit: "Vérifier",
      submitting: "Vérification…",
      title: "Vérification en deux étapes",
      totpDescription:
        "Saisissez le code à 6 chiffres de votre application d'authentification.",
      trustDevice: "Faire confiance à cet appareil pendant 30 jours",
      useAuthenticator: "Utiliser votre application d'authentification",
      useBackupCode: "Utiliser un code de secours",
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
