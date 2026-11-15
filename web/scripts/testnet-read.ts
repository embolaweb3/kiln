/** Read-only smoke test of the chain client against the real Mezo testnet. */
import { readFileSync } from "node:fs";
import { createChainClient } from "../lib/kiln-chain";
import { setDeploymentForTests, type Deployment } from "../lib/deployments";

setDeploymentForTests(JSON.parse(readFileSync("public/deployments/testnet.json", "utf8")) as Deployment);
const client = createChainClient({ getWallet: () => undefined });
const who = (process.argv[2] ?? "0x3423Fe49b312706705Aaf4156Ad12027e84B9Cf5") as `0x${string}`;

async function main() {
  const sales = await client.listSales();
  console.log("listSales:", sales.length);
  for (const s of sales) console.log(" ", s.address, s.name, s.state, Number(s.raised) / 1e18);
  if (sales[0]) {
    const one = await client.getSale(sales[0].address);
    console.log("getSale:", one?.name, one?.bond);
  }
  console.log("getMyTier:", await client.getMyTier(who));
  console.log("getMyContributions:", (await client.getMyContributions(who)).length);
  console.log("getBorrowPosition:", await client.getBorrowPosition(who));
}
main().catch((e) => {
  console.error("FAILED:", e?.shortMessage ?? e);
  process.exit(1);
});
