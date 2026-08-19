import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function InlineLoader({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-10", className)}>
      <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      <p className="text-[13px] text-slate-500">{label}</p>
    </div>
  );
}

export function FullScreenLoader({ title = "Working…", subtitle }: { title?: string; subtitle?: string }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/35 backdrop-blur-sm">
      <div className="w-full max-w-xs rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_24px_70px_-35px_rgba(15,23,42,0.65)]">
        <div className="relative mx-auto mb-3 flex h-10 w-10 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-xl bg-indigo-400/20" />
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        </div>
        <p className="text-center text-[13px] font-semibold text-slate-800">{title}</p>
        {subtitle && <p className="mt-1 text-center text-[11px] text-slate-400">{subtitle}</p>}
      </div>
    </div>
  );
}
