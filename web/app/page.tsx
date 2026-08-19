"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingBlock } from "@/components/ui/Feedback";
import { homePathFor, useSession } from "@/contexts/SessionContext";

export default function RootPage() {
  const router = useRouter();
  const { ready, session } = useSession();

  useEffect(() => {
    if (!ready) return;
    router.replace(homePathFor(session));
  }, [ready, session, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <LoadingBlock label="Loading" />
    </div>
  );
}
