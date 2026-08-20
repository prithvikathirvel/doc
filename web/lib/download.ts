"use client";

import { documentsApi, pickSignedUrl, sessionHeaders } from "./api";
import type { Document } from "./types";

/**
 * Downloads a document version. A signed URL is used when the tenant's provider
 * supports it; otherwise the file is streamed through the API.
 */
export async function downloadDocument(
  tenantId: string,
  document: Document,
  versionNumber?: number
): Promise<void> {
  const result = await documentsApi.download(tenantId, document.id, versionNumber);
  const signed = pickSignedUrl(result);
  if (signed?.url) {
    window.open(signed.url, "_blank", "noopener,noreferrer");
    return;
  }

  const response = await fetch(documentsApi.contentUrl(document.id, versionNumber), {
    headers: sessionHeaders(tenantId),
  });
  if (!response.ok) throw new Error("The file could not be downloaded");

  const blob = await response.blob();
  const anchor = window.document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = document.originalFilename || document.name;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}
