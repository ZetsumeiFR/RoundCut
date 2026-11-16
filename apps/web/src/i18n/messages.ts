import type { Locale } from "@roundcut/auth/locale";

const en = {
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
      invalidCredentials: "Invalid email or password.",
      title: "Something went wrong",
      userExists: "An account already exists with this email.",
    },
    fields: {
      email: "Email",
      emailPlaceholder: "you@example.com",
      hidePassword: "Hide password",
      name: "Name",
      namePlaceholder: "Jane Doe",
      password: "Password",
      passwordPlaceholder: "At least {min} characters",
      showPassword: "Show password",
    },
    signIn: {
      description: "Sign in to continue to your workspace.",
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
      invalidCredentials: "Email ou mot de passe incorrect.",
      title: "Une erreur est survenue",
      userExists: "Un compte existe déjà avec cet email.",
    },
    fields: {
      email: "Email",
      emailPlaceholder: "vous@exemple.fr",
      hidePassword: "Masquer le mot de passe",
      name: "Nom",
      namePlaceholder: "Camille Martin",
      password: "Mot de passe",
      passwordPlaceholder: "Au moins {min} caractères",
      showPassword: "Afficher le mot de passe",
    },
    signIn: {
      description: "Connectez-vous pour accéder à votre espace.",
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
