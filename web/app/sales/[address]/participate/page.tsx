"use client";

import Link from "next/link";
import { useState } from "react";
import { formatUnits, type Address } from "viem";
import { useBalance } from "wagmi";
import { ConnectGate } from "@/components/connect-gate";
import { useKiln } from "@/components/kiln-context";
import { PositionHealth } from "@/components/position-health";
import { useTx } from "@/components/tx-button";
import { useWallet } from "@/components/wallet";
import { Banner, ErrorState, Skeleton, useReveal } from "@/components/ui";
import { useAsync } from "@/hooks/use-async";
import { fmtAmount, fmtMusd, parseAmount } from "@/lib/format";
import {
  GAS_COMPENSATION,
  MIN_NET_DEBT,
  MCR_PERCENT,
  collateralForIcr,
  quoteBorrow,
} from "@/lib/mezo";

const STEPS = ["Borrow MUSD", "Stake MEZO", "Contribute"];

function Steps({ at }: { at: number }) {
  return (
    <div className="steps">
      {STEPS.map((s, i) => (
        <div key={s} className={`step ${i === at ? "active" : ""} ${i < at ? "done" : ""}`}>
          <b>{i < at ? "✓ " : `${i + 1}. `}{s}</b>
          {i === 1 ? "Optional" : i === 0 ? "On Mezo" : "On Kiln"}
        </div>
      ))}
    </div>
  );
}

