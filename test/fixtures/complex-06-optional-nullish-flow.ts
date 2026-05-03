/**
 * Logical / optional flows with ethers.utils calls.
 */
import { ethers } from "ethers";

export function validateMaybe(addr: string | null | undefined): boolean {
  const a = addr != null && ethers.utils.isAddress(addr);
  const b = addr ?? ethers.utils.hexlify("0x");
  const c = (true as boolean) ? ethers.utils.isAddress("0x0000000000000000000000000000000000000000") : false;
  return Boolean(a && b && c);
}
