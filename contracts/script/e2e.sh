#!/usr/bin/env bash
# Runs two sales on Mezo testnet in parallel and logs every transaction to docs/testnet-proof.md:
#   sale A (EMBR): meets its soft cap -> finalize, claim, release after the timelock
#   sale B (TIDE): misses its soft cap -> refund, team reclaims tokens and bond
# Keys are read from files outside the repo. Needs deployments/testnet.json from a real deploy.
set -uo pipefail
cd "$(dirname "$0")/.."

RPC="${MEZO_TESTNET_RPC_URL:-https://rpc.test.mezo.org}"
EXPLORER="https://explorer.test.mezo.org"
DEPLOYER_KEY_FILE="${KEY_FILE:-$HOME/.kiln/deployer.key}"
CONTRIB_KEY_FILE="$HOME/.kiln/contributor.key"
DOC="../docs/testnet-proof.md"
DEP="deployments/testnet.json"
E18=1000000000000000000

jget() { python3 -c "import json,sys;d=json.load(open('$DEP'));print(eval('d'+sys.argv[1]))" "$1"; }
FACTORY=$(jget "['KilnFactory']"); VAULT=$(jget "['MezoTierVault']"); BOND=$(jget "['TeamBond']")
MUSD=$(jget "['musd']"); MEZO=$(jget "['mezo']")
EMBR=$(jget "['demoTokens']['EMBR']"); TIDE=$(jget "['demoTokens']['TIDE']")

# contributor wallet, created once and kept outside the repo
if [ ! -s "$CONTRIB_KEY_FILE" ]; then
  (umask 077; cast wallet new --json | python3 -c "import json,sys;d=json.load(sys.stdin)['data'];d=d[0] if isinstance(d,list) else d;print(d['private_key'],end='')" > "$CONTRIB_KEY_FILE")
  chmod 600 "$CONTRIB_KEY_FILE"
fi
DK=$(cat "$DEPLOYER_KEY_FILE"); CK=$(cat "$CONTRIB_KEY_FILE")
TEAM=$(cast wallet address --private-key "$DK"); CONTRIB=$(cast wallet address --private-key "$CK")

# the RPC sometimes drops a call, so every command gets one retry
rpc_retry() {
  "$@" 2>&1 && return 0
  sleep 3
  "$@" 2>&1
}

call() { rpc_retry cast call --rpc-url "$RPC" "$@"; }
now() { cast block latest --rpc-url "$RPC" --field timestamp; }
wait_chain() { while [ "$(now)" -lt "$1" ]; do sleep 5; done; }
fmt() { python3 -c "import sys;print(f'{int(sys.argv[1].split()[0])/1e18:g}')" "$1"; }
bal() { fmt "$(call "$1" 'balanceOf(address)(uint256)' "$2")"; }

fail_row() { echo "| $1 | $2 | FAILED | ${3//$'\n'/ } |" >> "$DOC"; echo "FAILED: $1: $3" >&2; exit 1; }

# send <key> <step> <actor> <note> <to> <sig> [args...]  -> sets LAST_TX and LAST_RECEIPT
send() {
  local key="$1" step="$2" actor="$3" note="$4" to="$5" sig="$6"; shift 6
  local out hash status
  out=$(rpc_retry cast send --json --private-key "$key" --rpc-url "$RPC" "$to" "$sig" "$@") || fail_row "$step" "$actor" "$out"
  LAST_RECEIPT="$out"
  hash=$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['transactionHash'])" "$out")
  status=$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['status'])" "$out")
  LAST_TX="$hash"
  if [ "$status" != "0x1" ] && [ "$status" != "1" ]; then
    echo "| $step | $actor | [reverted]($EXPLORER/tx/$hash) | $note |" >> "$DOC"; echo "REVERTED: $step $hash" >&2; exit 1
  fi
  echo "| $step | $actor | [\`${hash:0:10}…\`]($EXPLORER/tx/$hash) | $note |" >> "$DOC"
  echo "ok: $step $hash"
}

send_btc() {
  local step="$1" note="$2" to="$3" amount="$4" out hash
  out=$(rpc_retry cast send --json --private-key "$DK" --rpc-url "$RPC" --value "$amount" "$to") || fail_row "$step" team "$out"
  hash=$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['transactionHash'])" "$out")
  echo "| $step | team | [\`${hash:0:10}…\`]($EXPLORER/tx/$hash) | $note |" >> "$DOC"
  echo "ok: $step $hash"
}

