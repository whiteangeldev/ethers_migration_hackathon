/**
 * Generics + interface shapes referencing providers and utils.
 */
import { ethers, BigNumber } from "ethers";

export interface NodeAdapter<P extends ethers.providers.JsonRpcProvider = ethers.providers.JsonRpcProvider> {
  readonly provider: P;
  digest(data: Uint8Array): string;
}

export class SimpleAdapter implements NodeAdapter {
  readonly provider: ethers.providers.JsonRpcProvider;

  constructor(url: string) {
    this.provider = new ethers.providers.JsonRpcProvider(url);
  }

  digest(data: Uint8Array): string {
    const h = ethers.utils.keccak256(data);
    const _unused: BigNumber | null = null;
    return ethers.utils.hexlify(h);
  }
}
