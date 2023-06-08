import { Token, account, bn18, erc20 } from "@defi.org/web3-candies";
import { deployArtifact, tag } from "@defi.org/web3-candies/dist/hardhat";
import { expect } from "chai";
import type { Locking, MockERC20 } from "../typechain-hardhat/contracts";
import BN from "bignumber.js";

export let deployer: string;
export let user: string;
export let feeReceiver1: string;
export let feeReceiver2: string;

export let mockToken: MockERC20 & Token;
export let locking: Locking;

export const DAY = 60 * 60 * 24;
export const WEEK = DAY * 7;
export const MONTH = DAY * 30;

export async function withFixture() {
  deployer = await account(9);
  user = await account(0);
  feeReceiver1 = await account(1);
  feeReceiver2 = await account(2);
  tag(user, "user");
  tag(deployer, "deployer");
  tag(feeReceiver1, "feeReceiver1");
  tag(feeReceiver2, "feeReceiver2");

  mockToken = erc20("MockERC20", (await deployArtifact<MockERC20>("MockERC20", { from: deployer }, [bn18(1e9)])).options.address);
  locking = await deployArtifact<Locking>("Locking", { from: deployer }, [mockToken.options.address, 12000, 9000, feeReceiver1, feeReceiver2]);

  expect(await locking.methods.token().call()).eq(mockToken.options.address);
}

export async function withMockTokens(amount: BN.Value) {
  await mockToken.methods.transfer(user, await mockToken.amount(amount)).send({ from: deployer });
  await mockToken.methods.approve(locking.options.address, await mockToken.amount(amount)).send({ from: user });
}

export async function tokenBalance(address: string) {
  return BN(await mockToken.methods.balanceOf(address).call());
}