# expect_revert <label> <error signature> <from> <to> <function sig> [args]
# A failed check is recorded and the run carries on, so a surprise cannot strand funds in a half-run sale.
CHECK_FAILS=0
expect_revert() {
  local label="$1" errsig="$2" from="$3" to="$4" sig="$5"; shift 5
  local out sel
  sel=$(cast sig "$errsig")
  if out=$(cast call --from "$from" --rpc-url "$RPC" "$to" "$sig" "$@" 2>&1); then
    echo "- FAIL: $label did not revert" >> "$DOC"; echo "check failed, call succeeded: $label" >&2; CHECK_FAILS=$((CHECK_FAILS + 1)); return 0
  fi
  if echo "$out" | grep -qi "${sel#0x}"; then
    echo "- $label: reverts with \`$errsig\`, as expected" >> "$DOC"; echo "ok: $label"
  else
    echo "- FAIL: $label reverted with an unexpected reason: ${out//$'\n'/ }" >> "$DOC"; echo "check failed, unexpected revert: $out" >&2; CHECK_FAILS=$((CHECK_FAILS + 1))
  fi
}

mkdir -p "$(dirname "$DOC")"
{
  echo "# Testnet proof"
  echo
  echo "Mezo testnet (chain 31611). Every row is a transaction; click through to the explorer."
  echo "Run: $(date -u +%Y-%m-%dT%H:%MZ). Two sales ran in parallel from one factory: sale A (EMBR) meets its soft cap and releases, sale B (TIDE) misses it and refunds."
  echo
  echo "| Contract | Address |"
  echo "|---|---|"
  echo "| KilnFactory | [$FACTORY]($EXPLORER/address/$FACTORY) |"
  echo "| MezoTierVault | [$VAULT]($EXPLORER/address/$VAULT) |"
  echo "| TeamBond | [$BOND]($EXPLORER/address/$BOND) |"
  echo "| EMBR (demo token) | [$EMBR]($EXPLORER/address/$EMBR) |"
  echo "| TIDE (demo token) | [$TIDE]($EXPLORER/address/$TIDE) |"
  echo
  echo "Team and deployer: \`$TEAM\`. Contributor: \`$CONTRIB\`."
  echo
  echo "## 1. Setup"
  echo
  echo "| Step | Actor | Tx | Note |"
  echo "|---|---|---|---|"
} > "$DOC"

TEAM_MUSD0=$(bal "$MUSD" "$TEAM"); TEAM_MEZO0=$(bal "$MEZO" "$TEAM")
echo "team before: MEZO=$TEAM_MEZO0 MUSD=$TEAM_MUSD0 EMBR=$(bal "$EMBR" "$TEAM") TIDE=$(bal "$TIDE" "$TEAM") BTC=$(cast balance "$TEAM" --rpc-url "$RPC" --ether)"

send_btc "fund gas" "0.003 BTC for the contributor's gas" "$CONTRIB" 0.003ether
send "$DK" "fund MUSD" team "200 MUSD to the contributor" "$MUSD" "transfer(address,uint256)" "$CONTRIB" $((200 * E18))
send "$DK" "fund MEZO" team "2 MEZO to the contributor, to stake" "$MEZO" "transfer(address,uint256)" "$CONTRIB" $((2 * E18))
send "$DK" "approve EMBR" team "factory may pull the 400 EMBR for sale A" "$EMBR" "approve(address,uint256)" "$FACTORY" $((400 * E18))
send "$DK" "approve TIDE" team "factory may pull the 400 TIDE for sale B" "$TIDE" "approve(address,uint256)" "$FACTORY" $((400 * E18))
send "$DK" "approve MEZO bond" team "factory may pull two 1 MEZO bonds" "$MEZO" "approve(address,uint256)" "$FACTORY" $((2 * E18))

