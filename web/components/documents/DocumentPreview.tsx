"use client";

import { AlertTriangle, FileQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Renders a browser-previewable signed storage URL. Preview support depends on
 * the browser and the stored content type; unsupported files fall back to a
 * clear message instead of forcing a download in an iframe.
 */
export function DocumentPreview({
  url,
  mimeType,
  fileName,
  className,
}: {
  url: string;
  mimeType: string;
  fileName: string;
  className?: string;
}) {
  const type = mimeType.toLowerCase();
  const frameClass = cn(
    "h-full min-h-[520px] w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]",
    className
  );

  if (type.startsWith("image/")) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={fileName}
          className="max-h-[75vh] max-w-full rounded-lg object-contain"
        />
      </div>
    );
  }

  if (type.startsWith("video/")) {
    return (
      <video
        src={url}
        controls
        autoPlay
        className={cn(frameClass, "bg-black")}
        title={fileName}
      />
    );
  }

  if (type.startsWith("audio/")) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-6">
        <audio src={url} controls autoPlay className="w-full" title={fileName} />
      </div>
    );
  }

  if (
    type === "application/pdf" ||
    type === "text/plain" ||
    type === "text/csv" ||
    type === "text/html"
  ) {
    return <iframe src={url} title={fileName} className={frameClass} sandbox="allow-scripts" />;
  }

  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[var(--text-muted)] shadow-[var(--shadow-xs)]">
        <FileQuestion className="h-5 w-5" />
      </span>
      <h3 className="mt-3 text-[14px] font-semibold text-[var(--text)]">Preview not available</h3>
      <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
        Browsers cannot render {type || "this file type"} inline. Use Download to open it with the
        appropriate application.
      </p>
    </div>
  );
}

export function PreviewUnavailable({ message }: { message: string }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-amber-200 bg-amber-50/70 p-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-amber-600 shadow-[var(--shadow-xs)]">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <h3 className="mt-3 text-[14px] font-semibold text-[var(--text)]">Preview unavailable</h3>
      <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
        {message}
      </p>
    </div>
  );
}
