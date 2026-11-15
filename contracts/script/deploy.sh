#!/usr/bin/env bash
# Runs the deploy script once, and if the RPC drops a call (Mezo testnet sometimes answers
# "Missing or invalid parameters" or a TLS error) resumes the same broadcast once.
# Needs MEZO_TESTNET_RPC_URL, VAULT_OWNER and the other config from .env.example in the environment,
# and KEY_FILE pointing at a private key file kept outside the repo.
set -uo pipefail
cd "$(dirname "$0")/.."
: "${MEZO_TESTNET_RPC_URL:?set MEZO_TESTNET_RPC_URL}"
: "${VAULT_OWNER:?set VAULT_OWNER}"
: "${KEY_FILE:?set KEY_FILE}"
key="$(cat "$KEY_FILE")"
args=(script/Deploy.s.sol --rpc-url "$MEZO_TESTNET_RPC_URL" --private-key "$key" --broadcast)
if ! forge script "${args[@]}"; then
  echo "first attempt failed, resuming once" >&2
  sleep 3
  forge script "${args[@]}" --resume
fi
