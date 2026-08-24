"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";
import { CopyButton } from "@/components/ui/Copy";
import { LoadingBlock } from "@/components/ui/Feedback";
import { docsApi, ApiError } from "@/lib/api";
import { BASE_PATH } from "@/lib/basePath";
import { cn, formatDate } from "@/lib/utils";
import type { DocCategory, DocOperation, TenantDocPage } from "@/lib/types";

const CATEGORY_ORDER: DocCategory[] = ["Authentication", "Documents", "Folders", "Versions", "Sharing"];

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

const METHOD_STYLES: Record<string, string> = {
  GET: "bg-[var(--success-soft)] text-[var(--success)] border-[#abefc6]",
  POST: "bg-[var(--accent-soft)] text-[var(--accent-hover)] border-[var(--accent-border)]",
  PUT: "bg-[#f3f0ff] text-[#5b3fbf] border-[#ddd6fe]",
  PATCH: "bg-[var(--warning-soft)] text-[var(--warning)] border-[#fed7aa]",
  DELETE: "bg-[var(--danger-soft)] text-[var(--danger)] border-[#fecdca]",
};

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-[var(--border)] bg-[#0b1220]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          {label || "Shell"}
        </span>
        <CopyButton
          value={code}
          label="Copy"
          className="h-6 w-6 border-white/10 text-slate-300 hover:border-white/20 hover:bg-white/10 hover:text-white"
        />
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 text-[12px] leading-relaxed text-slate-100">
        <code className="font-mono whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

function OperationCard({ operation }: { operation: DocOperation }) {
  return (
    <article className="scroll-mt-28 rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex h-6 min-w-[52px] items-center justify-center rounded-md border px-2 font-mono text-[11px] font-semibold",
            METHOD_STYLES[operation.method] || "bg-[var(--surface-muted)] text-[var(--text-secondary)] border-[var(--border)]"
          )}
        >
          {operation.method}
        </span>
        <code className="break-all font-mono text-[12.5px] font-medium text-[var(--text)]">
          {operation.path}
        </code>
      </div>
      <h4 className="mt-2.5 text-[14.5px] font-semibold tracking-[-0.01em] text-[var(--text)]">
        {operation.title}
      </h4>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">{operation.summary}</p>

      {operation.headers && operation.headers.length > 0 && (
        <div className="mt-3.5">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Headers
          </p>
          <div className="overflow-hidden rounded-lg border border-[var(--border)]">
            <table className="w-full border-collapse text-[12px]">
              <tbody>
                {operation.headers.map((header) => (
                  <tr key={header.name} className="border-b border-[var(--border)] last:border-0">
                    <td className="w-[34%] align-top bg-[var(--surface-muted)] px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <code className="font-mono text-[11.5px] font-medium text-[var(--text)]">{header.name}</code>
                        {header.required && (
                          <span className="text-[9.5px] font-semibold uppercase tracking-wide text-[var(--danger)]">
                            req
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="align-top px-3 py-2">
                      <code className="break-all font-mono text-[11.5px] text-[var(--accent-hover)]">{header.value}</code>
                      {header.description && (
                        <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--text-muted)]">
                          {header.description}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-3.5 space-y-3">
        {operation.body && <CodeBlock code={operation.body} label="Request body" />}
        <CodeBlock code={operation.curl} label="cURL" />
        <CodeBlock code={operation.response} label="Example response" />
      </div>

      {operation.notes && operation.notes.length > 0 && (
        <ul className="mt-3.5 space-y-1.5">
          {operation.notes.map((note) => (
            <li key={note} className="flex gap-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--text-muted)]" />
              {note}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export default function PublicDocsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [page, setPage] = useState<TenantDocPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    docsApi
      .publicPage(token)
      .then((result) => {
        if (!cancelled) setPage(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.status === 404
                ? "This documentation link is no longer available."
                : err.message
              : "Unable to load the documentation."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const grouped = useMemo(() => {
    if (!page) return [];
    return CATEGORY_ORDER.filter((category) => page.operations.some((op) => op.category === category)).map(
      (category) => ({
        category,
        operations: page.operations.filter((op) => op.category === category),
      })
    );
  }, [page]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingBlock label="Loading documentation" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <BrandMark size="lg" />
        <h1 className="mt-2 text-[18px] font-semibold text-[var(--text)]">Documentation unavailable</h1>
        <p className="max-w-sm text-[13.5px] text-[var(--text-secondary)]">{error}</p>
        <Link
          href={`${BASE_PATH}/login`}
          className="mt-1 text-[13px] font-medium text-[var(--accent)] hover:underline"
        >
          Go to sign-in
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--canvas)]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <BrandMark size="sm" />
          <div className="flex items-center gap-3 text-[12px] text-[var(--text-muted)]">
            <span className="hidden sm:inline">Developer documentation</span>
            <span className="hidden sm:inline">·</span>
            <span>Generated {formatDate(page.generatedAt)}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        {/* Hero */}
        <section className="pt-8 sm:pt-12">
          <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-muted)]">
            <BookOpen className="h-3.5 w-3.5" />
            API Reference
          </div>
          <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-[var(--text)] sm:text-[30px]">
            {page.title}
          </h1>
          <p className="mt-1 text-[14px] text-[var(--text-secondary)]">
            Prepared for <span className="font-medium text-[var(--text)]">{page.tenant.name}</span>
          </p>
          {page.intro && (
            <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[var(--text-secondary)]">{page.intro}</p>
          )}
          <div className="mt-4 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--text-muted)]">Base URL</span>
            <code className="break-all font-mono text-[12px] text-[var(--text)]">{page.apiBaseUrl}/api</code>
          </div>
        </section>

        {/* Category pills */}
        {grouped.length > 0 && (
          <nav className="sticky top-14 z-10 -mx-4 mt-8 border-y border-[var(--border)] bg-[var(--canvas)]/95 px-4 py-2.5 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-3">
            <ul className="flex gap-1.5 overflow-x-auto">
              {grouped.map(({ category }) => (
                <li key={category}>
                  <a
                    href={`#${slugify(category)}`}
                    className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-white hover:text-[var(--text)]"
                  >
                    {category}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Sections */}
        <div className="mt-8 space-y-12">
          {grouped.map(({ category, operations }) => (
            <section key={category} id={slugify(category)} className="scroll-mt-28">
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--text)]">{category}</h2>
                <span className="h-px flex-1 bg-[var(--border)]" />
                <span className="text-[12px] text-[var(--text-muted)]">{operations.length}</span>
              </div>
              <div className="space-y-4">
                {operations.map((operation) => (
                  <OperationCard key={operation.id} operation={operation} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-16 border-t border-[var(--border)] pt-6 text-center">
          <div className="flex items-center justify-center gap-2 text-[12px] text-[var(--text-muted)]">
            <ArrowLeft className="h-3.5 w-3.5" />
            Examples use placeholder values only — replace them with your own workspace details.
          </div>
          <p className="mt-2 text-[12px] text-[var(--text-muted)]">
            © {new Date(page.generatedAt).getFullYear()} {page.tenant.name} · Powered by Sify DMS
          </p>
        </footer>
      </main>
    </div>
  );
}
