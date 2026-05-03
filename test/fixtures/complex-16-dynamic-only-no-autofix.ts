/**
 * Variable-index access stays risky; string-literal bracket access on concat is auto-fixed.
 */
import { ethers } from "ethers";

const k = "parseEther" as const;
const p = "WebSocketProvider" as const;

export const dyn = {
  u: ethers.utils[k],
  v: ethers.utils["concat"],
  w: ethers.providers[p],
};
