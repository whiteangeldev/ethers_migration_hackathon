/**
 * Branches + mapped-style helpers mixing safe and unsafe utils + BigNumber.
 */
import { ethers, BigNumber } from "ethers";

export function branchy(flag: boolean, data: Uint8Array): string {
  const pad = flag ? ethers.utils.toUtf8Bytes("a") : ethers.utils.toUtf8Bytes("b");
  const risky = ethers.utils.defaultAbiCoder; // not allowlisted
  const n = BigNumber.from(1);
  return `${ethers.utils.hexlify(data)}${risky}${n.toString()}${pad.length}`;
}
