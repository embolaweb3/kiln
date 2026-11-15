"use client";

import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";
import { friendlyError } from "@/lib/errors";
import type { Sale } from "@/lib/types";

/** Fades children with a data-reveal attribute in, one after another. */
export function useReveal<T extends HTMLElement>(dep?: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const els = ref.current?.querySelectorAll("[data-reveal]");
    if (!els?.length) return;
    animate(els, {
      opacity: [0, 1],
      translateY: [14, 0],
      duration: 650,
      delay: stagger(70),
      ease: "outExpo",
    });
  }, [dep]);
  return ref;
}

export function Skeleton({ h = 20, w = "100%" }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} />;
}

export function CardSkeleton() {
  return (
    <div className="glass stack" aria-busy="true">
      <Skeleton h={22} w="55%" />
      <Skeleton h={14} w="80%" />
      <Skeleton h={10} />
      <Skeleton h={14} w="40%" />
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const f = friendlyError(error);
  return (
    <div className="glass center-state" role="alert">
      <div className="icon">!</div>
      <h3>{f.kind === "rpc" ? "Mezo RPC is unreachable" : "Something broke"}</h3>
      <p className="muted small" style={{ maxWidth: 380 }}>{f.message}</p>
      {onRetry && (
        <button className="btn secondary sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="glass center-state">
      <div className="icon">○</div>
      <h3>{title}</h3>
      <p className="muted small" style={{ maxWidth: 380 }}>{body}</p>
      {action}
    </div>
  );
}

export function Banner({ kind, children }: { kind: "info" | "warn" | "error" | "ok"; children: React.ReactNode }) {
  return <div className={`banner ${kind}`}>{children}</div>;
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

export function Progress({ raised, softCap, hardCap }: { raised: bigint; softCap: bigint; hardCap: bigint }) {
  const ref = useRef<HTMLDivElement>(null);
  const pct = hardCap === 0n ? 0 : Math.min(100, Number((raised * 10000n) / hardCap) / 100);
  const soft = hardCap === 0n ? 0 : Number((softCap * 10000n) / hardCap) / 100;
  useEffect(() => {
    if (ref.current) animate(ref.current, { width: `${pct}%`, duration: 1100, ease: "outExpo" });
  }, [pct]);
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-fill" ref={ref} />
      <div className="progress-mark" style={{ left: `${soft}%` }} title="Soft cap" />
    </div>
  );
}

const STATE_BADGE: Record<Sale["state"], { label: string; cls: string }> = {
  upcoming: { label: "Upcoming", cls: "blue" },
  live: { label: "Live", cls: "green pulse" },
  ended: { label: "Ended", cls: "" },
  failed: { label: "Failed, refunds open", cls: "red" },
  finalized: { label: "Finalized", cls: "" },
  vetoed: { label: "Vetoed", cls: "red" },
};

export function StateBadge({ state }: { state: Sale["state"] }) {
  const b = STATE_BADGE[state];
  return (
    <span className={`badge ${b.cls}`}>
      <span className="dot" />
      {b.label}
    </span>
  );
}
