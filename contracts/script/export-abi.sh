#!/usr/bin/env bash
# Writes the ABI of each deployable contract to abi/<Name>.json
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p abi
for name in Sale MezoTierVault TeamBond KilnFactory IAllocationSource; do
  forge inspect "$name" abi --json > "abi/$name.json"
done
echo "wrote $(ls abi | wc -l) ABIs to abi/"
