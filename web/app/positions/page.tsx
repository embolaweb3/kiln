"use client";

import Link from "next/link";
import type { Address } from "viem";
import { ConnectGate } from "@/components/connect-gate";
import { useKiln } from "@/components/kiln-context";
import { PositionHealth } from "@/components/position-health";
import { useTx } from "@/components/tx-button";
import { useWallet } from "@/components/wallet";
import { CardSkeleton, EmptyState, ErrorState, StateBadge, useReveal } from "@/components/ui";
import { useAsync } from "@/hooks/use-async";
import { fmtAmount, fmtMusd } from "@/lib/format";
import type { Contribution } from "@/lib/types";

function Row({ c, onChanged }: { c: Contribution; onChanged: () => void }) {
  const kiln = useKiln();
  const claim = useTx(onChanged);
  const refund = useTx(onChanged);
  const veto = useTx(onChanged);
  const unlock = useTx(onChanged);
  const bond = useTx(onChanged);
  const { address: wallet } = useWallet();
  const a = c.sale.address;

  return (
    <div className="glass stack" data-reveal style={{ opacity: 0 }}>
      <div className="row between wrap">
        <div className="row">
          <Link href={`/sales/${a}`}><h2>{c.sale.name}</h2></Link>
          <StateBadge state={c.sale.state} />
        </div>
        <b className="num">{fmtMusd(c.contributed)}</b>
      </div>

      {c.refundable > 0n && (
        <div className="row between wrap">
          <span className="small muted">
            {c.sale.state === "vetoed" ? "Release was vetoed." : "Sale missed its soft cap."} Refundable: <b>{fmtMusd(c.refundable)}</b>
          </span>
          <button className="btn sm" disabled={refund.pending} onClick={() => refund.run(() => kiln.refund(a))}>
            {refund.pending ? "Refunding…" : "Refund"}
          </button>
        </div>
      )}
      {c.refunded && <p className="small muted">Refunded. Your Mezo debt is unchanged, repay it on Mezo to close the position.</p>}

      {c.bondShare > 0n && (
        <div className="row between wrap">
          <span className="small muted">The team bond was slashed. Your share: <b>{fmtAmount(c.bondShare, 2)} MEZO</b></span>
          <button className="btn sm" disabled={bond.pending} onClick={() => bond.run(() => kiln.claimBondShare(a))}>
            {bond.pending ? "Claiming…" : "Claim bond share"}
          </button>
        </div>
      )}

      {c.claimable > 0n && (
        <div className="row between wrap">
          <span className="small muted">Claimable: <b>{fmtAmount(c.claimable, 2)} {c.sale.symbol}</b></span>
          <button className="btn sm" disabled={claim.pending} onClick={() => claim.run(() => kiln.claim(a))}>
            {claim.pending ? "Claiming…" : "Claim tokens"}
          </button>
        </div>
      )}
      {c.claimed && <p className="small muted">Tokens claimed.</p>}

      {c.canVeto && (
        <div className="row between wrap">
          <span className="small muted">Release timelock is open. You can veto the remaining release.</span>
          <button className="btn secondary sm" disabled={veto.pending} onClick={() => veto.run(() => kiln.vetoRelease(a))}>
            {veto.pending ? "Vetoing…" : "Veto"}
          </button>
        </div>
      )}
      {c.vetoed && <p className="small muted">You vetoed this release.</p>}
      {c.stakeLocked && (
        <div className="row between wrap">
          <span className="small muted">
            {c.canUnlock ? "This sale has settled. Unlock your MEZO stake so you can unstake it." : "Your MEZO stake is locked until this sale settles."}
          </span>
          <button
            className="btn secondary sm"
            disabled={!c.canUnlock || unlock.pending}
            onClick={() => unlock.run(() => kiln.unlockStake(a, wallet as Address))}
          >
            {unlock.pending ? "Unlocking…" : "Unlock stake"}
          </button>
        </div>
      )}
      {claim.notice}{refund.notice}{veto.notice}{unlock.notice}{bond.notice}
    </div>
  );
}

function StakeCard({ onChanged, version }: { onChanged: () => void; version: unknown }) {
  const kiln = useKiln();
  const { address } = useWallet();
  const tier = useAsync(() => kiln.getMyTier(address as Address), [kiln, address, version]);
  const unstake = useTx(() => { tier.reload(); onChanged(); });
  const t = tier.data;
  if (tier.error) return <ErrorState error={tier.error} onRetry={tier.reload} />;
  if (!t) return <CardSkeleton />;
  return (
    <div className="glass stack" data-reveal style={{ opacity: 0 }}>
      <div className="row between"><h2>Staked MEZO</h2><span className="badge blue">{t.name} tier</span></div>
      <div className="stat-value">{fmtAmount(t.staked, 0)} MEZO</div>
      {t.stakeLocked ? (
        <p className="small muted">Locked by a sale that has not been unlocked yet. Unlock it on the contribution below, then unstake.</p>
      ) : (
        <p className="small muted">Nothing holds this stake, you can withdraw it.</p>
      )}
      {unstake.notice}
      <button className="btn secondary" disabled={t.stakeLocked || t.staked === 0n || unstake.pending} onClick={() => unstake.run(() => kiln.unstakeMezo(t.staked))}>
        {unstake.pending ? "Confirm in wallet…" : "Unstake all"}
      </button>
    </div>
  );
}

function Positions() {
  const kiln = useKiln();
  const { address } = useWallet();
  const list = useAsync(() => kiln.getMyContributions(address as Address), [kiln, address]);
  const position = useAsync(() => kiln.getBorrowPosition(address as Address), [kiln, address]);
  const ref = useReveal<HTMLDivElement>(list.data);

  return (
    <div ref={ref} className="layout-2">
      <div className="stack">
        {list.error ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : list.loading ? (
          <><CardSkeleton /><CardSkeleton /></>
        ) : list.data?.length === 0 ? (
          <EmptyState title="No contributions yet" body="Once you join a sale it shows up here, with claims, refunds and veto." action={<Link href="/" className="btn sm">Browse sales</Link>} />
        ) : (
          list.data?.map((c) => <Row key={c.sale.address} c={c} onChanged={list.reload} />)
        )}
      </div>
      <div className="stack">
        <div className="glass stack" data-reveal style={{ opacity: 0 }}>
          {position.error ? <ErrorState error={position.error} onRetry={position.reload} /> : <PositionHealth position={position.data} />}
          {position.data?.active && (
            <p className="hint">
              Closing this position on Mezo takes slightly more MUSD than you borrowed. The 0.1% borrowing fee was added to your debt but never paid out to you, and interest accrues at 1% a year. The 200 MUSD gas compensation comes back on close.
            </p>
          )}
        </div>
        <StakeCard onChanged={list.reload} version={list.data} />
      </div>
    </div>
  );
}

export default function PositionsPage() {
  return (
    <div>
      <div className="page-head">
        <span className="eyebrow">Portfolio</span>
        <h1>My positions</h1>
      </div>
      <ConnectGate what="see your positions">
        <Positions />
      </ConnectGate>
    </div>
  );
}
