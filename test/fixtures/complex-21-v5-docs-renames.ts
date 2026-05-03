/**
 * Patterns from https://docs.ethers.org/v6/migrating/ (constants, solidityPack, Web3Provider).
 */
import { ethers } from "ethers";

export const ADDR = ethers.constants.AddressZero;
export const H = ethers.constants.HashZero;

export function packLegacy(types: string[], vals: unknown[]) {
  return ethers.utils.solidityPack(types, vals);
}

/** Value reference so AST is MemberExpression (typeof … uses TSQualifiedName). */
export const Web3Ctor = ethers.providers.Web3Provider;
