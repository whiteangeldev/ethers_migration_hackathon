/**
 * ethers patterns buried in object literals and arrays.
 */
import { ethers } from "ethers";

export const TOKEN = {
  decimals: 9,
  min: ethers.utils.parseUnits("0", 9),
  max: ethers.utils.parseUnits("1000000", 9),
  hash: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("TOKEN")),
  packed: ethers.utils.solidityPacked(["string"], ["TOKEN"]),
};

export const RPC_PAIR = [
  new ethers.providers.WebSocketProvider("wss://a.example"),
  new ethers.providers.WebSocketProvider("wss://b.example"),
] as const;
