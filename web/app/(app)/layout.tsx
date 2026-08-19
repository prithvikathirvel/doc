"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/contexts/SessionContext";
import { InlineLoader } from "@/components/ui/Loader";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const { ready, session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!session.tenantId || !session.userId) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
    }
  }, [ready, session.tenantId, session.userId, router, pathname]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8fafc]">
        <InlineLoader label="Starting DMS…" />
      </div>
    );
  }

  return <>{children}</>;
}
