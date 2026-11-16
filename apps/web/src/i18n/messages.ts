import type { Locale } from "@roundcut/auth/locale";

const en = {
  account: {
    menu: {
      label: "My account",
      security: "Security",
      sessions: "Active sessions",
      signIn: "Sign in",
      signOut: "Sign out",
      team: "Team",
      terms: "Plan terms",
      workspace: "Workspace",
    },
    nav: {
      description:
        "Manage your workspace, plan terms, team, security and signed-in devices.",
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
    team: {
      accept: "Accept",
      accepting: "Joining…",
      actionError: "Couldn't complete this action. Try again.",
      cancel: "Cancel",
      decline: "Decline",
      description:
        "Invite editors to work on your projects. Your Studio has {seats} seats, owner included.",
      expires: "Expires {date}",
      invitationRevoked: "Invitation revoked.",
      invitationSent: "Invitation sent to {email}.",
      invite: "Invite a member",
      inviteDialog: {
        description:
          "We'll email them a link to join your Studio. They'll need a RoundCut account with this address.",
        email: "Email address",
        emailInvalid: "Enter a valid email address.",
        emailPlaceholder: "name@studio.com",
        role: "Role",
        seatsLeft: "Seats left: {count}",
        send: "Send invitation",
        sending: "Sending…",
        title: "Invite a team member",
      },
      inviteErrors: {
        alreadyInvited: "This address already has a pending invitation.",
        alreadyMember: "This person is already a member of your Studio.",
        seatsFull:
          "All seats are taken. Remove a member or revoke an invitation first.",
      },
      joined: "Joined {date}",
      leave: "Leave team",
      leaveDescription:
        "You lose access to this Studio's projects. Its owner can invite you again.",
      leaveTitle: "Leave {studio}?",
      leaving: "Leaving…",
      left: "You left the team.",
      loadErrorDescription: "Check your connection and try again.",
      loadErrorTitle: "Couldn't load your team",
      memberActions: "Actions for {name}",
      memberDescription:
        "You're a {role} in this Studio. Only its owner can invite or manage members.",
      memberRemoved: "Member removed.",
      membersTitle: "Members",
      pendingEmptyDescription:
        "Invitations you send show up here until they're accepted.",
      pendingEmptyTitle: "No pending invitations",
      pendingTitle: "Pending invitations",
      receivedItem: "{inviter} invited you to join {studio} as {role}.",
      receivedTitle: "Invitations for you",
      remove: "Remove from team",
      removeDescription:
        "They lose access to this Studio's projects right away. You can invite them again later.",
      removeTitle: "Remove {name}?",
      removing: "Removing…",
      retry: "Try again",
      revoke: "Revoke",
      role: "Role",
      roleDescriptions: {
        editor: "Works on projects and versions.",
        owner: "Manages the team, settings and billing.",
        viewer: "Follows projects without editing them.",
      },
      roles: { editor: "Editor", owner: "Owner", viewer: "Viewer" },
      roleUpdated: "Role updated.",
      seats: "Seats used: {used}/{total}",
      seatsFull:
        "All seats are taken. Remove a member or revoke an invitation to invite someone else.",
      studio: "Studio",
      title: "Team",
      you: "You",
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
  dashboard: {
    checklist: {
      description:
        "Follow these steps until you send your first review link to a client.",
      done: "Done",
      firstClient: "Add your first client",
      firstClientDescription: "Keep their contact and plan terms in one place.",
      firstLink: "Send your first review link",
      firstLinkDescription:
        "Your client comments on the video without creating an account.",
      firstProject: "Create your first project",
      firstProjectDescription: "Upload V1 of a deliverable to review.",
      progress: "{done} of {total} done",
      setup: "Set up your workspace",
      setupAction: "Finish setup",
      setupDescription:
        "Business name, currency and VAT, default plan terms and language.",
      soon: "Coming soon",
      title: "Get started",
    },
  },
  invitation: {
    accept: "Join the Studio",
    accepting: "Joining…",
    actionError: "Couldn't answer this invitation. Try again.",
    decline: "Decline",
    declining: "Declining…",
    description:
      "{inviter} invited you to join this Studio on RoundCut as {role}.",
    invalidDescription:
      "It may have expired, been revoked or been sent to another email address. Ask the Studio owner for a new one.",
    invalidTitle: "This invitation is no longer valid",
    signedOutDescription:
      "Sign in or create an account with the email address that received the invitation, then open this link again. You'll also find it under Settings > Team.",
    signedOutTitle: "Sign in to answer your invitation",
    signIn: "Sign in",
    signUp: "Create an account",
    title: "Join {studio}",
    toDashboard: "Go to dashboard",
  },
  onboarding: {
    back: "Back",
    continue: "Continue",
    finish: "Finish setup",
    finishing: "Saving…",
    includedRoundsInvalid: "Enter a number of rounds between 0 and {max}.",
    loadErrorDescription: "Check your connection and try again.",
    loadErrorTitle: "Couldn't load your workspace",
    progress: "Step {step} of {total}",
    progressLabel: "Onboarding progress",
    retry: "Try again",
    saveError: "Couldn't save your setup. Try again.",
    skip: "Skip for now",
    steps: {
      activity: {
        description: "The name your clients will see on review links.",
        label: "Business",
        summary: "Name your business.",
        title: "What's your business called?",
      },
      billing: {
        description: "Used for extra round prices and billable lines.",
        label: "Currency and VAT",
        summary: "How you bill.",
        title: "Set your currency and VAT",
      },
      language: {
        description: "For what you send to your clients and your reminders.",
        label: "Language",
        summary: "Language and time zone.",
        title: "Choose your language",
      },
      terms: {
        description:
          "Applied to your new projects. You can adjust them per project.",
        label: "Plan terms",
        summary: "Rounds, price and delay.",
        title: "Set your default plan terms",
      },
    },
    success: {
      cta: "Go to dashboard",
      description:
        "Your workspace is ready. Add a client and a project to send your first review link.",
      title: "{name} is ready",
    },
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
      team: "Équipe",
      terms: "Conditions de forfait",
      workspace: "Espace de travail",
    },
    nav: {
      description:
        "Gérez votre espace de travail, vos conditions de forfait, votre équipe, votre sécurité et vos appareils connectés.",
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
    team: {
      accept: "Accepter",
      accepting: "Connexion au Studio…",
      actionError: "Impossible de terminer cette action. Réessayez.",
      cancel: "Annuler",
      decline: "Refuser",
      description:
        "Invitez des monteurs à travailler sur vos projets. Votre Studio compte {seats} sièges, propriétaire compris.",
      expires: "Expire {date}",
      invitationRevoked: "Invitation révoquée.",
      invitationSent: "Invitation envoyée à {email}.",
      invite: "Inviter un membre",
      inviteDialog: {
        description:
          "Nous lui envoyons par email un lien pour rejoindre votre Studio. Il lui faudra un compte RoundCut avec cette adresse.",
        email: "Adresse email",
        emailInvalid: "Saisissez une adresse email valide.",
        emailPlaceholder: "nom@studio.fr",
        role: "Rôle",
        seatsLeft: "Sièges restants : {count}",
        send: "Envoyer l'invitation",
        sending: "Envoi…",
        title: "Inviter un membre de l'équipe",
      },
      inviteErrors: {
        alreadyInvited: "Cette adresse a déjà une invitation en attente.",
        alreadyMember: "Cette personne fait déjà partie de votre Studio.",
        seatsFull:
          "Tous les sièges sont pris. Retirez un membre ou révoquez une invitation d'abord.",
      },
      joined: "Membre depuis le {date}",
      leave: "Quitter l'équipe",
      leaveDescription:
        "Vous perdez l'accès aux projets de ce Studio. Son propriétaire pourra vous réinviter.",
      leaveTitle: "Quitter {studio} ?",
      leaving: "Départ…",
      left: "Vous avez quitté l'équipe.",
      loadErrorDescription: "Vérifiez votre connexion et réessayez.",
      loadErrorTitle: "Impossible de charger votre équipe",
      memberActions: "Actions pour {name}",
      memberDescription:
        "Vous êtes {role} dans ce Studio. Seul son propriétaire peut inviter ou gérer les membres.",
      memberRemoved: "Membre retiré.",
      membersTitle: "Membres",
      pendingEmptyDescription:
        "Les invitations envoyées apparaissent ici jusqu'à leur acceptation.",
      pendingEmptyTitle: "Aucune invitation en attente",
      pendingTitle: "Invitations en attente",
      receivedItem:
        "{inviter} vous invite à rejoindre {studio} avec le rôle {role}.",
      receivedTitle: "Invitations reçues",
      remove: "Retirer de l'équipe",
      removeDescription:
        "Cette personne perd immédiatement l'accès aux projets de ce Studio. Vous pourrez la réinviter plus tard.",
      removeTitle: "Retirer {name} ?",
      removing: "Retrait…",
      retry: "Réessayer",
      revoke: "Révoquer",
      role: "Rôle",
      roleDescriptions: {
        editor: "Travaille sur les projets et les versions.",
        owner: "Gère l'équipe, les paramètres et la facturation.",
        viewer: "Suit les projets sans les modifier.",
      },
      roles: { editor: "Éditeur", owner: "Propriétaire", viewer: "Lecteur" },
      roleUpdated: "Rôle mis à jour.",
      seats: "Sièges utilisés : {used}/{total}",
      seatsFull:
        "Tous les sièges sont pris. Retirez un membre ou révoquez une invitation pour inviter quelqu'un d'autre.",
      studio: "Studio",
      title: "Équipe",
      you: "Vous",
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
  dashboard: {
    checklist: {
      description:
        "Suivez ces étapes jusqu'à l'envoi de votre premier lien de revue à un client.",
      done: "Terminé",
      firstClient: "Ajouter votre premier client",
      firstClientDescription:
        "Centralisez ses coordonnées et ses conditions de forfait.",
      firstLink: "Envoyer votre premier lien de revue",
      firstLinkDescription:
        "Votre client commente la vidéo sans créer de compte.",
      firstProject: "Créer votre premier projet",
      firstProjectDescription: "Déposez la V1 d'un livrable à faire relire.",
      progress: "{done} sur {total} terminées",
      setup: "Configurer votre espace",
      setupAction: "Terminer la configuration",
      setupDescription:
        "Nom de l'activité, devise et TVA, conditions par défaut et langue.",
      soon: "Bientôt disponible",
      title: "Bien démarrer",
    },
  },
  invitation: {
    accept: "Rejoindre le Studio",
    accepting: "Connexion au Studio…",
    actionError: "Impossible de répondre à cette invitation. Réessayez.",
    decline: "Refuser",
    declining: "Refus…",
    description:
      "{inviter} vous invite à rejoindre ce Studio sur RoundCut avec le rôle {role}.",
    invalidDescription:
      "Elle a peut-être expiré, été révoquée ou envoyée à une autre adresse email. Demandez-en une nouvelle au propriétaire du Studio.",
    invalidTitle: "Cette invitation n'est plus valable",
    signedOutDescription:
      "Connectez-vous ou créez un compte avec l'adresse email qui a reçu l'invitation, puis rouvrez ce lien. Vous la retrouverez aussi dans Paramètres > Équipe.",
    signedOutTitle: "Connectez-vous pour répondre à votre invitation",
    signIn: "Se connecter",
    signUp: "Créer un compte",
    title: "Rejoindre {studio}",
    toDashboard: "Aller au tableau de bord",
  },
  onboarding: {
    back: "Retour",
    continue: "Continuer",
    finish: "Terminer la configuration",
    finishing: "Enregistrement…",
    includedRoundsInvalid: "Saisissez un nombre de tours entre 0 et {max}.",
    loadErrorDescription: "Vérifiez votre connexion et réessayez.",
    loadErrorTitle: "Impossible de charger votre espace",
    progress: "Étape {step} sur {total}",
    progressLabel: "Progression de la configuration",
    retry: "Réessayer",
    saveError: "Impossible d'enregistrer votre configuration. Réessayez.",
    skip: "Passer pour l'instant",
    steps: {
      activity: {
        description: "Le nom que verront vos clients sur les liens de revue.",
        label: "Activité",
        summary: "Nommez votre activité.",
        title: "Comment s'appelle votre activité ?",
      },
      billing: {
        description:
          "Utilisées pour le prix des tours supplémentaires et les lignes facturables.",
        label: "Devise et TVA",
        summary: "Votre facturation.",
        title: "Choisissez votre devise et votre TVA",
      },
      language: {
        description: "Pour ce que vous envoyez à vos clients et les relances.",
        label: "Langue",
        summary: "Langue et fuseau horaire.",
        title: "Choisissez votre langue",
      },
      terms: {
        description:
          "Appliquées à vos nouveaux projets. Vous pourrez les ajuster par projet.",
        label: "Conditions par défaut",
        summary: "Tours, prix et délai.",
        title: "Fixez vos conditions de forfait",
      },
    },
    success: {
      cta: "Accéder au tableau de bord",
      description:
        "Votre espace est prêt. Ajoutez un client et un projet pour envoyer votre premier lien de revue.",
      title: "{name} est prêt",
    },
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
