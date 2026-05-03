/**
 * Destructuring: direct ethers.utils.* rewrites; aliased `utils` chain is untouched.
 */
import { ethers } from "ethers";

export function mixed(): string {
  const { utils } = ethers;
  const direct = ethers.utils.parseEther("1");
  const aliased = utils.parseEther("2");
  return `${direct.toString()}${aliased.toString()}`;
}
