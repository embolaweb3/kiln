"use client";

import dynamic from "next/dynamic";

// passport touches `document` while building its config, so the whole
// wallet tree has to skip server rendering
const Providers = dynamic(
  () => import("./providers").then((m) => m.Providers),
  { ssr: false },
);

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
