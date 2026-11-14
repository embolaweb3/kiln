"use client";

import dynamic from "next/dynamic";
import { ShellSkeleton } from "./shell-skeleton";

// passport touches `document` while building its config, so the whole
// wallet tree has to skip server rendering
const Providers = dynamic(
  () => import("./providers").then((m) => m.Providers),
  { ssr: false, loading: () => <ShellSkeleton /> },
);

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
