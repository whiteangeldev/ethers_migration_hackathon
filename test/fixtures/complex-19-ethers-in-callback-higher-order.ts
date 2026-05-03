/**
 * Higher-order: map/filter callbacks containing ethers.utils.
 */
import { ethers } from "ethers";

export function formatRows(rows: { raw: string }[]): string[] {
  return rows
    .map((r) => ethers.utils.hexlify(r.raw))
    .filter((s) => s.length > 0)
    .map((s) => ethers.utils.hexlify(s));
}
