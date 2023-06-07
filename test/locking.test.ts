import { DAY, MONTH, deployer, locking, mockToken, tokenBalance, user, withMockTokens } from "./fixture";
import { account, block, bn18, erc20 } from "@defi.org/web3-candies";
import { deployArtifact, mineBlock, tag, useChaiBigNumber } from "@defi.org/web3-candies/dist/hardhat";
import BN from "bignumber.js";
import { expect } from "chai";
import type { Locking, MockERC20 } from "../typechain-hardhat/contracts";
import { withFixture } from "./fixture";

useChaiBigNumber();

describe("locking", () => {
  beforeEach(async () => withFixture());

  describe("with tokens", () => {
    const amount = 1234.567891234567;
    beforeEach(async () => withMockTokens(amount));

    it("user sends tokens after approval", async () => {
      expect(await tokenBalance(locking.options.address)).bignumber.zero;
      await locking.methods.createLock(await mockToken.amount(amount), 1).send({ from: user });
      expect(await tokenBalance(locking.options.address)).bignumber.eq(await mockToken.amount(amount));
    });

    it("get locked balance", async () => {
      const startDate = (await block()).timestamp;
      await locking.methods.createLock(await mockToken.amount(amount), 1_000_000).send({ from: user });
      const result = await locking.methods.getLockedBalance(user).call();
      expect(result.amount).bignumber.eq(await mockToken.amount(amount));
      expect(result.deadline).bignumber.closeTo(startDate + 1_000_000, 10);
    });

    it("power by months locked", async () => {
      expect(await mockToken.decimals()).bignumber.eq(18);

      const durationSeconds = 3 * MONTH;
      const months = durationSeconds / MONTH;
      const power = amount * months;

      await locking.methods.createLock(await mockToken.amount(amount), durationSeconds).send({ from: user });
      expect(await locking.methods.getPower(user).call())
        .bignumber.eq(power * 1e18)
        .eq(amount * 3 * 1e18);
    });

    [
      {
        remaining: MONTH,
        power: 10_000,
        name: "1 month",
      },
      {
        remaining: 3 * MONTH,
        power: 37_371,
        name: "3 months",
      },
      {
        remaining: 6 * MONTH,
        power: 85_858,
        name: "6 months",
      },
      {
        remaining: 12 * MONTH,
        power: 197_250,
        name: "12 months",
      },
      {
        remaining: 24 * MONTH,
        power: 453_162,
        name: "24 months",
      },
    ].map((t) => {
      it.only(`calcPower: ${t.name}`, async () => {
        // expect(await locking.methods.calcPower(t).call()).bignumber.eq(amount * 2.7 * 1e18);
        expect(await locking.methods.calcPower(t.remaining).call()).bignumber.eq(t.power);
        console.log(await locking.methods.calcPower(t.remaining).estimateGas());
      });
    });

    it("power by months locked remaining", async () => {
      // const durationSeconds = 3 * MONTH;
      // await locking.methods.createLock(await mockToken.amount(amount), durationSeconds).send({ from: user });
      // await mineBlock(7 * DAY);
    });
  });
});
