import { block, bn18 } from "@defi.org/web3-candies";
import { expect } from "chai";
import { MONTH, locking, mockToken, rewardToken, user, userTwo, withFixture, withMockTokens, deployer, advanceMonths } from "./fixture";
import BN from "bignumber.js";

describe.only("Rewards", () => {
  beforeEach(async () => withFixture());

  describe("with tokens", () => {
    const amount = 1234.567891234567;
    beforeEach(async () => withMockTokens(amount));
    beforeEach(async () => {
      await rewardToken.methods.approve(locking.options.address, await rewardToken.amount(50_000)).send({ from: deployer });
      // 50000 / (60 * 86400) = 0.00964506
      await locking.methods.addReward(rewardToken.options.address, [0, 5, (await rewardToken.amount(50_000)).toFixed(0)]).send({ from: deployer });
    });

    it("user should have reward if did stake and didn't claim so far", async () => {
      // deploy
      // stake
      // mine some blocks
      // check balance
      // 50K tokens
      // Rate is 25K tokens per month

      await locking.methods.lock(await mockToken.amount(amount), 3).send({ from: user });
      await advanceMonths(1);
      const pendingRewards = await locking.methods.pendingRewards(user, rewardToken.options.address).call();
      expect(pendingRewards).bignumber.closeTo(bn18(10_000), bn18(1));
    });

    it("two users, same balance, same period", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 3).send({ from: user });
      await locking.methods.lock(await mockToken.amount(amount), 3).send({ from: userTwo });

      await advanceMonths(1);

      const userOnePendingRewards = await locking.methods.pendingRewards(user, rewardToken.options.address).call();
      const userTwoPendingRewards = await locking.methods.pendingRewards(userTwo, rewardToken.options.address).call();

      expect(userOnePendingRewards).bignumber.closeTo(bn18(5_000), 1e18);
      expect(userTwoPendingRewards).bignumber.closeTo(bn18(5_000), 1e18);
    });

    it("two users, difference balance, same period", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 3).send({ from: user });
      await locking.methods.lock(await mockToken.amount(amount / 2), 3).send({ from: userTwo });

      await advanceMonths(1);

      const userOnePendingRewards = await locking.methods.pendingRewards(user, rewardToken.options.address).call();
      const userTwoPendingRewards = await locking.methods.pendingRewards(userTwo, rewardToken.options.address).call();

      expect(userOnePendingRewards).bignumber.closeTo(bn18(6_666), 1e18);
      expect(userTwoPendingRewards).bignumber.closeTo(bn18(3_333), 1e18);
    });

    it("two users, same balance, different period, same rate for decay", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 24).send({ from: user });
      await locking.methods.lock(await mockToken.amount(amount), 12).send({ from: userTwo });

      await advanceMonths(1);

      const userOnePendingRewards = await locking.methods.pendingRewards(user, rewardToken.options.address).call();
      const userTwoPendingRewards = await locking.methods.pendingRewards(userTwo, rewardToken.options.address).call();

      expect(userOnePendingRewards).bignumber.closeTo(bn18(6_966), 1e18);
      expect(userTwoPendingRewards).bignumber.closeTo(bn18(3_034), 1e18);
    });

    it("two users, same balance, different period, decay", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 7).send({ from: user });
      await locking.methods.lock(await mockToken.amount(amount), 3).send({ from: userTwo });

      await advanceMonths(1);

      const userOnePendingRewards = await locking.methods.pendingRewards(user, rewardToken.options.address).call();
      const userTwoPendingRewards = await locking.methods.pendingRewards(userTwo, rewardToken.options.address).call();

      expect(userOnePendingRewards).bignumber.closeTo(bn18(8_406), 1e18);
      expect(userTwoPendingRewards).bignumber.closeTo(bn18(1_594), 1e18);
    });

    it("one user locks one month after reward was added, total 2 months passed", async () => {
      await advanceMonths(1);
      await locking.methods.lock(await mockToken.amount(amount), 3).send({ from: user });
      await advanceMonths(1);
      const pendingRewards = await locking.methods.pendingRewards(user, rewardToken.options.address).call();
      expect(pendingRewards).bignumber.closeTo(bn18(10_000), 1e18);
    });

    it("one user locks one month after reward was added, reward program ended, rewards are orphaned", async () => {
      await advanceMonths(1);
      await locking.methods.lock(await mockToken.amount(amount), 3).send({ from: user });
      await advanceMonths(4);
      const pendingRewards = await locking.methods.pendingRewards(user, rewardToken.options.address).call();
      expect(pendingRewards).bignumber.closeTo(bn18(30_000), 1e18);
      // note that 10K got stuck at the beginning of the program, and another 10K got stuck at the end
      const rewardTokenBalance = BN(await rewardToken.methods.balanceOf(locking.options.address).call());
      expect(rewardTokenBalance.minus(pendingRewards)).bignumber.closeTo(bn18(20_000), 1e18);
      // TODO: uncomment below when we have addded claim functionality
      // expect(await rewardToken.methods.balanceOf(locking.options.address).call()).bignumber.closeTo(bn18(20_000), 1e18);
    });

    it("one user locks for three months, claims after 1 month", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 3).send({ from: user });
      await locking.methods.claim(user, rewardToken.options.address).send({ from: user });
      expect(await rewardToken.methods.balanceOf(user).call()).bignumber.zero;
      await advanceMonths(1);
      await locking.methods.claim(user, rewardToken.options.address).send({ from: user });
      expect(await rewardToken.methods.balanceOf(user).call()).bignumber.closeTo(bn18(10_000), 1e18);
    });

    it("one user locks for three months, claims after 1 month, shouldn't be able to claim again", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 3).send({ from: user });
      await locking.methods.claim(user, rewardToken.options.address).send({ from: user });
      expect(await rewardToken.methods.balanceOf(user).call()).bignumber.zero;
      await advanceMonths(1);
      await locking.methods.claim(user, rewardToken.options.address).send({ from: user });
      expect(await rewardToken.methods.balanceOf(user).call()).bignumber.closeTo(bn18(10_000), 1e18);

      await locking.methods.claim(user, rewardToken.options.address).send({ from: user });
      expect(await rewardToken.methods.balanceOf(user).call()).bignumber.closeTo(bn18(10_000), 1e18);
    });

    it("two user locks different periods, claim at the end of the program", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 3).send({ from: user });
      await advanceMonths(1);
      await locking.methods.lock(await mockToken.amount(amount), 4).send({ from: userTwo });
      await advanceMonths(4);
      await locking.methods.claim(user, rewardToken.options.address).send({ from: user });

      expect(await rewardToken.methods.balanceOf(user).call()).bignumber.closeTo(bn18(15_142), 1e18);
      await locking.methods.claim(userTwo, rewardToken.options.address).send({ from: userTwo });
      expect(await rewardToken.methods.balanceOf(userTwo).call()).bignumber.closeTo(bn18(34_858), 1e18);
    });

    it("minimal test for past failure", async () => {
      /*
        Step 1 [(*)123, 123, ...]
        Step 2 [123, (*)246, 246, ...] => when we try to calculate total boost from month 0, we get an unexpected increasing total locked amount (should always decrease)
       */
      await locking.methods.lock(await mockToken.amount(amount), 2).send({ from: user });
      await advanceMonths(1);
      await locking.methods.lock(await mockToken.amount(amount), 2).send({ from: userTwo });
      await locking.methods.claim(user, rewardToken.options.address).send({ from: user });
      expect(await rewardToken.methods.balanceOf(user).call()).bignumber.closeTo(bn18(10_000), 1e18);
    });

    // TODO: test for pending rewards, where two users lock at different times, with different boosts and are eligible for different shares of the reward program

    // TODO: testcase to check pending before advancing a month

    // TODO: write test that checks when more than 50K rewards have been allocated

    // TODO: consider the case user locks at day 29 and is eligible for a month-worth of rewards

    // TODO: add a claimBack reward function for each historical month that had totalBoostedSupply of 0

    // TODO: how can reward programs be extended / modified?
  });
});