# both sales share one window so the waits overlap
START=$(( $(now) + 150 )); END=$(( START + 600 ))
SOFT=$((100 * E18)); HARD=$((400 * E18)); PRICE=$E18
cfg() { echo "($1,$PRICE,$SOFT,$HARD,$START,$END,2500,300,2000,$E18)"; }
CREATE_SIG="createSale((address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256))"
SALE_TOPIC=$(cast keccak "SaleCreated(address,address,address,uint256,uint256,uint256,uint256,uint256,uint256)")
sale_from_receipt() {
  python3 -c "
import json,sys
r=json.loads(sys.argv[1]); t=sys.argv[2].lower()
for l in r['logs']:
    if l['topics'][0].lower()==t:
        print('0x'+l['topics'][1][-40:]); break" "$LAST_RECEIPT" "$SALE_TOPIC"
}

send "$DK" "create sale A" team "EMBR at 1 MUSD, soft cap 100, hard cap 400, first tranche 25%, timelock 5 min, veto 20%, bond 1 MEZO" "$FACTORY" "$CREATE_SIG" "$(cfg "$EMBR")"
SALE_A=$(cast to-check-sum-address "$(sale_from_receipt)")
send "$DK" "create sale B" team "TIDE on the same terms; will miss its soft cap" "$FACTORY" "$CREATE_SIG" "$(cfg "$TIDE")"
SALE_B=$(cast to-check-sum-address "$(sale_from_receipt)")
echo "sale A $SALE_A, sale B $SALE_B, window $START to $END"

{
  echo
  echo "Sale A: [\`$SALE_A\`]($EXPLORER/address/$SALE_A) (EMBR). Sale B: [\`$SALE_B\`]($EXPLORER/address/$SALE_B) (TIDE). Window: chain time $START to $END."
  echo
  echo "Checks after creation:"
  echo
  echo "- vault registered both sales: A=$(call "$VAULT" "isSale(address)(bool)" "$SALE_A"), B=$(call "$VAULT" "isSale(address)(bool)" "$SALE_B")"
  echo "- bonds held: $(bal "$MEZO" "$BOND") MEZO in TeamBond"
  echo "- sale tokens escrowed: $(bal "$EMBR" "$SALE_A") EMBR in sale A, $(bal "$TIDE" "$SALE_B") TIDE in sale B"
  echo
  echo "## 2. Stake and contribute (contributor)"
  echo
  echo "| Step | Actor | Tx | Note |"
  echo "|---|---|---|---|"
} >> "$DOC"

CAP0=$(fmt "$(call "$VAULT" 'maxContribution(address)(uint256)' "$CONTRIB")")
send "$CK" "approve MEZO" contributor "vault may pull 2 MEZO" "$MEZO" "approve(address,uint256)" "$VAULT" $((2 * E18))
send "$CK" "stake MEZO" contributor "stake 2 MEZO" "$VAULT" "stake(uint256)" $((2 * E18))
CAP1=$(fmt "$(call "$VAULT" 'maxContribution(address)(uint256)' "$CONTRIB")")
send "$CK" "approve MUSD A" contributor "sale A may pull 150 MUSD" "$MUSD" "approve(address,uint256)" "$SALE_A" $((150 * E18))
send "$CK" "approve MUSD B" contributor "sale B may pull 30 MUSD" "$MUSD" "approve(address,uint256)" "$SALE_B" $((30 * E18))

echo "waiting for the sales to open"; wait_chain "$START"
send "$CK" "contribute A" contributor "150 MUSD, above the 100 soft cap" "$SALE_A" "contribute(uint256)" $((150 * E18))
send "$CK" "contribute B" contributor "30 MUSD, below the 100 soft cap" "$SALE_B" "contribute(uint256)" $((30 * E18))

{
  echo
  echo "Checks after contributing:"
  echo
  echo "- per-wallet cap: $CAP0 MUSD before staking, $CAP1 MUSD after staking 2 MEZO"
  echo "- sale A raised $(fmt "$(call "$SALE_A" 'totalRaised()(uint256)')") MUSD, sale B raised $(fmt "$(call "$SALE_B" 'totalRaised()(uint256)')") MUSD"
  echo "- vault lock count for the contributor: $(call "$VAULT" 'lockCount(address)(uint256)' "$CONTRIB")"
} >> "$DOC"
expect_revert "unstake while contributions are live" "StakeLocked()" "$CONTRIB" "$VAULT" "unstake(uint256)" $((1 * E18))
expect_revert "finalize sale B early" "SoftCapNotMet()" "$TEAM" "$SALE_B" "finalize()"

