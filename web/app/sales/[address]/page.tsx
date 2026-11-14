"use client";

import Link from "next/link";
import type { Address } from "viem";
import { useKiln } from "@/components/kiln-context";
import { useNow, timeLabel } from "@/components/sale-card";
import { useTx } from "@/components/tx-button";
import { useWallet } from "@/components/wallet";
import { Banner, EmptyState, ErrorState, Progress, Skeleton, Stat, StateBadge, useReveal } from "@/components/ui";
import { useAsync } from "@/hooks/use-async";
import { fmtAmount, fmtDuration, fmtMusd, shortAddr } from "@/lib/format";
import type { Sale } from "@/lib/types";

const BOND_BADGE = { escrowed: ["green", "Escrowed"], released: ["", "Returned to team"], slashed: ["red", "Slashed to contributors"] } as const;

function ReleaseCard({ sale, onChanged }: { sale: Sale; onChanged: () => void }) {
  const kiln = useKiln();
  const now = useNow(10_000);
  const { connected } = useWallet();
  const veto = useTx(onChanged);
  const release = useTx(onChanged);
  const r = sale.release;

  const vetoPct = sale.raised === 0n ? 0 : Number((r.vetoWeight * 10000n) / sale.raised) / 100;
  const threshold = r.vetoBps / 100;
  const timelockOpen = r.timelockEnd !== null && r.timelockEnd > now;
  const timelockDone = r.timelockEnd !== null && r.timelockEnd <= now;

  return (
    <div className="glass stack" data-reveal style={{ opacity: 0 }}>
      <h2>Release and veto</h2>
      {sale.state === "upcoming" || sale.state === "live" || sale.state === "ended" ? (
        <p className="muted small">
          After the sale finalizes, {r.firstTrancheBps / 100}% of the raise goes to the team. The rest stays locked for{" "}
          {fmtDuration(r.timelock)} while contributors can veto. If {threshold}% of the raise vetoes, the remainder is refunded and the bond is slashed.
        </p>
      ) : sale.state === "failed" ? (
        <p className="muted small">The sale ended under its soft cap, so nothing is released.</p>
      ) : (
        <>
          <div className="row between">
            <span className="muted small">Veto weight</span>
            <b className="num small">{vetoPct.toFixed(1)}% of {threshold}% needed</b>
          </div>
          <Progress raised={BigInt(Math.round(Math.min(100, (vetoPct / threshold) * 100) * 100))} softCap={0n} hardCap={10000n} />
          {sale.state === "vetoed" && (
            <Banner kind="error"><span><b>Veto triggered.</b> The remainder is not released. Contributors can claim a refund and the bond was slashed.</span></Banner>
          )}
          {timelockOpen && (
            <Banner kind="info"><span>Timelock ends in <b>{fmtDuration((r.timelockEnd ?? 0) - now)}</b>. Contributors can still veto.</span></Banner>
          )}
          {timelockDone && sale.state === "finalized" && !r.remainderReleased && (
            <>
              <Banner kind="ok"><span>Timelock over and no veto. The remainder can be released to the team.</span></Banner>
              <button className="btn" disabled={!connected || release.pending} onClick={() => release.run(() => kiln.releaseTranche(sale.address))}>
                {release.pending ? "Releasing…" : "Release remaining tranche"}
              </button>
              {release.notice}
            </>
          )}
          {r.remainderReleased && <Banner kind="ok"><span>Remainder released to the team.</span></Banner>}
          {timelockOpen && (
            <>
              <button className="btn secondary" disabled={!connected || veto.pending} onClick={() => veto.run(() => kiln.vetoRelease(sale.address))}>
                {veto.pending ? "Vetoing…" : "Veto the release"}
              </button>
              {veto.notice}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function SaleDetail({ params }: { params: { address: string } }) {
  const kiln = useKiln();
  const { address: wallet, connected } = useWallet();
  const addr = params.address as Address;
  const sale = useAsync(() => kiln.getSale(addr), [kiln, addr]);
  const tier = useAsync(() => (wallet ? kiln.getMyTier(wallet) : Promise.resolve(undefined)), [kiln, wallet]);
  const now = useNow();
  const ref = useReveal<HTMLDivElement>(sale.data?.address);

  if (sale.error) return <ErrorState error={sale.error} onRetry={sale.reload} />;
  if (sale.loading) {
    return (
      <div className="stack">
        <Skeleton h={34} w="40%" />
        <Skeleton h={180} />
        <Skeleton h={180} />
      </div>
    );
  }
  const s = sale.data;
  if (!s) {
    return (
      <EmptyState title="Sale not found" body="This address is not a Kiln sale." action={<Link href="/" className="btn sm">Back to sales</Link>} />
    );
  }

  const [bondCls, bondLabel] = BOND_BADGE[s.bond.status];
  const canJoin = s.state === "live";
  const tierData = tier.data;

  return (
    <div ref={ref}>
      <div className="page-head" data-reveal style={{ opacity: 0 }}>
        <Link href="/" className="faint small">← All sales</Link>
        <div className="row wrap">
          <h1>{s.name}</h1>
          <span className="faint mono">{s.symbol}</span>
          <StateBadge state={s.state} />
        </div>
        <p className="muted">{s.tagline}</p>
      </div>

      <div className="layout-2">
        <div className="stack">
          <div className="glass stack" data-reveal style={{ opacity: 0 }}>
            <div className="row between">
              <h2>Raise</h2>
              <span className="muted small">{timeLabel(s, now)}</span>
            </div>
            <div className="row between">
              <span className="stat-value">{fmtMusd(s.raised)}</span>
              <span className="muted small">hard cap {fmtMusd(s.hardCap)}</span>
            </div>
            <Progress raised={s.raised} softCap={s.softCap} hardCap={s.hardCap} />
            <div className="grid cols-3" style={{ marginTop: 6 }}>
              <Stat label="Soft cap" value={fmtMusd(s.softCap)} />
              <Stat label="Price" value={`${fmtAmount(s.price, 3)} MUSD`} />
              <Stat label="Raised vs soft cap" value={s.raised >= s.softCap ? "Met" : `${fmtAmount(s.softCap - s.raised, 0)} to go`} />
            </div>
            {s.raised < s.softCap && s.state === "live" && (
              <p className="hint">Under the soft cap at the end, everyone gets a full refund.</p>
            )}
          </div>

          <ReleaseCard sale={s} onChanged={sale.reload} />
        </div>

        <div className="stack">
          <div className="glass stack" data-reveal style={{ opacity: 0 }}>
            <div className="row between">
              <h2>Team bond</h2>
              <span className={`badge ${bondCls}`}>{bondLabel}</span>
            </div>
            <div className="stat-value">{fmtAmount(s.bond.amount, 0)} MEZO</div>
            <p className="muted small">
              The team escrowed this MEZO to launch. It is slashed to contributors if they veto the release.
            </p>
            <div className="kv"><span>Team</span><span className="mono">{shortAddr(s.team)}</span></div>
          </div>

          <div className="glass stack" data-reveal style={{ opacity: 0 }}>
            <h2>Your allocation</h2>
            {!connected ? (
              <p className="muted small">Connect a wallet to see your tier and cap.</p>
            ) : tier.loading ? (
              <Skeleton h={50} />
            ) : tier.error ? (
              <ErrorState error={tier.error} onRetry={tier.reload} />
            ) : tierData ? (
              <>
                <div className="row between"><span className="badge blue">{tierData.name} tier</span><b className="num">{fmtMusd(tierData.cap)} cap</b></div>
                <div className="kv"><span>Staked MEZO</span><span>{fmtAmount(tierData.staked, 0)}</span></div>
                {tierData.nextTierAt && <p className="hint">Stake up to {fmtAmount(tierData.nextTierAt, 0)} MEZO for the next tier.</p>}
              </>
            ) : null}
            {canJoin ? (
              <Link href={`/sales/${s.address}/participate`} className="btn block">Participate</Link>
            ) : (
              <button className="btn block" disabled>{s.state === "upcoming" ? "Not open yet" : "Sale closed"}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
