"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Sale } from "@/lib/types";
import { fmtDuration, fmtMusd } from "@/lib/format";
import { Progress, StateBadge } from "./ui";

export function timeLabel(s: Sale, nowSec: number): string {
  if (s.state === "upcoming") return `Starts in ${fmtDuration(s.start - nowSec)}`;
  if (s.state === "live") return `Ends in ${fmtDuration(s.end - nowSec)}`;
  return `Ended ${fmtDuration(nowSec - s.end)} ago`;
}

export function useNow(intervalMs = 30_000) {
  const [n, setN] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setN(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return n;
}

export function SaleCard({ sale }: { sale: Sale }) {
  const now = useNow();
  const endingSoon = sale.state === "live" && sale.end - now < 3600;
  const pct = sale.hardCap === 0n ? 0 : Number((sale.raised * 1000n) / sale.hardCap) / 10;
  return (
    <Link href={`/sales/${sale.address}`} className="glass link stack" data-reveal style={{ opacity: 0 }}>
      <div className="row between">
        <div className="row">
          <h2>{sale.name}</h2>
          <span className="faint small mono">{sale.symbol}</span>
        </div>
        <StateBadge state={sale.state} />
      </div>
      <p className="muted small" style={{ minHeight: 40 }}>{sale.tagline}</p>
      <Progress raised={sale.raised} softCap={sale.softCap} hardCap={sale.hardCap} />
      <div className="row between small">
        <span><b className="num">{fmtMusd(sale.raised)}</b> <span className="faint">of {fmtMusd(sale.hardCap)}</span></span>
        <span className="num muted">{pct.toFixed(0)}%</span>
      </div>
      <div className="row between small">
        <span className={endingSoon ? "badge amber" : "faint"}>{timeLabel(sale, now)}</span>
        <span className="faint">Bond {fmtMusd(sale.bond.amount).replace("MUSD", "MEZO")}</span>
      </div>
    </Link>
  );
}
