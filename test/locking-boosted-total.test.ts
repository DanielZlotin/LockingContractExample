import { block, bn, bn18, maxUint256, parseEvents, web3, zero, zeroAddress } from "@defi.org/web3-candies";
import { deploy, expectRevert, mineBlock, setBalance, useChaiBigNumber } from "@defi.org/web3-candies/dist/hardhat";
import { expect } from "chai";
import { DAY, MONTH, deployer, feeReceiver1, feeReceiver2, locking, mockToken, tokenBalance, user, userTwo, withFixture, withMockTokens } from "./fixture";

useChaiBigNumber();

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
      expect(totalBoosted).to.be.bignumber.eq((await mockToken.amount(amount)).multipliedBy(2.3));
    });

    it("total boosted power 2.5months after locking for two users decays correctly", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 3 * MONTH).send({ from: user });
      await locking.methods.lock(await mockToken.amount(amount), 6 * MONTH).send({ from: userTwo });
      await mineBlock(75 * DAY); // Decays by 2 months
      const totalBoosted = await locking.methods.totalBoosted().call();
      const firstUserBoosted = (await mockToken.amount(amount)).multipliedBy(1);
      const secondUserBoosted = (await mockToken.amount(amount)).multipliedBy(5.28);
      expect(totalBoosted).to.be.bignumber.eq(firstUserBoosted.plus(secondUserBoosted));
    });
    
    it("two users locking at different times decay correctly", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 3 * MONTH).send({ from: user });
      await mineBlock(35 * DAY); // Decays by 1 months
      await locking.methods.lock(await mockToken.amount(amount), 6 * MONTH).send({ from: userTwo });
      await mineBlock(35 * DAY); // Decays by 1 months
      const totalBoosted = await locking.methods.totalBoosted().call();
      const firstUserBoosted = (await mockToken.amount(amount)).multipliedBy(1);
      const secondUserBoosted = (await mockToken.amount(amount)).multipliedBy(6.9);
      expect(totalBoosted).to.be.bignumber.eq(firstUserBoosted.plus(secondUserBoosted));
    });
    
    it("two users locking at different times decay correctly", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 3 * MONTH).send({ from: user });
      await mineBlock(35 * DAY); // Decays by 1 months
      await locking.methods.lock(await mockToken.amount(amount), 6 * MONTH).send({ from: userTwo });
      await mineBlock(65 * DAY); // Decays by 2 months
      const totalBoosted = await locking.methods.totalBoosted().call();
      const firstUserBoosted = (await mockToken.amount(amount)).multipliedBy(0);
      const secondUserBoosted = (await mockToken.amount(amount)).multipliedBy(5.28);
      expect(totalBoosted).to.be.bignumber.eq(firstUserBoosted.plus(secondUserBoosted));
    });
    
    it("user staking for 24 months after time has passed decays correctly", async () => {
      await mineBlock(35 * DAY);
      await locking.methods.lock(await mockToken.amount(amount), 24 * MONTH).send({ from: user });
      await mineBlock(65 * DAY); // Decays by 2 months
      const totalBoosted = await locking.methods.totalBoosted().call();
      const firstUserBoosted = (await mockToken.amount(amount)).multipliedBy(40.82);
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
    
    // CUR=7, newCur=10 
    // [10 => ,15,15,15,15,15,15,15,15,15,15,15,15,...]

    // [10, 10]
    // 
    
    
    // deposit for 24 months (initial)
    // deposit for 25 months (fail?)
    // deposit some, move 1.5 month forward, deposit for 24 months
    // deposit some, move 24 months, deposit for 24 months
  });
});
