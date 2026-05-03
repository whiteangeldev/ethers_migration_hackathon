/**
 * Exported const enums / objects (const object pattern) with ethers references.
 */
import { ethers } from "ethers";

export const UNITS = {
  WAD: ethers.utils.parseEther("1"),
  RAY: ethers.utils.parseUnits("1", 27),
} as const;

export const DEFAULT_WS = new ethers.providers.WebSocketProvider("wss://example");
