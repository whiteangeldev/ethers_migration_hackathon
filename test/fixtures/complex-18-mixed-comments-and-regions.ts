/**
 * Comments and dense blocks — ensure parser still sees member chains.
 */
import { ethers } from "ethers";

// legacy: utils namespace
export function legacyHash(seed: string): string {
  /* inline */ const a = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(seed));
  // trailing comment
  return ethers.utils.hexlify(a);
}
