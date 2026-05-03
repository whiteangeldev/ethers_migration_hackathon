/**
 * Chained reads on the same line (two independent ethers.utils uses).
 */
import { ethers } from "ethers";

export const x = [ethers.utils.parseEther("1"), ethers.utils.parseEther("2")];
