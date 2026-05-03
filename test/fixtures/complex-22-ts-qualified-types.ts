/**
 * TypeScript `typeof ethers.*.*` uses TSQualifiedName — must migrate like value refs.
 */
import { ethers } from "ethers";

export type RpcCtor = typeof ethers.providers.JsonRpcProvider;
export type HashFn = typeof ethers.utils.keccak256;
export type Zero = typeof ethers.constants.AddressZero;
