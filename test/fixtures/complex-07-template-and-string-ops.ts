/**
 * Template literals and binary-ish string operations.
 */
import { ethers } from "ethers";

export function buildDigest(parts: string[]): string {
  const joined = `prefix:${parts.join(":")}`;
  const bytes = ethers.utils.concat([ethers.utils.toUtf8Bytes(joined)]);
  return ethers.utils.sha256(bytes);
}
