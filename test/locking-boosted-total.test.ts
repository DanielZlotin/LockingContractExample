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
    })

    it('total boosted power after 20 days should be 3 month boost', async () => {
      await locking.methods.lock(await mockToken.amount(amount), 3 * MONTH).send({ from: user });
      await mineBlock(20 * DAY);
      const totalBoosted = await locking.methods.totalBoosted().call();
      expect(totalBoosted).to.be.bignumber.eq((await mockToken.amount(amount)).multipliedBy(3.74));
    })
    
    it('total boosted power after 1.5month should be 2 month boost', async () => {
      await locking.methods.lock(await mockToken.amount(amount), 3 * MONTH).send({ from: user });
      await mineBlock(45 * DAY);
      const totalBoosted = await locking.methods.totalBoosted().call();
      expect(totalBoosted).to.be.bignumber.eq((await mockToken.amount(amount)).multipliedBy(2.3));
    })

    // test that total boost is 2 month boost after 1 month and a half
    // single user, two users
    // deposit for 24 months (initial)
    // deposit for 25 months (fail?)
    // deposit some, move 1.5 month forward, deposit for 24 months
    // deposit some, move 24 months, deposit for 24 months

  });
});