function BorrowStep({ onNext }: { onNext: () => void }) {
  const kiln = useKiln();
  const { address } = useWallet();
  const position = useAsync(() => kiln.getBorrowPosition(address as Address), [kiln, address]);
  const btc = useBalance({ address });
  const [musdText, setMusdText] = useState("2000");
  const [btcText, setBtcText] = useState("");
  const tx = useTx(() => position.reload());

  const p = position.data;
  const musd = parseAmount(musdText);
  const price = p?.btcPrice ?? 0;
  const suggested = musd && price ? collateralForIcr(musd, price, 200) : null;
  const collateral = btcText === "" ? (suggested ?? 0n) : (parseAmount(btcText) ?? 0n);
  const opening = !p?.active;

  const quote =
    musd && price
      ? quoteBorrow({
          musd,
          collateral,
          btcPrice: price,
          existingDebt: p?.debt,
          existingCollateral: p?.collateral,
        })
      : null;

  const belowMin = opening && musd !== null && musd < MIN_NET_DEBT;
  const tooMuchBtc = btc.data && collateral > btc.data.value;
  const unsafe = quote ? quote.icr < MCR_PERCENT + 0.5 : false;
  const invalid = !musd || belowMin || !quote || unsafe || !!tooMuchBtc || (opening && collateral === 0n);

  return (
    <div className="stack">
      {position.error ? (
        <ErrorState error={position.error} onRetry={position.reload} />
      ) : (
        <div className="glass"><PositionHealth position={p} /></div>
      )}

      <div className="glass stack">
        <h2>{opening ? "Open a position on Mezo" : "Borrow more MUSD"}</h2>
        <p className="muted small">
          This is a Mezo transaction, Kiln never touches your BTC. You get MUSD in your wallet, then contribute it in step 3.
          {p && p.musdBalance > 0n && <> You already hold <b>{fmtMusd(p.musdBalance)}</b>, you can skip ahead.</>}
        </p>

        <div className="field">
          <label htmlFor="musd">MUSD to borrow</label>
          <input id="musd" className={`input ${belowMin ? "bad" : ""}`} inputMode="decimal" value={musdText} onChange={(e) => setMusdText(e.target.value)} />
          {belowMin ? (
            <span className="hint bad">Mezo requires at least {fmtAmount(MIN_NET_DEBT, 0)} MUSD net debt to open a position.</span>
          ) : (
            <span className="hint">Minimum net debt {fmtAmount(MIN_NET_DEBT, 0)} MUSD when opening.</span>
          )}
        </div>

        <div className="field">
          <label htmlFor="btc">BTC collateral</label>
          <input
            id="btc"
            className={`input ${tooMuchBtc ? "bad" : ""}`}
            inputMode="decimal"
            placeholder={suggested ? `${formatUnits(suggested, 18).slice(0, 8)} (for 200% ratio)` : "0.0"}
            value={btcText}
            onChange={(e) => setBtcText(e.target.value)}
          />
          <span className={`hint ${tooMuchBtc ? "bad" : ""}`}>
            {tooMuchBtc ? "More than the BTC in your wallet." : btc.data ? `Wallet balance ${fmtAmount(btc.data.value, 4)} BTC. Leave some for fees.` : "Left empty we size it for a 200% ratio."}
          </span>
        </div>

        {quote ? (
          <div>
            <div className="kv"><span>Borrowing fee (0.1%)</span><span>{fmtMusd(quote.fee)}</span></div>
            <div className="kv"><span>Gas compensation (locked, refunded on close)</span><span>{quote.gasCompensation > 0n ? fmtMusd(GAS_COMPENSATION) : "Already paid"}</span></div>
            <div className="kv"><span>Total debt</span><span>{fmtMusd(quote.totalDebt)}</span></div>
            <div className="kv"><span>Collateral ratio</span><span>{Number.isFinite(quote.icr) ? `${quote.icr.toFixed(1)}%` : "—"}</span></div>
            <div className="kv"><span>Liquidation price</span><span>${quote.liquidationPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span></div>
            <div className="kv"><span>BTC can fall by</span><span>{quote.liquidationDistance.toFixed(1)}%</span></div>
          </div>
        ) : (
          <Skeleton h={90} />
        )}
        {quote && quote.icr < 150 && quote.icr >= MCR_PERCENT + 0.5 && (
          <Banner kind="warn"><span>At {quote.icr.toFixed(0)}% a {quote.liquidationDistance.toFixed(0)}% BTC drop liquidates you. We suggest 200% or more.</span></Banner>
        )}
        {unsafe && <Banner kind="error"><span>Below the {MCR_PERCENT}% minimum. Mezo would reject this.</span></Banner>}
        <p className="hint">
          Interest is a fixed 1% a year. Refunds from a failed sale do not repay this debt, you still owe the fee and interest.
        </p>
        {tx.notice}
        <div className="row wrap">
          <button className="btn" disabled={invalid || tx.pending} onClick={() => tx.run(() => kiln.borrowMusd({ musd: musd as bigint, collateral }))}>
            {tx.pending ? "Confirm in wallet…" : opening ? "Open position and borrow" : "Borrow"}
          </button>
          <button className="btn secondary" onClick={onNext}>{p && p.musdBalance > 0n ? "I have MUSD, continue" : "Continue"}</button>
        </div>
      </div>
    </div>
  );
}

function StakeStep({ onNext }: { onNext: () => void }) {
  const kiln = useKiln();
  const { address } = useWallet();
  const tier = useAsync(() => kiln.getMyTier(address as Address), [kiln, address]);
  const [text, setText] = useState("");
  const tx = useTx(() => tier.reload());
  const amount = parseAmount(text);
  const t = tier.data;
  const over = t && amount !== null && amount > t.mezoBalance;

  return (
    <div className="glass stack">
      <h2>Stake MEZO for a bigger cap</h2>
      <p className="muted small">Your cap decides how much MUSD you can put into one sale. Staked MEZO stays locked while you hold a contribution.</p>
      {tier.error ? (
        <ErrorState error={tier.error} onRetry={tier.reload} />
      ) : !t ? (
        <Skeleton h={80} />
      ) : (
        <>
          <div className="kv"><span>Current tier</span><span>{t.name}</span></div>
          <div className="kv"><span>Staked</span><span>{fmtAmount(t.staked, 0)} MEZO</span></div>
          <div className="kv"><span>Cap per sale</span><span>{fmtMusd(t.cap)}</span></div>
          {t.nextTierAt && <div className="kv"><span>Next tier at</span><span>{fmtAmount(t.nextTierAt, 0)} MEZO</span></div>}
          <div className="field">
            <label htmlFor="stake">MEZO to stake</label>
            <input id="stake" className={`input ${over ? "bad" : ""}`} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} placeholder="0" />
            <span className={`hint ${over ? "bad" : ""}`}>{over ? "More than your MEZO balance." : `Balance ${fmtAmount(t.mezoBalance, 0)} MEZO`}</span>
          </div>
        </>
      )}
      {tx.notice}
      <div className="row wrap">
        <button className="btn" disabled={!amount || !!over || tx.pending} onClick={() => tx.run(() => kiln.stakeMezo(amount as bigint))}>
          {tx.pending ? "Confirm in wallet…" : "Stake"}
        </button>
        <button className="btn secondary" onClick={onNext}>Skip, continue</button>
      </div>
    </div>
  );
}

