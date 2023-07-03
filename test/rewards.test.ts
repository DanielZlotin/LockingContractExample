import { block, bn18 } from "@defi.org/web3-candies";

import { expect } from "chai";
import { MONTH, locking, mockToken, rewardToken, user, userTwo, withFixture, withMockTokens, deployer, advanceMonths } from "./fixture";

describe("Rewards", () => {
  beforeEach(async () => withFixture());

  describe("with tokens", () => {
    const amount = 1234.567891234567;
    beforeEach(async () => withMockTokens(amount));
    beforeEach(async () => {
      await rewardToken.methods.approve(locking.options.address, await rewardToken.amount(50_000)).send({ from: deployer });
      // 50000 / (60 * 86400) = 0.00964506
      await locking.methods.addReward(await rewardToken.amount(50_000), rewardToken.options.address, bn18(0.00964506)).send({ from: deployer });
    });

    it("user should have reward if did stake and didn't claim so far", async () => {
      // deploy
      // stake
      // mine some blocks
      // check balance
      // 50K tokens
      // Rate is 25K tokens per month

      await locking.methods.lock(await mockToken.amount(amount), 3 * MONTH).send({ from: user });
      await advanceMonths(1);
      const pendingRewards = await locking.methods.pendingRewards(user, rewardToken.options.address).call();
      expect(pendingRewards).bignumber.closeTo(bn18(25_000), bn18(1));
    });

    // TODO: update when `pendingRewards` is refactored
    it.skip("two users should have reward if did stake and didn't claim so far", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 3 * MONTH).send({ from: user });
      await locking.methods.lock(await mockToken.amount(amount), 1 * MONTH).send({ from: userTwo });

      await advanceMonths(1);

      const userOnePendingRewards = await locking.methods.pendingRewards(user, rewardToken.options.address).call();
      const userTwoPendingRewards = await locking.methods.pendingRewards(userTwo, rewardToken.options.address).call();

      expect(userOnePendingRewards).bignumber.closeTo(bn18(19_722), 1e18);
      expect(userTwoPendingRewards).bignumber.closeTo(bn18(5_277), 1e18);
    });

    it("deployer can add reward programs", async () => {
      const rewardProgram = await locking.methods.rewards(rewardToken.options.address).call();
      expect(rewardProgram.rewardsPerSecond).bignumber.eq(bn18(0.00964506));
      expect(rewardProgram.lastRewardTimestamp).bignumber.closeTo((await block()).timestamp, 1);
    });

    // TODO: write test that checks when more than 50K rewards have been allocated
  });
});