{
  echo
  echo "## 3. After the window (both sales settle together)"
  echo
  echo "| Step | Actor | Tx | Note |"
  echo "|---|---|---|---|"
} >> "$DOC"
echo "waiting for the window to close"; wait_chain "$END"

send "$DK" "finalize A" team "soft cap met: first tranche (25% of 150 = 37.5 MUSD) to the team, unsold EMBR returned" "$SALE_A" "finalize()"
FINALIZED_AT=$(call "$SALE_A" "finalizedAt()(uint256)" | awk '{print $1}')
send "$CK" "claim A" contributor "claim 150 EMBR" "$SALE_A" "claim()"
send "$CK" "refund B" contributor "soft cap missed: pull the 30 MUSD back" "$SALE_B" "refund()"
send "$DK" "reclaim B" team "sale B: the 400 TIDE and the bond go back to the team" "$SALE_B" "reclaimOnFailure()"
send "$DK" "unlock A" team "vault frees the contributor's lock for sale A" "$VAULT" "unlock(address,address)" "$SALE_A" "$CONTRIB"
send "$DK" "unlock B" team "vault frees the contributor's lock for sale B" "$VAULT" "unlock(address,address)" "$SALE_B" "$CONTRIB"
send "$CK" "unstake" contributor "no locks left: withdraw the 2 MEZO" "$VAULT" "unstake(uint256)" $((2 * E18))

{
  echo
  echo "Checks after settling:"
  echo
  echo "- contributor holds $(bal "$EMBR" "$CONTRIB") EMBR and $(bal "$MUSD" "$CONTRIB") MUSD (200 funded, 150 spent on A, 30 refunded from B)"
  echo "- sale B: contributor refund flag = $(call "$SALE_B" 'refunded(address)(bool)' "$CONTRIB"), MUSD left in sale B = $(bal "$MUSD" "$SALE_B")"
  echo "- sale A holds $(bal "$MUSD" "$SALE_A") MUSD (the remainder held for the timelock)"
  echo "- contributor stake after unstake: $(fmt "$(call "$VAULT" 'staked(address)(uint256)' "$CONTRIB")") MEZO"
} >> "$DOC"
expect_revert "release before the timelock ends" "TimelockActive()" "$TEAM" "$SALE_A" "releaseRemainder()"

echo "waiting for the 5 minute timelock (finalized at $FINALIZED_AT)"; wait_chain $(( FINALIZED_AT + 300 ))
{
  echo
  echo "## 4. Release"
  echo
  echo "| Step | Actor | Tx | Note |"
  echo "|---|---|---|---|"
} >> "$DOC"
send "$DK" "release A" team "no veto: remaining 112.5 MUSD to the team and the 1 MEZO bond returned" "$SALE_A" "releaseRemainder()"

TEAM_MUSD1=$(bal "$MUSD" "$TEAM"); TEAM_MEZO1=$(bal "$MEZO" "$TEAM")
{
  echo
  echo "Final state:"
  echo
  echo "- sale A: state $(call "$SALE_A" 'state()(uint8)') (6 = Completed); released to the team $(fmt "$(call "$SALE_A" 'totalReleased()(uint256)')") of $(fmt "$(call "$SALE_A" 'totalRaised()(uint256)')") MUSD raised; MUSD left in the sale: $(bal "$MUSD" "$SALE_A")"
  echo "- sale B: state $(call "$SALE_B" 'state()(uint8)') (2 = Failed); MUSD left in the sale: $(bal "$MUSD" "$SALE_B")"
  echo "- team MUSD: $TEAM_MUSD0 before, $TEAM_MUSD1 after (200 sent to the contributor, so the net gain is $(python3 -c "print($TEAM_MUSD1 - $TEAM_MUSD0 + 200)") = the 150 raised in sale A)"
  echo "- team MEZO: $TEAM_MEZO0 before, $TEAM_MEZO1 after (2 sent to the contributor, bonds posted and returned)"
  echo "- TeamBond MEZO balance: $(bal "$MEZO" "$BOND")"
} >> "$DOC"
echo "DONE, failed checks: $CHECK_FAILS"
[ "$CHECK_FAILS" -eq 0 ]
