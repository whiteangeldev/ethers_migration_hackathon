/**
 * Safe rewrites + allowlist misses + dynamic access + BigNumber usage.
 */
import { ethers, BigNumber } from "ethers";

const someKey = "parseUnits" as const;
const providerName = "JsonRpcProvider" as const;

export function demo(addr: string) {
  const ok1 = ethers.utils.parseEther("1");
  const ok2 = ethers.utils.isAddress(addr);
  const ok3 = ethers.providers.JsonRpcProvider;
  const badUtils = ethers.utils.customThing("x");
  const dynU = ethers.utils[someKey]("1", 18);
  const dynP = ethers.providers[providerName];
  const bn = BigNumber.from("1");
  return { ok1, ok2, ok3, badUtils, dynU, dynP, bn };
}
