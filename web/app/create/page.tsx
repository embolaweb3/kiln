"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isAddress, type Address } from "viem";
import { ConnectGate } from "@/components/connect-gate";
import { useKiln } from "@/components/kiln-context";
import { useTx } from "@/components/tx-button";
import { Banner, useReveal } from "@/components/ui";
import { fmtAmount, parseAmount } from "@/lib/format";
import { readTokenMeta } from "@/lib/sale-meta";

function toUnix(local: string): number {
  return local ? Math.floor(new Date(local).getTime() / 1000) : 0;
}

function localInput(offsetHours: number) {
  const d = new Date(Date.now() + offsetHours * 3600_000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function CreateSalePage() {
  const kiln = useKiln();
  const router = useRouter();
  const ref = useReveal<HTMLDivElement>();
  const [f, setF] = useState({
    name: "",
    symbol: "",
    token: "",
    price: "",
    soft: "",
    hard: "",
    start: localInput(24),
    end: localInput(24 * 8),
    tranche: "30",
    timelock: "3",
    veto: "30",
    bond: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const [tokenFound, setTokenFound] = useState<string | null>(null);

  // pull name and symbol from the token itself so teams don't retype them
  useEffect(() => {
    setTokenFound(null);
    if (!isAddress(f.token)) return;
    let live = true;
    readTokenMeta(f.token).then((m) => {
      if (!live || (!m.name && !m.symbol)) return;
      setTokenFound(`${m.name ?? ""} ${m.symbol ? `(${m.symbol})` : ""}`.trim());
      setF((cur) => ({ ...cur, name: cur.name || m.name || "", symbol: cur.symbol || m.symbol || "" }));
    });
    return () => {
      live = false;
    };
  }, [f.token]);

  const tx = useTx(() => setTimeout(() => router.push("/"), 1200));

  const price = parseAmount(f.price);
  const soft = parseAmount(f.soft);
  const hard = parseAmount(f.hard);
  const bond = parseAmount(f.bond);
  const start = toUnix(f.start);
  const end = toUnix(f.end);
  const tranche = Number(f.tranche);
  const timelockDays = Number(f.timelock);
  const veto = Number(f.veto);

  const errors: Partial<Record<keyof typeof f, string>> = {};
  if (f.name && f.name.length < 2) errors.name = "Too short";
  if (f.token && !isAddress(f.token)) errors.token = "Not a valid address";
  if (soft && hard && soft > hard) errors.soft = "Soft cap cannot exceed the hard cap";
  if (f.start && start < Math.floor(Date.now() / 1000) - 60) errors.start = "Start is in the past";
  if (start && end && end <= start) errors.end = "Must end after it starts";
  if (f.tranche && (tranche < 0 || tranche > 100)) errors.tranche = "0 to 100";
  if (f.timelock && timelockDays < 1) errors.timelock = "At least 1 day";
  if (f.veto && (veto <= 0 || veto > 100)) errors.veto = "1 to 100";

  const complete =
    f.name.length >= 2 && f.symbol && isAddress(f.token) && price && soft && hard && bond && f.start && f.end &&
    f.tranche !== "" && f.timelock !== "" && f.veto !== "";
  const ok = !!complete && Object.keys(errors).length === 0;

  const field = (k: keyof typeof f, label: string, opts: { placeholder?: string; type?: string; hint?: string } = {}) => (
    <div className="field">
      <label htmlFor={k}>{label}</label>
      <input id={k} className={`input ${errors[k] ? "bad" : ""}`} type={opts.type ?? "text"} inputMode={opts.type ? undefined : "decimal"} placeholder={opts.placeholder} value={f[k]} onChange={set(k)} />
      <span className={`hint ${errors[k] ? "bad" : ""}`}>{errors[k] ?? opts.hint ?? " "}</span>
    </div>
  );

  return (
    <div ref={ref} style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="page-head" data-reveal style={{ opacity: 0 }}>
        <Link href="/" className="faint small">← All sales</Link>
        <h1>Create a sale</h1>
        <p className="muted">Escrow a MEZO bond and set your caps. The bond comes back after the release timelock, unless contributors veto.</p>
      </div>
      <ConnectGate what="create a sale">
        <div className="stack">
          <div className="glass stack" data-reveal style={{ opacity: 0 }}>
            <h2>Project</h2>
            <div className="grid cols-2">
              {field("name", "Name", { placeholder: "Aurora Labs" })}
              {field("symbol", "Token symbol", { placeholder: "AUR" })}
            </div>
            {field("token", "Sale token address", { placeholder: "0x…", hint: tokenFound ? `Found on Mezo: ${tokenFound}` : "ERC-20 you have already deployed. Fee-on-transfer tokens are rejected." })}
          </div>

          <div className="glass stack" data-reveal style={{ opacity: 0 }}>
            <h2>Raise</h2>
            <div className="grid cols-3">
              {field("price", "Price (MUSD per token)", { placeholder: "0.25" })}
              {field("soft", "Soft cap (MUSD)", { placeholder: "30000" })}
              {field("hard", "Hard cap (MUSD)", { placeholder: "120000" })}
            </div>
            <div className="grid cols-2">
              {field("start", "Starts", { type: "datetime-local" })}
              {field("end", "Ends", { type: "datetime-local" })}
            </div>
          </div>

          <div className="glass stack" data-reveal style={{ opacity: 0 }}>
            <h2>Release and veto</h2>
            <div className="grid cols-3">
              {field("tranche", "First tranche %", { hint: "Paid out at finalize" })}
              {field("timelock", "Timelock (days)", { hint: "Contributors can veto" })}
              {field("veto", "Veto threshold %", { hint: "Share of the raise" })}
            </div>
          </div>

          <div className="glass stack" data-reveal style={{ opacity: 0 }}>
            <h2>Quality bond</h2>
            {field("bond", "MEZO to escrow", { placeholder: "5000", hint: "Held by the bond contract. Slashed to contributors if the release is vetoed." })}
            {bond && <Banner kind="info"><span>You will send <b>{fmtAmount(bond, 0)} MEZO</b> with this transaction. It is locked until the timelock ends.</span></Banner>}
            {tx.notice}
            <button
              className="btn block"
              disabled={!ok || tx.pending}
              onClick={() =>
                tx.run(() =>
                  kiln.createSale({
                    name: f.name,
                    symbol: f.symbol.toUpperCase(),
                    saleToken: f.token as Address,
                    price: price as bigint,
                    softCap: soft as bigint,
                    hardCap: hard as bigint,
                    start,
                    end,
                    firstTrancheBps: Math.round(tranche * 100),
                    timelock: Math.round(timelockDays * 86400),
                    vetoBps: Math.round(veto * 100),
                    bondAmount: bond as bigint,
                  }),
                )
              }
            >
              {tx.pending ? "Confirm in wallet…" : "Escrow bond and create sale"}
            </button>
          </div>
        </div>
      </ConnectGate>
    </div>
  );
}
