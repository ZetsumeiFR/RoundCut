import type { Messages } from "@/i18n/messages";

const USER_EXISTS_CODES = new Set([
  "USER_ALREADY_EXISTS",
  "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
]);

const INVALID_CODE_CODES = new Set(["INVALID_CODE", "INVALID_BACKUP_CODE"]);

// Better-Auth's rate limiter answers 429 without an error code.
const TOO_MANY_REQUESTS = 429;

export function authErrorMessage(
  { code, status }: { code?: string; status: number },
  errors: Messages["auth"]["errors"]
) {
  // The two-factor lockout is a 429 too, but with its own code.
  if (code === "ACCOUNT_TEMPORARILY_LOCKED") {
    return errors.accountLocked;
  }
  if (status === TOO_MANY_REQUESTS) {
    return errors.tooManyRequests;
  }
  if (code && INVALID_CODE_CODES.has(code)) {
    return errors.invalidCode;
  }
  if (code === "INVALID_TWO_FACTOR_COOKIE") {
    return errors.twoFactorExpired;
  }
  if (code === "INVALID_PASSWORD") {
    return errors.invalidPassword;
  }
  if (code && USER_EXISTS_CODES.has(code)) {
    return errors.userExists;
  }
  if (code === "INVALID_EMAIL_OR_PASSWORD") {
    return errors.invalidCredentials;
  }
  return errors.generic;
}

// Codes Better-Auth appends as `?error=` when an OAuth sign-in fails.
export function googleErrorMessage(
  code: string,
  errors: Messages["auth"]["errors"]
) {
  if (code === "access_denied") {
    return errors.googleCancelled;
  }
  if (code === "account_not_linked") {
    return errors.googleAccountNotLinked;
  }
  return errors.googleFailed;
}
