/**
 * JSX: ethers.utils in attributes and children.
 */
import React from "react";
import { ethers } from "ethers";

type Props = { amount: string };

export function GasRow(props: Props): React.ReactElement {
  const formatted = ethers.utils.parseUnits(props.amount, 9);
  return (
    <div data-wei={props.amount} title={ethers.utils.parseEther("1").toString()}>
      <span>{formatted}</span>
    </div>
  );
}
