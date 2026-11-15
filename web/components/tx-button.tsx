"use client";

import { useState } from "react";
import { friendlyError } from "@/lib/errors";
import type { TxResult } from "@/lib/types";
import { Banner } from "./ui";

/**
 * Runs a write, shows pending state, and turns rejection or RPC trouble into
 * a banner instead of a thrown error.
 */
export function useTx(onDone?: (r: TxResult) => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ReturnType<typeof friendlyError> | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  async function run(fn: () => Promise<TxResult>) {
    setPending(true);
    setError(null);
    setHash(null);
    try {
      const r = await fn();
      setHash(r.hash);
      onDone?.(r);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setPending(false);
    }
  }

  const notice = error ? (
    <Banner kind={error.kind === "rejected" ? "warn" : "error"}>{error.message}</Banner>
  ) : hash ? (
    <Banner kind="ok">
      <span>Confirmed. <span className="mono small">{hash.slice(0, 10)}…</span></span>
    </Banner>
  ) : null;

  return { run, pending, notice };
}
