import { block, bn, bn18, maxUint256, parseEvents, web3 } from "@defi.org/web3-candies";
import { expectRevert, setBalance } from "@defi.org/web3-candies/dist/hardhat";
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
  withFixture,
  withMockTokens,
  advanceDays,
  advanceMonths,
} from "./fixture";

describe("locking", () => {
  beforeEach(async () => withFixture());

  describe("with tokens", () => {
    const amount = 1234.567891234567;
    beforeEach(async () => withMockTokens(amount));

    it("user sends tokens after approval", async () => {
      expect(await tokenBalance(locking.options.address)).bignumber.zero;
      await locking.methods.lock(await mockToken.amount(amount), 1).send({ from: user });
      expect(await tokenBalance(locking.options.address)).bignumber.eq(await mockToken.amount(amount));
    });

    it("get locked balance", async () => {
      const startDate = (await block()).timestamp;
      await locking.methods.lock(await mockToken.amount(amount), 1_000_000).send({ from: user });
      const result = await locking.methods.lockedBalanceOf(user).call();
      expect(result.amount).bignumber.eq(await mockToken.amount(amount));
      expect(result.deadline).bignumber.closeTo(startDate + 1_000_000, 10);
    });

    it("boosted balance", async () => {
      expect(await mockToken.decimals()).bignumber.eq(18);
      const durationSeconds = 3 * MONTH;

      await locking.methods.lock(await mockToken.amount(amount), durationSeconds).send({ from: user });
      expect(await locking.methods.boostedBalanceOf(user).call()).bignumber.closeTo(4613.8271 * 1e18, 1e18);
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
    ].forEach((t) => {
      it(`calcPowerRatio: ${t.name}`, async () => {
        expect(await locking.methods.calcPowerRatio(12_000, t.remaining).call()).bignumber.eq(t.power);
        expect(await locking.methods.calcPowerRatio(12_000, t.remaining).estimateGas()).lt(50_000);
      });
    });

    it("as time passes boosted balance decreases", async () => {
      const durationSeconds = 3 * MONTH;
      await locking.methods.lock(await mockToken.amount(amount), durationSeconds).send({ from: user });
      const balance1 = await locking.methods.boostedBalanceOf(user).call();
      await advanceDays(7);
      const balance2 = await locking.methods.boostedBalanceOf(user).call();
      expect(balance2).bignumber.lt(balance1);
    });

    it("early partial withdrawal with penalty", async () => {
      await locking.methods.lock(await mockToken.amount(amount), MONTH).send({ from: user });

      const balanceBefore = await tokenBalance(user);
      const withdrawalAmount = bn18(100);
      await locking.methods.earlyWithdrawWithPenalty(withdrawalAmount).send({ from: user });

      const balanceAfter = await tokenBalance(user);
      expect(balanceAfter.minus(balanceBefore)).bignumber.closeTo(withdrawalAmount.times(0.1), 1e18);
      expect((await locking.methods.lockedBalanceOf(user).call()).amount).bignumber.closeTo(bn18(amount).minus(withdrawalAmount), 1e18);
    });

    it("penalty goes to fee receivers 50/50", async () => {
      expect(await tokenBalance(feeReceiver1)).bignumber.zero;
      expect(await tokenBalance(feeReceiver2)).bignumber.zero;
      await locking.methods.lock(await mockToken.amount(amount), MONTH).send({ from: user });
      const withdrawalAmount = bn18(100);
      await locking.methods.earlyWithdrawWithPenalty(withdrawalAmount).send({ from: user });
      expect(await tokenBalance(feeReceiver1)).bignumber.closeTo(bn18(45), 1e18);
      expect(await tokenBalance(feeReceiver2)).bignumber.closeTo(bn18(45), 1e18);
    });

    it("withdraw all of the amount after the lock has elapsed", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 6 * MONTH).send({ from: user });
      await advanceMonths(6);
      await locking.methods.withdraw().send({ from: user });
      const balance = await tokenBalance(user);
      expect(balance).bignumber.closeTo(bn18(amount), 1e18);

      expect((await locking.methods.lockedBalanceOf(user).call()).amount).bignumber.zero;
      await locking.methods.withdraw().send({ from: user });
      expect(await tokenBalance(user)).bignumber.eq(balance);
    });

    it("increase tokens under lock", async () => {
      await locking.methods.lock(await mockToken.amount(amount / 2), MONTH).send({ from: user });
      const prevDeadline = (await locking.methods.lockedBalanceOf(user).call()).deadline;
      expect((await locking.methods.lockedBalanceOf(user).call()).amount).bignumber.eq(await mockToken.amount(amount / 2));

      await locking.methods.lock(await mockToken.amount(amount / 2), 0).send({ from: user });
      expect((await locking.methods.lockedBalanceOf(user).call()).amount).bignumber.eq(await mockToken.amount(amount));
      expect((await locking.methods.lockedBalanceOf(user).call()).deadline).bignumber.eq(prevDeadline);
    });

    it("increase duration under lock", async () => {
      await locking.methods.lock(await mockToken.amount(amount), MONTH).send({ from: user });
      const prevDeadline = parseInt((await locking.methods.lockedBalanceOf(user).call()).deadline);
      await locking.methods.lock(0, MONTH).send({ from: user });
      expect((await locking.methods.lockedBalanceOf(user).call()).amount).bignumber.eq(await mockToken.amount(amount));
      expect((await locking.methods.lockedBalanceOf(user).call()).deadline).bignumber.closeTo(prevDeadline + MONTH, 1);
    });

    it("create lock with zero duration is valid but wasteful", async () => {
      await locking.methods.lock(await mockToken.amount(amount), 0).send({ from: user });
    });

    it("create lock with zero amount is valid but wasteful", async () => {
      await locking.methods.lock(0, MONTH).send({ from: user });
    });

    it("ownable", async () => {
      expect(await locking.methods.owner().call()).eq(deployer);
    });

    it("owner can set exponent", async () => {
      await locking.methods.setExponent(12345).send({ from: deployer });
      expect(await locking.methods.exponent().call()).bignumber.eq(12345);
    });

    it("early full withdrawal deletes the lock", async () => {
      await locking.methods.lock(await mockToken.amount(amount / 2), MONTH * 24).send({ from: user });
      await advanceMonths(1);
      await locking.methods.earlyWithdrawWithPenalty(maxUint256).send({ from: user });
      expect((await locking.methods.lockedBalanceOf(user).call()).deadline).bignumber.zero;

      await locking.methods.lock(await mockToken.amount(amount / 2), MONTH).send({ from: user });
      expect((await locking.methods.lockedBalanceOf(user).call()).amount).bignumber.eq(await mockToken.amount(amount / 2));
    });

    it("recover tokens above total locked", async () => {
      await locking.methods.lock(await mockToken.amount(amount / 2), MONTH * 24).send({ from: user });
      await locking.methods.lock(await mockToken.amount(amount / 2), MONTH * 24).send({ from: user });
      expect(await locking.methods.totalLocked().call()).bignumber.eq(await mockToken.amount(amount));

      const balanceBefore = await tokenBalance(deployer);
      await mockToken.methods.transfer(locking.options.address, await mockToken.amount(98765)).send({ from: deployer });
      expect(await locking.methods.totalLocked().call()).bignumber.eq(await mockToken.amount(amount));

      await locking.methods.recover(mockToken.options.address, await mockToken.amount(98765)).send({ from: deployer });
      expect(await locking.methods.totalLocked().call()).bignumber.eq(await mockToken.amount(amount));
      expect(await tokenBalance(deployer)).bignumber.eq(balanceBefore);
    });

    it("recover native balance", async () => {
      await setBalance(locking.options.address, bn(12345 * 1e18));
      expect(await web3().eth.getBalance(locking.options.address)).bignumber.eq(12345 * 1e18);
      await locking.methods.recover(mockToken.address, 0).send({ from: deployer });
      expect(await web3().eth.getBalance(locking.options.address)).bignumber.zero;
    });

    describe("errors", () => {
      it("cannot send eth to contract", async () => {
        await expectRevert(() => web3().eth.sendTransaction({ from: user, to: locking.options.address, value: 1 }), "no fallback nor receive function");
      });

      it("withdraw only possible after lock elapsed", async () => {
        await locking.methods.lock(await mockToken.amount(amount), MONTH).send({ from: user });
        await expectRevert(() => locking.methods.withdraw().send({ from: user }), "Locking:withdraw:deadline");
      });

      it("create lock with zero amount and duration", async () => {
        await expectRevert(() => locking.methods.lock(0, 0).send({ from: user }), "Locking:lock:params");
      });

      describe("only owner", () => {
        it("setExponent", async () => {
          await expectRevert(() => locking.methods.setExponent(12345).send({ from: user }), "caller is not the owner");
        });

        it("cannot renounce ownership", async () => {
          await expectRevert(() => locking.methods.renounceOwnership().send({ from: deployer }), "revert");
        });
      });
    });

    describe("events", () => {
      it("Lock", async () => {
        const tx = await locking.methods.lock(await mockToken.amount(amount), MONTH).send({ from: user });
        const events = parseEvents(tx, locking);
        expect(events[0].event).eq("Locked");
        expect(events[0].returnValues.target).eq(user);
        expect(events[0].returnValues.amount).bignumber.eq(bn18(amount));
      });

      it("Withdraw", async () => {
        await locking.methods.lock(await mockToken.amount(amount), MONTH).send({ from: user });
        await advanceMonths(1);
        const tx = await locking.methods.withdraw().send({ from: user });
        const events = parseEvents(tx, locking);
        expect(events[0].event).eq("Withdraw");
        expect(events[0].returnValues.target).eq(user);
        expect(events[0].returnValues.amount).bignumber.eq(bn18(amount));
      });

      it("WithdrawWithPenalty", async () => {
        await locking.methods.lock(await mockToken.amount(amount), MONTH).send({ from: user });
        const tx = await locking.methods.earlyWithdrawWithPenalty(await mockToken.amount(amount / 2)).send({ from: user });
        const events = parseEvents(tx, locking);
        expect(events[0].event).eq("WithdrawWithPenalty");
        expect(events[0].returnValues.target).eq(user);
        expect(events[0].returnValues.amount).bignumber.eq(bn18(amount / 2));
      });
    });
  });
});
