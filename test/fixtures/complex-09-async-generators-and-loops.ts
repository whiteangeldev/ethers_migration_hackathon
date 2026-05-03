/**
 * async/await, for-await, yield — ethers.utils scattered in control flow.
 */
import { ethers, BigNumber } from "ethers";

async function* chunkIds(start: bigint, end: bigint): AsyncGenerator<string> {
  let i = start;
  while (i < end) {
    yield ethers.utils.solidityPacked(["uint256"], [i]);
    i += 1n;
  }
}

export async function sumWeiHuman(amounts: string[]): Promise<string> {
  let acc = BigNumber.from(0n);
  for (const a of amounts) {
    acc = acc.add(ethers.utils.parseUnits(a, 18));
  }
  for await (const _id of chunkIds(0n, 2n)) {
    void _id;
  }
  return acc.toString();
}
