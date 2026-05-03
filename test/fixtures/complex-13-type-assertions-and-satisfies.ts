/**
 * Type positions: provider and util members in annotations / assertions.
 */
import { ethers } from "ethers";

export type Rpc = ethers.providers.JsonRpcProvider;

export function assertProvider(p: unknown): asserts p is ethers.providers.JsonRpcProvider {
  if (!(p instanceof ethers.providers.JsonRpcProvider)) {
    throw new Error("not rpc");
  }
}

export function addrOk(x: unknown): boolean {
  return ethers.utils.isAddress(x as string);
}
