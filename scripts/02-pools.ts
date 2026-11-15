import { erc20Abi, parseAbi } from "viem";
import { publicClient as c } from "./lib/chain";
const F = "0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A" as const;
const f = parseAbi(["function allPoolsLength() view returns (uint256)","function allPools(uint256) view returns (address)"]);
const p = parseAbi(["function token0() view returns (address)","function token1() view returns (address)","function stable() view returns (bool)","function getReserves() view returns (uint256,uint256,uint256)"]);
const n = await c.readContract({address:F,abi:f,functionName:"allPoolsLength"});
console.log("pools", n);
const sym = async (a:`0x${string}`) => c.readContract({address:a,abi:erc20Abi,functionName:"symbol"}).catch(()=>"?");
for (let i=0n;i<n;i++){
  const pool = await c.readContract({address:F,abi:f,functionName:"allPools",args:[i]});
  const [t0,t1,st,r] = await Promise.all([c.readContract({address:pool,abi:p,functionName:"token0"}),c.readContract({address:pool,abi:p,functionName:"token1"}),c.readContract({address:pool,abi:p,functionName:"stable"}),c.readContract({address:pool,abi:p,functionName:"getReserves"})]);
  console.log(i, pool, await sym(t0), t0, "/", await sym(t1), t1, st?"stable":"volatile", r[0], r[1]);
}
