import { block, bn, bn18, maxUint256, parseEvents, web3, zero, zeroAddress } from "@defi.org/web3-candies";
import { deploy, expectRevert, mineBlock, setBalance, useChaiBigNumber } from "@defi.org/web3-candies/dist/hardhat";
import { expect } from "chai";
import {
  DAY,
  MONTH,
  deployer,
  feeReceiver1,
  feeReceiver2,
  locking,
  mockToken,
  tokenBalance,
  user,
  userTwo,
  withFixture,
  withMockTokens,
  PRECISION,
} from "./fixture";

useChaiBigNumber();

// Qs
// - huge array instead of cyclic?
// - are we ok with user depositing after 29 days being able to unstake after 1 day and losing boost if he
//   intended to stake for only 1 month

describe.only("locking boosted total", () => {
  beforeEach(async () => withFixture());

  describe("with tokens", () => {
    const amount = 1234.567891234567;
    beforeEach(async () => withMockTokens(amount));

    it("total boosted power should be 0 when no locks", async () => {
      const totalBoosted = await locking.methods.totalBoosted().call();
      expect(totalBoosted).to.be.bignumber.eq(0);
    });

    // TODO - rephrase this
    it("total boosted power immediately after locking for one user should be maximum", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 3 * MONTH).send({ from: user });
      const totalBoosted = await locking.methods.totalBoosted().call();
      expect(totalBoosted).to.be.bignumber.eq((await mockToken.amount(amount)).multipliedBy(3.74));
    });

    it("total boosted power immediately after locking for two users should be maximum", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 3 * MONTH).send({ from: user });
      await locking.methods.lock(await mockToken.amount(amount), 6 * MONTH).send({ from: userTwo });
      const totalBoosted = await locking.methods.totalBoosted().call();
      const firstUserBoosted = (await mockToken.amount(amount)).multipliedBy(3.74);
      const secondUserBoosted = (await mockToken.amount(amount)).multipliedBy(8.59);
      expect(totalBoosted).to.be.bignumber.eq(firstUserBoosted.plus(secondUserBoosted));
    });

    it("total boosted power after 20 days should be 3 month boost", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 3 * MONTH).send({ from: user });
      await mineBlock(20 * DAY);
      const totalBoosted = await locking.methods.totalBoosted().call();
      expect(totalBoosted).to.be.bignumber.eq((await mockToken.amount(amount)).multipliedBy(3.74));
    });

    it("total boosted power after 1.5month should be 2 month boost", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 3 * MONTH).send({ from: user });
      await mineBlock(45 * DAY);
      const totalBoosted = await locking.methods.totalBoosted().call();
      expect(totalBoosted).to.be.bignumber.eq((await mockToken.amount(amount)).multipliedBy(3.74));
    });

    it("total boosted power 2.5months after locking for two users decays by 2 months", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 3 * MONTH).send({ from: user });
      await locking.methods.lock(await mockToken.amount(amount), 6 * MONTH).send({ from: userTwo });
      await mineBlock(75 * DAY); // Decays by 2 months
      const totalBoosted = await locking.methods.totalBoosted().call();
      const firstUserBoosted = (await mockToken.amount(amount)).multipliedBy(1);
      const secondUserBoosted = (await mockToken.amount(amount)).multipliedBy(8.59);
      expect(totalBoosted).to.be.bignumber.eq(firstUserBoosted.plus(secondUserBoosted));
    });

    it("total boosted power 3 months after locking for two users decays by 3 months", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 3 * MONTH).send({ from: user });
      await locking.methods.lock(await mockToken.amount(amount), 6 * MONTH).send({ from: userTwo });
      await mineBlock(90 * DAY); // Decays by 3 months
      const totalBoosted = await locking.methods.totalBoosted().call();
      const firstUserBoosted = (await mockToken.amount(amount)).multipliedBy(0);
      const secondUserBoosted = (await mockToken.amount(amount)).multipliedBy(3.74);
      expect(totalBoosted).to.be.bignumber.eq(firstUserBoosted.plus(secondUserBoosted));
    });

    it("two users locking at different times decay correctly", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 3 * MONTH).send({ from: user });
      await mineBlock(35 * DAY); // Decays by 1 months
      await locking.methods.lock(await mockToken.amount(amount), 6 * MONTH).send({ from: userTwo });
      await mineBlock(35 * DAY); // Decays by another 1 month
      const totalBoosted = await locking.methods.totalBoosted().call();
      const firstUserBoosted = (await mockToken.amount(amount)).multipliedBy(1);
      const secondUserBoosted = (await mockToken.amount(amount)).multipliedBy(8.59);
      expect(totalBoosted).to.be.bignumber.eq(firstUserBoosted.plus(secondUserBoosted));
    });

    it("two users locking at different times decay correctly", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 3 * MONTH).send({ from: user });
      await mineBlock(35 * DAY); // Decays by 1 months
      await locking.methods.lock(await mockToken.amount(amount), 6 * MONTH).send({ from: userTwo });
      await mineBlock(65 * DAY); // Decays by another 2 months
      const totalBoosted = await locking.methods.totalBoosted().call();
      const firstUserBoosted = (await mockToken.amount(amount)).multipliedBy(0);
      const secondUserBoosted = (await mockToken.amount(amount)).multipliedBy(8.59);
      expect(totalBoosted).to.be.bignumber.eq(firstUserBoosted.plus(secondUserBoosted));
    });

    it("user staking for 24 months after time has passed decays correctly", async () => {
      await mineBlock(35 * DAY);
      await locking.methods.lock(await mockToken.amount(amount), 24 * MONTH).send({ from: user });
      await mineBlock(65 * DAY); // Decays by 2 months
      const totalBoosted = await locking.methods.totalBoosted().call();
      const firstUserBoosted = (await mockToken.amount(amount)).multipliedBy(45.32);
      expect(totalBoosted).to.be.bignumber.eq(firstUserBoosted);
    });

    // @dev - we need to reset back to 0 stale months
    it("two users locking at different times for 24 months is reflected correctly at end of period", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 24 * MONTH).send({ from: user });
      await mineBlock(35 * DAY); // Decays by 1 months
      await locking.methods.lock(await mockToken.amount(amount), 24 * MONTH).send({ from: userTwo });
      await mineBlock(23 * MONTH);
      const totalBoosted = await locking.methods.totalBoosted().call();
      const firstUserBoosted = (await mockToken.amount(amount)).multipliedBy(0);
      const secondUserBoosted = (await mockToken.amount(amount)).multipliedBy(1);
      expect(totalBoosted).to.be.bignumber.eq(firstUserBoosted.plus(secondUserBoosted));
    });

    describe("Configurable boosts", () => {
      const newBoostFactor = 0.5;
      const newBoostFactorWithPrecision = newBoostFactor * PRECISION;

      const updateBoostFactors = async () => {
        await locking.methods.updateBoostFactors(new Array(24).fill(newBoostFactorWithPrecision).map((x, i) => x + i)).send({ from: deployer });
      };

      it("monthly boosts should be admin configurable", async () => {
        const original12MonthBoostFactor = await locking.methods.monthToBoost(12).call();
        expect(original12MonthBoostFactor).to.eq("453200");
        await updateBoostFactors();

        for (let i = 0; i < 24; i++) {
          const updatedBoostFactor = await locking.methods.monthToBoost(i).call();
          expect(updatedBoostFactor).to.eq(String(newBoostFactorWithPrecision + i));
        }
      });

      it("changes to boost factors are relected in total boosts", async () => {
        await locking.methods.lock(await mockToken.amount(amount), 24 * MONTH).send({ from: user });
        await mineBlock(35 * DAY); // Decays by 1 months
        const originalTotalBoosted = await locking.methods.totalBoosted().call();
        expect(originalTotalBoosted).to.be.bignumber.eq((await mockToken.amount(amount)).multipliedBy(45.32));

        await updateBoostFactors();

        const updatedTotalBoosted = await locking.methods.totalBoosted().call();
        expect(updatedTotalBoosted).to.be.bignumber.eq((await mockToken.amount(amount)).multipliedBy(newBoostFactor));
      });
    });

    describe.only("_calculateLockedForDuration", () => {
      it("returns correct amount locked when only single lock", async () => {
        await locking.methods.lock(await mockToken.amount(amount), 24 * MONTH).send({ from: user });
        const locked = await locking.methods._calculateLockedForDuration().call();
        const expectedLocked = new Array(24).fill("0");
        expectedLocked[23] = String(await mockToken.amount(amount));

        expect(locked).to.eql(expectedLocked);
      });
      
      it("returns correct amount locked when only single lock with time shifts", async () => {
        await mineBlock(12 * MONTH); 
        await locking.methods.lock(await mockToken.amount(amount), 24 * MONTH).send({ from: user });
        await mineBlock(9 * MONTH); 
        const locked = await locking.methods._calculateLockedForDuration().call();
        const expectedLocked = new Array(24).fill("0");
        expectedLocked[14] = String(await mockToken.amount(amount));

        expect(locked).to.eql(expectedLocked);
      });

      it("returns correct amount locked when multiple locks with multiple time shifts", async () => {
        const userLockedAmount = amount / 2
        await locking.methods.lock(await mockToken.amount(userLockedAmount), 12 * MONTH).send({ from: user });
        await mineBlock(7 * MONTH);
        await locking.methods.lock(await mockToken.amount(amount), 6 * MONTH).send({ from: userTwo });
        await mineBlock(1 * MONTH);
        await locking.methods.lock(await mockToken.amount(userLockedAmount), 24 * MONTH).send({ from: user });

        const locked = await locking.methods._calculateLockedForDuration().call();
        const expectedLocked = new Array(24).fill("0");
        expectedLocked[3] = String(await mockToken.amount(userLockedAmount)); // first user (first portion)
        expectedLocked[4] = String(await mockToken.amount(amount)); // second user
        expectedLocked[23] = String(await mockToken.amount(userLockedAmount)); // first user (second portion)

        expect(locked).to.eql(expectedLocked);
      });
    });
  });
});

// TODO
// deposit for 24 months (initial)
// deposit for 25 months (fail?)
// deposit some, move 1.5 month forward, deposit for 24 months
// deposit some, move 24 months, deposit for 24 months
