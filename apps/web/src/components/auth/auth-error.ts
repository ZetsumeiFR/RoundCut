import type { Messages } from "@/i18n/messages";

const USER_EXISTS_CODES = new Set([
  "USER_ALREADY_EXISTS",
  "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
]);

export function authErrorMessage(
  code: string | undefined,
  errors: Messages["auth"]["errors"]
) {
  if (code && USER_EXISTS_CODES.has(code)) {
    return errors.userExists;
  }
  if (code === "INVALID_EMAIL_OR_PASSWORD") {
    return errors.invalidCredentials;
  }
  return errors.generic;
}
