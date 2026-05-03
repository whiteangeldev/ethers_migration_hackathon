/**
 * Nested calls: each inner ethers.utils.* should lift to ethers.*.
 */
import { ethers } from "ethers";

export function encodeLabel(label: string): string {
  return ethers.utils.hexlify(ethers.utils.toUtf8Bytes(label));
}
