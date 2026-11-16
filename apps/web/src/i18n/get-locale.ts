import { resolveLocale } from "@roundcut/auth/locale";
import { headers } from "next/headers";

export async function getLocale() {
  return resolveLocale((await headers()).get("accept-language"));
}
