// Creates a throwaway testnet key outside the repo and prints only the address.
import { existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const file = process.env.KILN_KEY_FILE ?? join(homedir(), ".config", "kiln-verify", "deployer.key");
if (existsSync(file)) {
  console.log("key file already exists:", file);
} else {
  writeFileSync(file, generatePrivateKey(), { mode: 0o600 });
  console.log("created", file);
}
import { readFileSync } from "node:fs";
console.log("address:", privateKeyToAccount(readFileSync(file, "utf8").trim() as `0x${string}`).address);
