import type { ReactNode } from "react";
import { AdminChrome } from "@/components/layout/AdminChrome";

export default function AdminConsoleLayout({ children }: { children: ReactNode }) {
  return <AdminChrome>{children}</AdminChrome>;
}
