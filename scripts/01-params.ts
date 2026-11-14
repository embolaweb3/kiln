import { erc20Abi, formatUnits, parseAbi } from "viem";
import { publicClient as c } from "./lib/chain";

const BO = "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5" as const;
const IRM = "0xD4D6c36A592A2c5e86035A6bca1d57747a567f37" as const;
const PRICE = "0x86bCF0841622a5dAC14A313a15f96A95421b9366" as const;
const TM = "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0" as const;
const MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" as const;
const MEZO = "0x7B7c000000000000000000000000000000000001" as const;

const bo = parseAbi([
  "function minNetDebt() view returns (uint256)",
  "function borrowingRate() view returns (uint256)",
  "function getBorrowingFee(uint256) view returns (uint256)",
  "function musd() view returns (address)",
  "function troveManager() view returns (address)",
  "function priceFeed() view returns (address)",
]);
const read = <T,>(p: Promise<T>) => p.catch((e) => `ERR ${String(e.shortMessage ?? e).slice(0, 80)}`);

console.log("block", await c.getBlockNumber());
console.log("minNetDebt", formatUnits((await c.readContract({ address: BO, abi: bo, functionName: "minNetDebt" })) as bigint, 18));
console.log("borrowingRate", await c.readContract({ address: BO, abi: bo, functionName: "borrowingRate" }));
console.log("fee(1800)", formatUnits((await c.readContract({ address: BO, abi: bo, functionName: "getBorrowingFee", args: [1800n * 10n ** 18n] })) as bigint, 18));
console.log("musd()", await c.readContract({ address: BO, abi: bo, functionName: "musd" }));
console.log("troveManager()", await c.readContract({ address: BO, abi: bo, functionName: "troveManager" }));
console.log("priceFeed()", await c.readContract({ address: BO, abi: bo, functionName: "priceFeed" }));
console.log("price", formatUnits(await c.readContract({ address: PRICE, abi: parseAbi(["function fetchPrice() view returns (uint256)"]), functionName: "fetchPrice" }), 18));
console.log("interestRate", await c.readContract({ address: IRM, abi: parseAbi(["function interestRate() view returns (uint16)"]), functionName: "interestRate" }));
const tmAbi = parseAbi(["function getTCR(uint256) view returns (uint256)"]);
const price = await c.readContract({ address: PRICE, abi: parseAbi(["function fetchPrice() view returns (uint256)"]), functionName: "fetchPrice" });
console.log("TCR", formatUnits(await c.readContract({ address: TM, abi: tmAbi, functionName: "getTCR", args: [price] }), 18));

for (const [name, addr] of [["MUSD", MUSD], ["MEZO", MEZO]] as const) {
  console.log(`--- ${name} ${addr}`);
  const code = await c.getCode({ address: addr });
  console.log("code bytes", code ? (code.length - 2) / 2 : 0);
  for (const fn of ["name", "symbol", "decimals", "totalSupply"] as const) {
    console.log(fn, await read(c.readContract({ address: addr, abi: erc20Abi, functionName: fn })));
  }
}
console.log("MEZO bal of test wallet", await read(c.readContract({ address: MEZO, abi: erc20Abi, functionName: "balanceOf", args: ["0x135198b57a68A0614546572Db7c40F3Fa6Aace6E"] })));
