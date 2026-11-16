"use client";

import { Button } from "@roundcut/ui/components/button";
import { Checkbox } from "@roundcut/ui/components/checkbox";
import { Field, FieldLabel } from "@roundcut/ui/components/field";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import type { Messages } from "@/i18n/messages";
import { authClient } from "@/lib/auth-client";

import { AuthCard } from "./auth-card";
import { authErrorMessage } from "./auth-error";
import {
  TwoFactorCodeForm,
  type TwoFactorCodeKind,
} from "./two-factor-code-form";

const TRUST_DEVICE_ID = "trust-device";

export function TwoFactorChallenge({
  messages,
  onBack,
}: {
  messages: Messages["auth"];
  onBack: () => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<TwoFactorCodeKind>("totp");
  const [trustDevice, setTrustDevice] = useState(false);
  const { errors, twoFactor } = messages;

  const verify = useCallback(
    async (code: string) => {
      const { error } =
        kind === "totp"
          ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
          : await authClient.twoFactor.verifyBackupCode({ code, trustDevice });
      if (error) {
        return authErrorMessage(error, errors);
      }
      router.push("/dashboard");
      return null;
    },
    [errors, kind, router, trustDevice]
  );

  const toggleKind = useCallback(
    () => setKind((current) => (current === "totp" ? "backup" : "totp")),
    []
  );

  return (
    <AuthCard
      description={
        kind === "totp"
          ? twoFactor.totpDescription
          : twoFactor.backupDescription
      }
      footer={
        <Button className="h-auto p-0" onClick={onBack} variant="link">
          {twoFactor.back}
        </Button>
      }
      title={twoFactor.title}
    >
      <TwoFactorCodeForm
        errorTitle={errors.title}
        invalidMessage={
          kind === "totp" ? twoFactor.codeInvalid : twoFactor.backupCodeInvalid
        }
        key={kind}
        kind={kind}
        label={kind === "totp" ? twoFactor.code : twoFactor.backupCode}
        onVerify={verify}
        pendingLabel={twoFactor.submitting}
        submitLabel={twoFactor.submit}
      >
        <Field orientation="horizontal">
          <Checkbox
            checked={trustDevice}
            id={TRUST_DEVICE_ID}
            onCheckedChange={setTrustDevice}
          />
          <FieldLabel className="font-normal" htmlFor={TRUST_DEVICE_ID}>
            {twoFactor.trustDevice}
          </FieldLabel>
        </Field>
      </TwoFactorCodeForm>
      <Button
        className="h-auto self-center p-0"
        onClick={toggleKind}
        variant="link"
      >
        {kind === "totp" ? twoFactor.useBackupCode : twoFactor.useAuthenticator}
      </Button>
    </AuthCard>
  );
}
