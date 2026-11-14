// Copies ABIs and the testnet deployment record from ../contracts so the web
// app can be built and deployed from /web alone. Safe to run when the
// deployment file doesn't exist yet.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contracts = join(root, "..", "contracts");

const abiSrc = join(contracts, "abi");
if (existsSync(abiSrc)) {
  mkdirSync(join(root, "lib/abi"), { recursive: true });
  for (const f of readdirSync(abiSrc).filter((n) => n.endsWith(".json"))) {
    copyFileSync(join(abiSrc, f), join(root, "lib/abi", f));
  }
}

const dep = join(contracts, "deployments", "testnet.json");
if (existsSync(dep)) {
  mkdirSync(join(root, "public/deployments"), { recursive: true });
  copyFileSync(dep, join(root, "public/deployments/testnet.json"));
  console.log("synced deployments/testnet.json");
} else {
  console.log("no deployments/testnet.json yet");
}
