import { formatUnits, parseUnits } from "viem";

export function fmtAmount(v: bigint, maxFrac = 2): string {
  const n = Number(formatUnits(v, 18));
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFrac });
}

export const fmtMusd = (v: bigint) => `${fmtAmount(v, 0)} MUSD`;
export const fmtBtc = (v: bigint) => `${fmtAmount(v, 4)} BTC`;

export function parseAmount(s: string): bigint | null {
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  try {
    return parseUnits(s, 18);
  } catch {
    return null;
  }
}

export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
