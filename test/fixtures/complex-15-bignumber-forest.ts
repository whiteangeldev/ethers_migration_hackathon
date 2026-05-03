/**
 * Many BigNumber identifiers (non-import usages) for stress-testing risk detector.
 */
import { BigNumber } from "ethers";

function f(a: BigNumber, b: BigNumber): BigNumber {
  return a.add(b);
}

export const demo = {
  zero: BigNumber.from(0),
  one: BigNumber.from(1),
  sum() {
    return f(this.zero, this.one);
  },
};
