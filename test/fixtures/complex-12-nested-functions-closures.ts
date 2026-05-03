/**
 * Closures and nested scopes referencing providers/utils.
 */
import { ethers } from "ethers";

export function makeFactory(chainId: number) {
  return function pick(urlA: string, urlB: string) {
    const pickProvider = () =>
      chainId === 1
        ? new ethers.providers.AlchemyProvider("homestead", "DEMO_KEY")
        : new ethers.providers.InfuraProvider("homestead", "DEMO_KEY");

    const hash = (s: string) => ethers.utils.keccak256(ethers.utils.toUtf8Bytes(s));
    const pack = (a: string, b: string) => ethers.utils.solidityPacked(["string", "string"], [a, b]);

    return { pickProvider, hash, pack };
  };
}
