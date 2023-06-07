import { deployer, locking, mockToken, tokenBalance, user, withMockTokens } from "./fixture";
import { account, block, bn18, erc20 } from "@defi.org/web3-candies";
import { deployArtifact, tag, useChaiBigNumber } from "@defi.org/web3-candies/dist/hardhat";
import BN from "bignumber.js";
import { expect } from "chai";
import type { Locking, MockERC20 } from "../typechain-hardhat/contracts";
import { withFixture } from "./fixture";

useChaiBigNumber();

describe("locking", () => {
  beforeEach(async () => withFixture());

  describe("with tokens", () => {
    const amount = 1234.567891234567;
    const durationSeconds = 60 * 60 * 24 * 30;
    beforeEach(async () => withMockTokens(amount));

    it("user sends tokens after approval", async () => {
      expect(await tokenBalance(locking.options.address)).bignumber.zero;
      await locking.methods.createLock(await mockToken.amount(amount), durationSeconds).send({ from: user });
      expect(await tokenBalance(locking.options.address)).bignumber.eq(await mockToken.amount(amount));
    });

    it("get locked balance", async () => {
      const startDate = (await block()).timestamp;
      await locking.methods.createLock(await mockToken.amount(amount), durationSeconds).send({ from: user });
      const result = await locking.methods.getLockedBalance(user).call();
      expect(result.amount).bignumber.eq(await mockToken.amount(amount));
      expect(result.deadline).bignumber.closeTo(startDate + durationSeconds, 10);
    });
  });
});
