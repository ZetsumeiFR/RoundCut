"use client";

import { isCommentAttachmentType } from "@roundcut/api/comment";
import type { AppRouterClient } from "@roundcut/api/routers/index";
import {
  BRAND_ACCENT_PATTERN,
  BRAND_LOGO_MAX_BYTES,
} from "@roundcut/api/workspace";
import { Button } from "@roundcut/ui/components/button";
import { FieldGroup } from "@roundcut/ui/components/field";
import { Input } from "@roundcut/ui/components/input";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@roundcut/ui/components/reui/alert";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, LockIcon } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { putBlob } from "@/components/projects/version-upload";
import { BrandLogo, brandStyle } from "@/components/review/brand";
import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";
import { SettingRow } from "./setting-row";
import { SettingsCard } from "./settings-card";
import { SettingsAlert } from "./settings-form";

type WorkspaceMessages = Messages["account"]["workspace"];
type BrandingMessages = WorkspaceMessages["branding"];
type Workspace = Awaited<ReturnType<AppRouterClient["workspace"]["get"]>>;

// The color input needs a value: RoundCut's own near-black stands for none.
const DEFAULT_ACCENT = "#171717";
const LOGO_ACCEPT = "image/png,image/jpeg,image/webp";

type Logo =
  | { file: File; kind: "new"; url: string }
  | { key: string; kind: "saved"; url: string | null }
  | null;

const savedLogo = (workspace: Workspace): Logo =>
  workspace.branding.logoKey
    ? {
        key: workspace.branding.logoKey,
        kind: "saved",
        url: workspace.branding.logoUrl,
      }
    : null;

const logoKeyOf = (logo: Logo) => (logo?.kind === "saved" ? logo.key : null);

const isLogoFile = (file: File) =>
  isCommentAttachmentType(file.type) && file.size <= BRAND_LOGO_MAX_BYTES;

function BrandPreview({
  accent,
  logoUrl,
  messages,
  workspaceName,
}: {
  accent: string | null;
  logoUrl: string | null;
  messages: BrandingMessages;
  workspaceName: string;
}) {
  return (
    <div
      className="flex flex-col items-start gap-3 border bg-background p-3"
      style={brandStyle(accent)}
    >
      {logoUrl ? (
        <BrandLogo
          alt={formatMessage(messages.logoAlt, { name: workspaceName })}
          src={logoUrl}
        />
      ) : (
        <span className="font-semibold text-sm">{workspaceName}</span>
      )}
      <Button size="sm" tabIndex={-1} type="button">
        {messages.previewAction}
      </Button>
    </div>
  );
}

function LockedBranding({ messages }: { messages: BrandingMessages }) {
  return (
    <div className="px-5 py-4">
      <Alert variant="info">
        <LockIcon aria-hidden="true" />
        <AlertTitle className="line-clamp-none">{messages.locked}</AlertTitle>
        <AlertDescription>{messages.lockedDescription}</AlertDescription>
      </Alert>
    </div>
  );
}

