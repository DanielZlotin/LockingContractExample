import { block, bn18 } from "@defi.org/web3-candies";
import { expect } from "chai";
import { locking, xctd, rewardToken, user1, user2, withFixture, fundWithXCTD, deployer, advanceMonths } from "./fixture";
import BN from "bignumber.js";
import { expectRevert } from "@defi.org/web3-candies/dist/hardhat";

describe("Rewards", () => {
  beforeEach(async () => withFixture());

  describe("with tokens", () => {
    const amount = 1234.567891234567;
    beforeEach(async () => fundWithXCTD(amount));
    beforeEach(async () => {
      await rewardToken.methods.approve(locking.options.address, await rewardToken.amount(50_000)).send({ from: deployer });
      // 50000 / (60 * 86400) = 0.00964506
      await locking.methods.addReward(rewardToken.options.address, 0, 5, (await rewardToken.amount(10_000)).toFixed(0)).send({ from: deployer });
    });

    it("user should have reward if did stake and didn't claim so far", async () => {
      // deploy
      // stake
      // mine some blocks
      // check balance
      // 50K tokens
      // Rate is 25K tokens per month

      await locking.methods.lock(await xctd.amount(amount), 3).send({ from: user1 });
      await advanceMonths(1);
      const pendingRewards = await locking.methods.pendingRewards(user1, rewardToken.options.address).call();
      expect(pendingRewards).bignumber.closeTo(bn18(10_000), bn18(1));
    });

    it("two users, same balance, same period", async () => {
      await locking.methods.lock(await xctd.amount(amount), 3).send({ from: user1 });
      await locking.methods.lock(await xctd.amount(amount), 3).send({ from: user2 });

      await advanceMonths(1);

      const userOnePendingRewards = await locking.methods.pendingRewards(user1, rewardToken.options.address).call();
      const userTwoPendingRewards = await locking.methods.pendingRewards(user2, rewardToken.options.address).call();

      expect(userOnePendingRewards).bignumber.closeTo(bn18(5_000), 1e18);
      expect(userTwoPendingRewards).bignumber.closeTo(bn18(5_000), 1e18);
    });

    it("two users, difference balance, same period", async () => {
      await locking.methods.lock(await xctd.amount(amount), 3).send({ from: user1 });
      await locking.methods.lock(await xctd.amount(amount / 2), 3).send({ from: user2 });

      await advanceMonths(1);

      const userOnePendingRewards = await locking.methods.pendingRewards(user1, rewardToken.options.address).call();
      const userTwoPendingRewards = await locking.methods.pendingRewards(user2, rewardToken.options.address).call();

      expect(userOnePendingRewards).bignumber.closeTo(bn18(6_666), 1e18);
      expect(userTwoPendingRewards).bignumber.closeTo(bn18(3_333), 1e18);
    });

    it("two users, same balance, different period, same rate for decay", async () => {
      await locking.methods.lock(await xctd.amount(amount), 24).send({ from: user1 });
      await locking.methods.lock(await xctd.amount(amount), 12).send({ from: user2 });

      await advanceMonths(1);

      const userOnePendingRewards = await locking.methods.pendingRewards(user1, rewardToken.options.address).call();
      const userTwoPendingRewards = await locking.methods.pendingRewards(user2, rewardToken.options.address).call();

      expect(userOnePendingRewards).bignumber.closeTo(bn18(6_966), 1e18);
      expect(userTwoPendingRewards).bignumber.closeTo(bn18(3_034), 1e18);
    });

    it("two users, same balance, different period, decay", async () => {
      await locking.methods.lock(await xctd.amount(amount), 7).send({ from: user1 });
      await locking.methods.lock(await xctd.amount(amount), 3).send({ from: user2 });

      await advanceMonths(1);

      const userOnePendingRewards = await locking.methods.pendingRewards(user1, rewardToken.options.address).call();
      const userTwoPendingRewards = await locking.methods.pendingRewards(user2, rewardToken.options.address).call();

      expect(userOnePendingRewards).bignumber.closeTo(bn18(8_406), 1e18);
      expect(userTwoPendingRewards).bignumber.closeTo(bn18(1_594), 1e18);
    });

    it("one user locks one month after reward was added, total 2 months passed", async () => {
      await advanceMonths(1);
      await locking.methods.lock(await xctd.amount(amount), 3).send({ from: user1 });
      await advanceMonths(1);
      const pendingRewards = await locking.methods.pendingRewards(user1, rewardToken.options.address).call();
      expect(pendingRewards).bignumber.closeTo(bn18(10_000), 1e18);
    });

    it("one user locks one month after reward was added, reward program ended, rewards are orphaned", async () => {
      await advanceMonths(1);
      await locking.methods.lock(await xctd.amount(amount), 3).send({ from: user1 });
      await advanceMonths(4);
      const pendingRewards = await locking.methods.pendingRewards(user1, rewardToken.options.address).call();
      expect(pendingRewards).bignumber.closeTo(bn18(30_000), 1e18);
      // note that 10K got stuck at the beginning of the program, and another 10K got stuck at the end
      const rewardTokenBalance = BN(await rewardToken.methods.balanceOf(locking.options.address).call());
      expect(rewardTokenBalance.minus(pendingRewards)).bignumber.closeTo(bn18(20_000), 1e18);

      await locking.methods.claim(user1, rewardToken.options.address).send({ from: user1 });
      expect(await rewardToken.methods.balanceOf(locking.options.address).call()).bignumber.closeTo(bn18(20_000), 1e18);
    });

    it("one user locks for three months, claims after 1 month", async () => {
      await locking.methods.lock(await xctd.amount(amount), 3).send({ from: user1 });
      await locking.methods.claim(user1, rewardToken.options.address).send({ from: user1 });
      expect(await rewardToken.methods.balanceOf(user1).call()).bignumber.zero;
      await advanceMonths(1);
      await locking.methods.claim(user1, rewardToken.options.address).send({ from: user1 });
      expect(await rewardToken.methods.balanceOf(user1).call()).bignumber.closeTo(bn18(10_000), 1e18);
    });

    it("one user locks for three months, claims after 1 month, shouldn't be able to claim again", async () => {
      await locking.methods.lock(await xctd.amount(amount), 3).send({ from: user1 });
      await locking.methods.claim(user1, rewardToken.options.address).send({ from: user1 });
      expect(await rewardToken.methods.balanceOf(user1).call()).bignumber.zero;
      await advanceMonths(1);
      await locking.methods.claim(user1, rewardToken.options.address).send({ from: user1 });
      expect(await rewardToken.methods.balanceOf(user1).call()).bignumber.closeTo(bn18(10_000), 1e18);

      await locking.methods.claim(user1, rewardToken.options.address).send({ from: user1 });
      expect(await rewardToken.methods.balanceOf(user1).call()).bignumber.closeTo(bn18(10_000), 1e18);
    });

    it("two users lock different periods, claim at the end of the program", async () => {
      await locking.methods.lock(await xctd.amount(amount), 3).send({ from: user1 });
      await advanceMonths(1);
      await locking.methods.lock(await xctd.amount(amount), 4).send({ from: user2 });
      await advanceMonths(4);
      await locking.methods.claim(user1, rewardToken.options.address).send({ from: user1 });

      expect(await rewardToken.methods.balanceOf(user1).call()).bignumber.closeTo(bn18(15_142), 1e18);
      await locking.methods.claim(user2, rewardToken.options.address).send({ from: user2 });
      expect(await rewardToken.methods.balanceOf(user2).call()).bignumber.closeTo(bn18(34_858), 1e18);
    });

    it("two users lock at different periods, rewards program has not ended", async () => {
      await locking.methods.lock(await xctd.amount(amount), 2).send({ from: user1 });
      await advanceMonths(1);
      await locking.methods.lock(await xctd.amount(amount), 2).send({ from: user2 });
      await locking.methods.claim(user1, rewardToken.options.address).send({ from: user1 });
      expect(await rewardToken.methods.balanceOf(user1).call()).bignumber.closeTo(bn18(10_000), 1e18);
    });

    it("rewards program is updateable, same period", async () => {
      await rewardToken.methods.approve(locking.options.address, await rewardToken.amount(15_000)).send({ from: deployer });
      await locking.methods.addReward(rewardToken.options.address, 0, 5, (await rewardToken.amount(3_000)).toFixed(0)).send({ from: deployer });
      await locking.methods.lock(await xctd.amount(amount), 5).send({ from: user1 });
      await advanceMonths(5);
      await locking.methods.claim(user1, rewardToken.options.address).send({ from: user1 });
      expect(await rewardToken.methods.balanceOf(user1).call()).bignumber.closeTo(bn18(65_000), 1e18);
    });

    it("rewards program is updateable, different period", async () => {
      await advanceMonths(10);
      await rewardToken.methods.approve(locking.options.address, await rewardToken.amount(15_000)).send({ from: deployer });
      await locking.methods.addReward(rewardToken.options.address, 0, 5, (await rewardToken.amount(3_000)).toFixed(0)).send({ from: deployer });

      await locking.methods.lock(await xctd.amount(amount), 5).send({ from: user1 });
      await advanceMonths(5);
      await locking.methods.claim(user1, rewardToken.options.address).send({ from: user1 });
      expect(await rewardToken.methods.balanceOf(user1).call()).bignumber.closeTo(bn18(15_000), 1e18);
    });

    it("rewards program is updateable, offset", async () => {
      await rewardToken.methods.approve(locking.options.address, await rewardToken.amount(15_000)).send({ from: deployer });
      await locking.methods.addReward(rewardToken.options.address, 10, 5, (await rewardToken.amount(3_000)).toFixed(0)).send({ from: deployer });

      await advanceMonths(10);
      await locking.methods.lock(await xctd.amount(amount), 5).send({ from: user1 });
      await advanceMonths(5);
      await locking.methods.claim(user1, rewardToken.options.address).send({ from: user1 });
      expect(await rewardToken.methods.balanceOf(user1).call()).bignumber.closeTo(bn18(15_000), 1e18);
    });

    it("rewards program can't be depleted by owner", async () => {
      const initialBalance = await rewardToken.methods.balanceOf(deployer).call();
      await locking.methods.lock(await xctd.amount(amount), 5).send({ from: user1 });
      await advanceMonths(6);
      await locking.methods.recover(rewardToken.options.address, 0, 5).send({ from: deployer });
      expect(await rewardToken.methods.balanceOf(deployer).call()).bignumber.eq(initialBalance);
    });

    it("owner can only recover reward funds per month a single time", async () => {
      const initialBalance = await rewardToken.methods.balanceOf(deployer).call();
      await advanceMonths(6);
      await locking.methods.recover(rewardToken.options.address, 0, 5).send({ from: deployer });
      expect(await rewardToken.methods.balanceOf(deployer).call()).bignumber.eq(BN(initialBalance).plus(await rewardToken.amount(50_000)));
      await locking.methods.recover(rewardToken.options.address, 0, 5).send({ from: deployer });
      expect(await rewardToken.methods.balanceOf(deployer).call()).bignumber.eq(BN(initialBalance).plus(await rewardToken.amount(50_000)));
    });

    it("recover reward tokens that don't belong to the reward program", async () => {
      await locking.methods.lock(await xctd.amount(amount), 24).send({ from: user1 });
      await rewardToken.methods.transfer(locking.options.address, await rewardToken.amount(17_000)).send({ from: deployer });
      const balanceBefore = await rewardToken.methods.balanceOf(deployer).call();
      await advanceMonths(1);
      await locking.methods.recover(rewardToken.options.address, 0, 0).send({ from: deployer });
      const balanceAfter = await rewardToken.methods.balanceOf(deployer).call();
      expect(BN(balanceAfter).minus(balanceBefore)).bignumber.eq(await rewardToken.amount(17_000));
    });

    it("owner cannot recover funds from the future", async () => {
      const initialBalance = await rewardToken.methods.balanceOf(deployer).call();
      await expectRevert(() => locking.methods.recover(rewardToken.options.address, 0, 5).send({ from: deployer }), "Locking:recover:endMonth");
      expect(await rewardToken.methods.balanceOf(deployer).call()).bignumber.eq(BN(initialBalance));
    });
  });
});
