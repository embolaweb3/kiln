"use client";

import type { BorrowPosition } from "@/lib/types";
import { fmtAmount, fmtBtc, fmtMusd } from "@/lib/format";
import { MCR_PERCENT } from "@/lib/mezo";
import { Banner, Skeleton } from "./ui";

const LABEL = { none: "No position", healthy: "Healthy", watch: "Watch", danger: "At risk" } as const;
const CLS = { none: "", healthy: "green", watch: "amber", danger: "red" } as const;

/** Knob position: 110% (MCR) at the left edge, 300%+ at the right. */
function knobPct(icr: number) {
  return Math.max(2, Math.min(98, ((icr - MCR_PERCENT) / (300 - MCR_PERCENT)) * 100));
}

export function PositionHealth({ position, compact }: { position: BorrowPosition | undefined; compact?: boolean }) {
  if (!position) {
    return (
      <div className="stack">
        <Skeleton h={18} w="40%" />
        <Skeleton h={8} />
      </div>
    );
  }
  if (!position.active) {
    return (
      <div className="stack">
        <div className="row between">
          <h3>Borrow position</h3>
          <span className="badge">No position</span>
        </div>
        <p className="muted small">You have no open MUSD position on Mezo yet.</p>
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="row between">
        <h3>Borrow position</h3>
        <span className={`badge ${CLS[position.health]}`}>
          <span className="dot" />
          {LABEL[position.health]}
        </span>
      </div>
      <div>
        <div className="row between small" style={{ marginBottom: 10 }}>
          <span className="muted">Collateral ratio</span>
          <b className="num">{position.icr.toFixed(1)}%</b>
        </div>
        <div className="health-bar">
          <div className="health-knob" style={{ left: `${knobPct(position.icr)}%` }} />
        </div>
        <div className="row between faint small" style={{ marginTop: 8 }}>
          <span>{MCR_PERCENT}% liquidated</span>
          <span>300%</span>
        </div>
      </div>
      {!compact && (
        <div>
          <div className="kv"><span>Collateral</span><span>{fmtBtc(position.collateral)}</span></div>
          <div className="kv"><span>Debt</span><span>{fmtMusd(position.debt)}</span></div>
          <div className="kv"><span>BTC price</span><span>${fmtAmount(BigInt(Math.round(position.btcPrice)) * 10n ** 18n, 0)}</span></div>
          <div className="kv">
            <span>Liquidation price</span>
            <span>${position.liquidationPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
          </div>
          <div className="kv"><span>Price drop to liquidation</span><span>{position.liquidationDistance.toFixed(1)}%</span></div>
        </div>
      )}
      {position.health === "danger" && (
        <Banner kind="error">
          <span><b>Close to liquidation.</b> Add collateral or repay on Mezo before joining a sale. Kiln cannot protect this position.</span>
        </Banner>
      )}
      {position.health === "watch" && (
        <Banner kind="warn">
          <span>Ratio is below the 200% buffer we recommend. A BTC drop of {position.liquidationDistance.toFixed(0)}% liquidates it.</span>
        </Banner>
      )}
    </div>
  );
}
