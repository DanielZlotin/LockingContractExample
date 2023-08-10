import { Token, account, bn18, erc20, BlockInfo, Receipt } from "@defi.org/web3-candies";
import { deployArtifact, mineBlock, tag, useChaiBigNumber } from "@defi.org/web3-candies/dist/hardhat";
import { expect } from "chai";
import type { Locking, Rewards } from "../typechain-hardhat/contracts";
import type { MockERC20 } from "../typechain-hardhat/contracts/test";
import BN from "bignumber.js";

useChaiBigNumber();

export let deployer: string;
export let user1: string;
export let user2: string;
export let feeReceiver1: string;
export let feeReceiver2: string;

export let xctd: MockERC20 & Token;
export let rewardToken: MockERC20 & Token;
export let locking: Locking;
export let rewards: Rewards;

const DAY = 60 * 60 * 24;
const MONTH = DAY * 30;
export const PRECISION = 10000;
export const INITIAL_MONTH = 25;

export async function withFixture() {
  deployer = await account(9);
  user1 = await account(0);
  user2 = await account(3);
  feeReceiver1 = await account(1);
  feeReceiver2 = await account(2);
  tag(deployer, "deployer");
  tag(user1, "user1");
  tag(user2, "user2");
  tag(feeReceiver1, "feeReceiver1");
  tag(feeReceiver2, "feeReceiver2");

  xctd = erc20("MockERC20", (await deployArtifact<MockERC20>("MockERC20", { from: deployer }, [bn18(1e9), "XCTD"])).options.address);
  rewardToken = erc20("MockERC20", (await deployArtifact<MockERC20>("MockERC20", { from: deployer }, [bn18(1e9), "RewardToken"])).options.address);
  locking = await deployArtifact<Locking>("Locking", { from: deployer }, [xctd.options.address, 9000, feeReceiver1, feeReceiver2]);
  rewards = await deployArtifact<Rewards>("Rewards", { from: deployer }, [locking.options.address]);

  expect(await locking.methods.xctd().call()).eq(xctd.options.address);

  // Introduce a more-than-window period to ensure that no test relies on currentMonthIndex being equal to 0
  await advanceMonths(INITIAL_MONTH);
}

export async function fundWithXCTD(amount: BN.Value, targets: string[] = [user1, user2]) {
  for (const target of targets) {
    await xctd.methods.transfer(target, await xctd.amount(amount)).send({ from: deployer });
    await xctd.methods.approve(locking.options.address, await xctd.amount(amount)).send({ from: target });
  }
}

export async function xctdBalance(address: string) {
  return BN(await xctd.methods.balanceOf(address).call());
}

export function advanceDays(days: number): Promise<BlockInfo> {
  return mineBlock(days * DAY);
}

export function advanceMonths(months: number): Promise<BlockInfo> {
  return mineBlock(months * MONTH);
}

export async function lock(params: { user?: string; amount?: number; duration?: number }): Promise<Receipt> {
  return await locking.methods.lock(await xctd.amount(params.amount ?? 100), params.duration ?? 24).send({ from: params.user ?? user1 });
}
