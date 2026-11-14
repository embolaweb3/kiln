// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {MezoTierVault} from "../src/MezoTierVault.sol";
import {KilnFactory} from "../src/KilnFactory.sol";
import {DemoToken} from "../src/demo/DemoToken.sol";

/// Deploys MezoTierVault and KilnFactory (which deploys TeamBond), plus two demo sale tokens.
/// All config comes from the environment; the signing key is supplied on the command line
/// (--account / --ledger / --private-key).
///
///   forge script script/Deploy.s.sol --rpc-url $MEZO_TESTNET_RPC_URL --private-key $KEY --broadcast
contract Deploy is Script {
    // Mezo testnet, from docs/mezo-integration.md section 4
    address constant MUSD_TESTNET = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address constant MEZO_TESTNET = 0x7B7c000000000000000000000000000000000001;

    struct Config {
        address musd;
        address mezo;
        address vaultOwner;
        uint256 absoluteMaxCap;
        uint256 baseCap;
        uint256 capPerMezo;
        uint256 maxCap;
        bool demoTokens;
        KilnFactory.Bounds bounds;
    }

    struct Deployed {
        address deployer;
        MezoTierVault vault;
        KilnFactory factory;
        DemoToken ember;
        DemoToken tide;
    }

    function run() external {
        require(block.chainid == vm.envOr("EXPECTED_CHAIN_ID", uint256(31611)), "wrong chain");
        Config memory c = _config();
        // MEZO is a precompile-backed token that forge's local EVM cannot execute, so its symbol and
        // decimals are checked with cast before deploying, not here.
        require(c.musd.code.length > 0 && c.mezo.code.length > 0, "token has no code");
        require(IERC20Metadata(c.musd).decimals() == 18, "MUSD must have 18 decimals");

        Deployed memory d = _deploy(c);

        // a dry run must not overwrite the record of a real deployment
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) _write(c, d);

        console2.log("MezoTierVault", address(d.vault));
        console2.log("KilnFactory  ", address(d.factory));
        console2.log("TeamBond     ", address(d.factory.bond()));
        console2.log("EMBR         ", address(d.ember));
        console2.log("TIDE         ", address(d.tide));
    }

    function _config() internal view returns (Config memory c) {
        c.musd = vm.envOr("MUSD_ADDRESS", MUSD_TESTNET);
        c.mezo = vm.envOr("MEZO_ADDRESS", MEZO_TESTNET);
        c.vaultOwner = vm.envAddress("VAULT_OWNER");
        require(c.vaultOwner != address(0), "VAULT_OWNER not set");
        c.absoluteMaxCap = vm.envUint("ABSOLUTE_MAX_CAP");
        c.baseCap = vm.envUint("BASE_CAP");
        c.capPerMezo = vm.envUint("CAP_PER_MEZO");
        c.maxCap = vm.envUint("MAX_CAP");
        c.demoTokens = vm.envOr("DEPLOY_DEMO_TOKENS", true);
        c.bounds = KilnFactory.Bounds({
            minBond: vm.envUint("MIN_BOND"),
            minDuration: vm.envUint("MIN_DURATION"),
            maxDuration: vm.envUint("MAX_DURATION"),
            minTimelock: vm.envUint("MIN_TIMELOCK"),
            maxTimelock: vm.envUint("MAX_TIMELOCK"),
            minSoftCapBps: vm.envUint("MIN_SOFTCAP_BPS"),
            maxFirstTrancheBps: vm.envUint("MAX_FIRST_TRANCHE_BPS"),
            minVetoBps: vm.envUint("MIN_VETO_BPS"),
            maxVetoBps: vm.envUint("MAX_VETO_BPS")
        });
    }

    function _deploy(Config memory c) internal returns (Deployed memory d) {
        vm.startBroadcast();
        (, d.deployer,) = vm.readCallers();

        // The vault needs the factory address at construction; the factory is the next contract deployed.
        address predicted = vm.computeCreateAddress(d.deployer, vm.getNonce(d.deployer) + 1);
        d.vault = new MezoTierVault(
            IERC20(c.mezo), predicted, c.vaultOwner, c.absoluteMaxCap, c.baseCap, c.capPerMezo, c.maxCap
        );
        d.factory = new KilnFactory(IERC20(c.musd), IERC20(c.mezo), d.vault, c.bounds);
        require(address(d.factory) == predicted, "factory address mismatch");
        require(d.vault.factory() == address(d.factory), "vault factory mismatch");

        // Demo sale tokens, minted to the deployer so a team has something to escrow.
        if (c.demoTokens) {
            d.ember = new DemoToken("Ember Labs", "EMBR", d.deployer, 10_000_000e18);
            d.tide = new DemoToken("Tidewater Finance", "TIDE", d.deployer, 10_000_000e18);
        }
        vm.stopBroadcast();
    }

    function _write(Config memory c, Deployed memory d) internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "deployBlock", block.number);
        vm.serializeAddress(k, "deployer", d.deployer);
        vm.serializeAddress(k, "musd", c.musd);
        vm.serializeAddress(k, "mezo", c.mezo);
        vm.serializeAddress(k, "MezoTierVault", address(d.vault));
        vm.serializeAddress(k, "KilnFactory", address(d.factory));
        vm.serializeAddress(k, "TeamBond", address(d.factory.bond()));
        vm.serializeAddress(k, "vaultOwner", c.vaultOwner);
        vm.serializeString(k, "bounds", _boundsJson(c.bounds));
        vm.serializeString(k, "vaultParams", _vaultJson(c));
        string memory out = vm.serializeString(k, "demoTokens", _demoJson(d));
        vm.writeJson(out, vm.envOr("DEPLOYMENT_FILE", string("./deployments/testnet.json")));
    }

    function _boundsJson(KilnFactory.Bounds memory b) internal returns (string memory) {
        string memory k = "bounds";
        vm.serializeUint(k, "minBond", b.minBond);
        vm.serializeUint(k, "minDuration", b.minDuration);
        vm.serializeUint(k, "maxDuration", b.maxDuration);
        vm.serializeUint(k, "minTimelock", b.minTimelock);
        vm.serializeUint(k, "maxTimelock", b.maxTimelock);
        vm.serializeUint(k, "minSoftCapBps", b.minSoftCapBps);
        vm.serializeUint(k, "maxFirstTrancheBps", b.maxFirstTrancheBps);
        vm.serializeUint(k, "minVetoBps", b.minVetoBps);
        return vm.serializeUint(k, "maxVetoBps", b.maxVetoBps);
    }

    function _vaultJson(Config memory c) internal returns (string memory) {
        string memory k = "vaultParams";
        vm.serializeUint(k, "absoluteMaxCap", c.absoluteMaxCap);
        vm.serializeUint(k, "baseCap", c.baseCap);
        vm.serializeUint(k, "capPerMezo", c.capPerMezo);
        return vm.serializeUint(k, "maxCap", c.maxCap);
    }

    function _demoJson(Deployed memory d) internal returns (string memory) {
        string memory k = "demoTokens";
        vm.serializeAddress(k, "EMBR", address(d.ember));
        return vm.serializeAddress(k, "TIDE", address(d.tide));
    }
}
