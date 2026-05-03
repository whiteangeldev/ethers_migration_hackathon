/**
 * Class static blocks, instance methods, and provider wiring.
 */
import { ethers } from "ethers";

export class RpcHub {
  static readonly fallback = new ethers.providers.FallbackProvider([
    new ethers.providers.JsonRpcProvider("https://rpc.a"),
    new ethers.providers.JsonRpcProvider("https://rpc.b"),
  ]);

  decode(hex: string): Uint8Array {
    return ethers.utils.arrayify(hex);
  }

  pack(head: string, tail: string): Uint8Array {
    return ethers.utils.concat([
      ethers.utils.arrayify(head),
      ethers.utils.arrayify(tail),
    ]);
  }
}
