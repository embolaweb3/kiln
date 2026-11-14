// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {MezoTierVault} from "../src/MezoTierVault.sol";
import {KilnFactory} from "../src/KilnFactory.sol";

/// Deploys MezoTierVault and KilnFactory (which deploys TeamBond). All config comes from the
/// environment; the signing key is supplied on the command line (--account / --ledger / --private-key).
///
///   forge script script/Deploy.s.sol --rpc-url $MEZO_TESTNET_RPC_URL --account <keystore> --broadcast
contract Deploy is Script {
    // Mezo testnet, from docs/mezo-integration.md section 4
    address constant MUSD_TESTNET = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address constant MEZO_TESTNET = 0x7B7c000000000000000000000000000000000001;

    function run() external {
        uint256 expectedChain = vm.envOr("EXPECTED_CHAIN_ID", uint256(31611));
        require(block.chainid == expectedChain, "wrong chain");

        address musd = vm.envOr("MUSD_ADDRESS", MUSD_TESTNET);
        address mezo = vm.envOr("MEZO_ADDRESS", MEZO_TESTNET);
        // MEZO is a precompile-backed token that forge's local EVM cannot execute, so its symbol and
        // decimals are checked with cast before deploying, not here.
        require(musd.code.length > 0 && mezo.code.length > 0, "token has no code");
        require(IERC20Metadata(musd).decimals() == 18, "MUSD must have 18 decimals");

        KilnFactory.Bounds memory b = KilnFactory.Bounds({
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
        address vaultOwner = vm.envAddress("VAULT_OWNER");
        uint256 absoluteMaxCap = vm.envUint("ABSOLUTE_MAX_CAP");
        uint256 baseCap = vm.envUint("BASE_CAP");
        uint256 capPerMezo = vm.envUint("CAP_PER_MEZO");
        uint256 maxCap = vm.envUint("MAX_CAP");

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();

        // The vault needs the factory address at construction; the factory is the next contract deployed.
        address predictedFactory = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 1);
        MezoTierVault vault =
            new MezoTierVault(IERC20(mezo), predictedFactory, vaultOwner, absoluteMaxCap, baseCap, capPerMezo, maxCap);
        KilnFactory factory = new KilnFactory(IERC20(musd), IERC20(mezo), vault, b);
        vm.stopBroadcast();

        require(address(factory) == predictedFactory, "factory address mismatch");
        require(vault.factory() == address(factory), "vault factory mismatch");

        // a dry run must not overwrite the record of a real deployment
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            _write(deployer, musd, mezo, vault, factory, b, vaultOwner, absoluteMaxCap);
        }
        console2.log("MezoTierVault", address(vault));
        console2.log("KilnFactory  ", address(factory));
        console2.log("TeamBond     ", address(factory.bond()));
    }

    function _write(
        address deployer,
        address musd,
        address mezo,
        MezoTierVault vault,
        KilnFactory factory,
        KilnFactory.Bounds memory b,
        address vaultOwner,
        uint256 absoluteMaxCap
    ) internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "deployBlock", block.number);
        vm.serializeAddress(k, "deployer", deployer);
        vm.serializeAddress(k, "musd", musd);
        vm.serializeAddress(k, "mezo", mezo);
        vm.serializeAddress(k, "MezoTierVault", address(vault));
        vm.serializeAddress(k, "KilnFactory", address(factory));
        vm.serializeAddress(k, "TeamBond", address(factory.bond()));
        vm.serializeAddress(k, "vaultOwner", vaultOwner);

        string memory bk = "bounds";
        vm.serializeUint(bk, "minBond", b.minBond);
        vm.serializeUint(bk, "minDuration", b.minDuration);
        vm.serializeUint(bk, "maxDuration", b.maxDuration);
        vm.serializeUint(bk, "minTimelock", b.minTimelock);
        vm.serializeUint(bk, "maxTimelock", b.maxTimelock);
        vm.serializeUint(bk, "minSoftCapBps", b.minSoftCapBps);
        vm.serializeUint(bk, "maxFirstTrancheBps", b.maxFirstTrancheBps);
        vm.serializeUint(bk, "minVetoBps", b.minVetoBps);
        string memory boundsJson = vm.serializeUint(bk, "maxVetoBps", b.maxVetoBps);

        string memory vk = "vault";
        vm.serializeUint(vk, "absoluteMaxCap", absoluteMaxCap);
        vm.serializeUint(vk, "baseCap", vault.baseCap());
        vm.serializeUint(vk, "capPerMezo", vault.capPerMezo());
        string memory vaultJson = vm.serializeUint(vk, "maxCap", vault.maxCap());

        vm.serializeString(k, "bounds", boundsJson);
        string memory out = vm.serializeString(k, "vaultParams", vaultJson);
        vm.writeJson(out, vm.envOr("DEPLOYMENT_FILE", string("./deployments/testnet.json")));
    }
}
