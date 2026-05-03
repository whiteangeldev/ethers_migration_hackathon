/**
 * switch / try-catch: one safe rewrite, one unsafe member (should flag only).
 */
import { ethers } from "ethers";

export function probe(kind: "ok" | "bad"): string {
  try {
    switch (kind) {
      case "ok":
        return ethers.utils.hexlify("0xdead");
      case "bad":
        return String(ethers.utils.id("x"));
      default:
        return "0x";
    }
  } catch {
    return "0x";
  }
}