function ContributeStep({ saleAddress }: { saleAddress: Address }) {
  const kiln = useKiln();
  const { address } = useWallet();
  const sale = useAsync(() => kiln.getSale(saleAddress), [kiln, saleAddress]);
  const tier = useAsync(() => kiln.getMyTier(address as Address), [kiln, address]);
  const position = useAsync(() => kiln.getBorrowPosition(address as Address), [kiln, address]);
  const mine = useAsync(() => kiln.getMyContributions(address as Address), [kiln, address]);
  const [text, setText] = useState("");
  const tx = useTx(() => mine.reload());

  const s = sale.data;
  const already = mine.data?.find((c) => c.sale.address === saleAddress)?.contributed ?? 0n;
  const room = tier.data ? (tier.data.cap > already ? tier.data.cap - already : 0n) : 0n;
  const left = s ? s.hardCap - s.raised : 0n;
  const balance = position.data?.musdBalance ?? 0n;
  const max = [room, left, balance].reduce((a, b) => (a < b ? a : b));
  const amount = parseAmount(text);
  const reason =
    amount === null ? null
    : amount > balance ? "More MUSD than you hold. Borrow more in step 1."
    : amount > room ? "Above your tier cap. Stake more MEZO in step 2."
    : amount > left ? "Above what is left in the sale."
    : null;

  if (sale.error || tier.error || position.error) {
    return <ErrorState error={sale.error ?? tier.error ?? position.error} onRetry={() => { sale.reload(); tier.reload(); position.reload(); }} />;
  }

  return (
    <div className="stack">
      <div className="glass"><PositionHealth position={position.data} compact /></div>
      <div className="glass stack">
        <h2>Contribute to {s?.name ?? "…"}</h2>
        {s && s.state !== "live" && <Banner kind="warn"><span>This sale is not live, contributing is closed.</span></Banner>}
        <div className="kv"><span>MUSD in wallet</span><span>{fmtMusd(balance)}</span></div>
        <div className="kv"><span>Your cap left</span><span>{fmtMusd(room)}</span></div>
        <div className="kv"><span>Left in sale</span><span>{fmtMusd(left)}</span></div>
        <div className="field">
          <label htmlFor="amt">MUSD to contribute</label>
          <input id="amt" className={`input ${reason ? "bad" : ""}`} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} placeholder="0" />
          <div className="row between">
            <span className={`hint ${reason ? "bad" : ""}`}>{reason ?? "You can claim tokens after the sale finalizes."}</span>
            <button className="btn secondary sm" onClick={() => setText(formatUnits(max, 18))}>Max</button>
          </div>
        </div>
        {tx.notice}
        <button className="btn block" disabled={!amount || !!reason || tx.pending || s?.state !== "live"} onClick={() => tx.run(() => kiln.contribute(saleAddress, amount as bigint))}>
          {tx.pending ? "Confirm in wallet…" : "Contribute"}
        </button>
        <Link href="/positions" className="faint small" style={{ textAlign: "center" }}>View my positions →</Link>
      </div>
    </div>
  );
}

export default function ParticipatePage({ params }: { params: { address: string } }) {
  const [step, setStep] = useState(0);
  const ref = useReveal<HTMLDivElement>(step);
  return (
    <div ref={ref} style={{ maxWidth: 640, margin: "0 auto" }}>
      <div className="page-head">
        <Link href={`/sales/${params.address}`} className="faint small">← Back to sale</Link>
        <h1>Participate</h1>
      </div>
      <ConnectGate what="join a sale">
        <Steps at={step} />
        <div data-reveal style={{ opacity: 0 }}>
          {step === 0 && <BorrowStep onNext={() => setStep(1)} />}
          {step === 1 && <StakeStep onNext={() => setStep(2)} />}
          {step === 2 && <ContributeStep saleAddress={params.address as Address} />}
        </div>
      </ConnectGate>
    </div>
  );
}