function BrandingForm({
  messages,
  workspace,
  workspaceMessages,
}: {
  messages: BrandingMessages;
  workspace: Workspace;
  workspaceMessages: WorkspaceMessages;
}) {
  const ids = useId();
  const queryClient = useQueryClient();
  const logoInput = useRef<HTMLInputElement>(null);
  const openLogoPicker = useCallback(() => logoInput.current?.click(), []);
  const [logo, setLogo] = useState<Logo>(() => savedLogo(workspace));
  const [accent, setAccent] = useState(workspace.branding.accentColor ?? "");
  const [errors, setErrors] = useState<{ accent?: string; logo?: string }>({});
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const { mutateAsync } = useMutation(
    orpc.workspace.updateBranding.mutationOptions({
      onSuccess: (saved) => {
        queryClient.setQueryData(orpc.workspace.get.queryKey(), saved);
      },
    })
  );

  const newLogoUrl = logo?.kind === "new" ? logo.url : null;
  useEffect(
    () => () => {
      if (newLogoUrl) {
        URL.revokeObjectURL(newLogoUrl);
      }
    },
    [newLogoUrl]
  );

  const normalizedAccent = accent.trim().toLowerCase();
  const accentValid =
    normalizedAccent === "" || BRAND_ACCENT_PATTERN.test(normalizedAccent);
  const isDirty =
    logo?.kind === "new" ||
    logoKeyOf(logo) !== workspace.branding.logoKey ||
    (normalizedAccent || null) !== workspace.branding.accentColor;

  const handleLogoChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }
      if (!isLogoFile(file)) {
        setErrors((current) => ({ ...current, logo: messages.logoInvalid }));
        return;
      }
      setErrors((current) => ({ ...current, logo: undefined }));
      setLogo({ file, kind: "new", url: URL.createObjectURL(file) });
    },
    [messages.logoInvalid]
  );
  const handleRemoveLogo = useCallback(() => {
    setErrors((current) => ({ ...current, logo: undefined }));
    setLogo(null);
  }, []);
  const handleAccentText = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setErrors((current) => ({ ...current, accent: undefined }));
      setAccent(event.target.value);
    },
    []
  );
  const handleResetAccent = useCallback(() => {
    setErrors((current) => ({ ...current, accent: undefined }));
    setAccent("");
  }, []);
  const handleCancel = useCallback(() => {
    setErrors({});
    setSaveError(false);
    setLogo(savedLogo(workspace));
    setAccent(workspace.branding.accentColor ?? "");
  }, [workspace]);

  const uploadLogo = useCallback(async () => {
    if (logo?.kind !== "new") {
      return logoKeyOf(logo);
    }
    const { file } = logo;
    if (!isCommentAttachmentType(file.type)) {
      throw new Error("Unsupported logo type");
    }
    const { key, url } = await api.workspace.signLogo({
      contentType: file.type,
      sizeBytes: file.size,
    });
    await putBlob(
      url,
      file,
      new AbortController().signal,
      () => undefined,
      file.type
    );
    return key;
  }, [logo]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!accentValid) {
        setErrors((current) => ({
          ...current,
          accent: messages.accentInvalid,
        }));
        return;
      }
      setSaving(true);
      setSaveError(false);
      try {
        const saved = await mutateAsync({
          accentColor: normalizedAccent || null,
          logoKey: await uploadLogo(),
        });
        setLogo(savedLogo(saved));
        setAccent(saved.branding.accentColor ?? "");
        toast.success(messages.saved);
      } catch {
        setSaveError(true);
      } finally {
        setSaving(false);
      }
    },
    [
      accentValid,
      messages.accentInvalid,
      messages.saved,
      mutateAsync,
      normalizedAccent,
      uploadLogo,
    ]
  );

  const logoUrl = logo?.url ?? null;
  const logoInputId = `${ids}-logo`;
  const accentInputId = `${ids}-accent`;
  const previewAccent =
    accentValid && normalizedAccent ? normalizedAccent : null;

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
      {saveError ? <SettingsAlert title={messages.saveError} /> : null}
      <SettingsCard
        description={messages.description}
        footer={
          <>
            <Button
              disabled={!isDirty || saving}
              onClick={handleCancel}
              type="button"
              variant="outline"
            >
              {workspaceMessages.cancel}
            </Button>
            <Button disabled={!isDirty || saving} type="submit">
              {saving ? workspaceMessages.saving : workspaceMessages.save}
            </Button>
          </>
        }
        title={messages.title}
      >
        <FieldGroup className="gap-0">
          <SettingRow
            description={messages.logoDescription}
            errors={errors.logo ? [{ message: errors.logo }] : undefined}
            labelFor={logoInputId}
            title={messages.logo}
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-12 min-w-24 max-w-44 items-center justify-center border bg-muted/40 px-2">
                {logoUrl ? (
                  <BrandLogo
                    alt={formatMessage(messages.logoAlt, {
                      name: workspace.name,
                    })}
                    src={logoUrl}
                  />
                ) : (
                  <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <ImageIcon aria-hidden="true" className="size-4" />
                    {messages.noLogo}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={openLogoPicker}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {logo ? messages.replaceLogo : messages.chooseLogo}
                </Button>
                {logo ? (
                  <Button
                    onClick={handleRemoveLogo}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {messages.removeLogo}
                  </Button>
                ) : null}
              </div>
              <input
                accept={LOGO_ACCEPT}
                className="sr-only"
                id={logoInputId}
                onChange={handleLogoChange}
                ref={logoInput}
                tabIndex={-1}
                type="file"
              />
            </div>
          </SettingRow>
          <SettingRow
            description={messages.accentDescription}
            errors={errors.accent ? [{ message: errors.accent }] : undefined}
            labelFor={accentInputId}
            title={messages.accent}
          >
            <div className="flex items-center gap-2">
              <input
                aria-label={messages.accentPicker}
                className="h-8 w-10 shrink-0 cursor-pointer border bg-transparent p-0.5"
                onChange={handleAccentText}
                type="color"
                value={previewAccent ?? DEFAULT_ACCENT}
              />
              <Input
                aria-invalid={errors.accent ? true : undefined}
                autoComplete="off"
                className="min-w-0 flex-1 font-mono"
                id={accentInputId}
                onChange={handleAccentText}
                placeholder={DEFAULT_ACCENT}
                spellCheck={false}
                value={accent}
              />
              <Button
                disabled={!accent}
                onClick={handleResetAccent}
                size="sm"
                type="button"
                variant="ghost"
              >
                {messages.resetAccent}
              </Button>
            </div>
          </SettingRow>
          <SettingRow
            description={messages.previewDescription}
            labelFor={`${ids}-preview`}
            last
            title={messages.preview}
          >
            <div id={`${ids}-preview`}>
              <BrandPreview
                accent={previewAccent}
                logoUrl={logoUrl}
                messages={messages}
                workspaceName={workspace.name}
              />
            </div>
          </SettingRow>
        </FieldGroup>
      </SettingsCard>
    </form>
  );
}

// White label of the review links (REV-10): editable on Pro and Studio,
// shown locked with the plans that include it on Solo.
export function BrandingSettings({
  messages,
  workspace,
}: {
  messages: WorkspaceMessages;
  workspace: Workspace;
}) {
  if (!workspace.whiteLabel) {
    return (
      <SettingsCard
        description={messages.branding.description}
        title={messages.branding.title}
      >
        <LockedBranding messages={messages.branding} />
      </SettingsCard>
    );
  }
  return (
    <BrandingForm
      messages={messages.branding}
      workspace={workspace}
      workspaceMessages={messages}
    />
  );
}
