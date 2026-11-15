"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSwitchChain } from "wagmi";
import { MEZO_CHAIN_ID } from "@/lib/mezo";
import { USE_FIXTURES } from "@/lib/kiln-client";
import { Banner } from "./ui";

const LINKS = [
  { href: "/", label: "Sales" },
  { href: "/create", label: "Create" },
  { href: "/positions", label: "My positions" },
];

function NetworkGuard() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();
  if (!isConnected || chainId === MEZO_CHAIN_ID) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <Banner kind="warn">
        <div className="row between wrap" style={{ width: "100%" }}>
          <span><b>Wrong network.</b> Kiln runs on Mezo Testnet (chain {MEZO_CHAIN_ID}).</span>
          <button className="btn sm" disabled={isPending} onClick={() => switchChain({ chainId: MEZO_CHAIN_ID })}>
            {isPending ? "Switching…" : "Switch network"}
          </button>
        </div>
      </Banner>
      {error && <p className="hint bad" style={{ marginTop: 6 }}>Could not switch: {error.message}</p>}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <>
      <div className="nav-wrap">
        <nav className="nav">
          <Link href="/" className="brand"><span className="brand-dot" />Kiln</Link>
          <div className="nav-links">
            {LINKS.map((l) => {
              const active = l.href === "/" ? path === "/" || path.startsWith("/sales") : path.startsWith(l.href);
              return (
                <Link key={l.href} href={l.href} className={`nav-link ${active ? "active" : ""}`}>
                  {l.label}
                </Link>
              );
            })}
          </div>
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </nav>
      </div>
      <main className="container">
        {USE_FIXTURES && (
          <p className="faint small" style={{ marginBottom: 16, textAlign: "center" }}>
            Fixture data. Borrowing and position reads hit Mezo testnet.
          </p>
        )}
        <NetworkGuard />
        {children}
      </main>
    </>
  );
}
