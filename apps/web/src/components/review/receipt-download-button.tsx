"use client";

import { Button } from "@roundcut/ui/components/button";
import { DownloadIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

export interface ReceiptDownloadMessages {
  download: string;
  downloadError: string;
  downloading: string;
}

// Saves a file the API returned through the browser's download.
export function saveFile(file: unknown) {
  if (!(file instanceof File)) {
    throw new Error("The API response isn't a file");
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
}

// Saves an agreement receipt PDF (EXTRA-07) fetched through the API: the
// reviewer's identity cookie only reaches /api/rpc, so the file comes back
// from the procedure rather than from a plain link.
export function ReceiptDownloadButton({
  fetchReceipt,
  label,
  messages,
}: {
  // The API's File is typed with Node's definition, not the DOM's.
  fetchReceipt: () => Promise<unknown>;
  label?: string;
  messages: ReceiptDownloadMessages;
}) {
  const [busy, setBusy] = useState(false);
  const handleClick = useCallback(async () => {
    setBusy(true);
    try {
      saveFile(await fetchReceipt());
    } catch {
      toast.error(messages.downloadError);
    } finally {
      setBusy(false);
    }
  }, [fetchReceipt, messages.downloadError]);
  return (
    <Button
      aria-label={label}
      disabled={busy}
      onClick={handleClick}
      size="sm"
      type="button"
      variant="outline"
    >
      <DownloadIcon aria-hidden="true" />
      {busy ? messages.downloading : messages.download}
    </Button>
  );
}
