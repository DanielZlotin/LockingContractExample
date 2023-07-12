import { block, bn18 } from "@defi.org/web3-candies";

import { expect } from "chai";
import { MONTH, locking, mockToken, rewardToken, user, userTwo, withFixture, withMockTokens, deployer, advanceMonths } from "./fixture";

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
      await locking.methods.lock(await mockToken.amount(amount), 4).send({ from: userTwo });

      await advanceMonths(1);

      const userOnePendingRewards = await locking.methods.pendingRewards(user, rewardToken.options.address).call();
      const userTwoPendingRewards = await locking.methods.pendingRewards(userTwo, rewardToken.options.address).call();

      expect(userOnePendingRewards).bignumber.closeTo(bn18(6_966), 1e18);
      expect(userTwoPendingRewards).bignumber.closeTo(bn18(3_034), 1e18);
    });



    // TODO: write test that checks when more than 50K rewards have been allocated
  });
});
