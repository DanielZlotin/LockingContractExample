import { block, bn, bn18, maxUint256, parseEvents, web3 } from "@defi.org/web3-candies";
import { expectRevert, setBalance } from "@defi.org/web3-candies/dist/hardhat";
import { expect } from "chai";
import {
  lock,
  deployer,
  feeReceiver1,
  feeReceiver2,
  locking,
  xctd,
  xctdBalance,
  user1,
  withFixture,
  fundWithXCTD,
  advanceDays,
  advanceMonths,
  user2,
  PRECISION,
} from "./fixture";

describe("locking", () => {
  beforeEach(async () => withFixture());

  describe("with tokens", () => {
    const amount = 1234.567891234567;
    beforeEach(async () => fundWithXCTD(amount));

    it("user sends tokens after approval", async () => {
      expect(await xctdBalance(locking.options.address)).bignumber.zero;
      await locking.methods.lock(await xctd.amount(amount), 1).send({ from: user1 });
      expect(await xctdBalance(locking.options.address)).bignumber.eq(await xctd.amount(amount));
    });

    it("get locked balance", async () => {
      const startDate = (await block()).timestamp;
      await locking.methods.lock(await xctd.amount(amount), 1).send({ from: user1 });
      const result = await locking.methods.locks(user1).call();
      expect(result.amount).bignumber.eq(await xctd.amount(amount));
    });

    // TODO: add boostedBalanceOf(user) feature
    it.skip("as time passes boosted balance decreases", async () => {
      // await locking.methods.lock(await mockToken.amount(amount), 3).send({ from: user });
      // const balance1 = await locking.methods.boostedBalanceOf(user).call();
      // await advanceDays(7);
      // const balance2 = await locking.methods.boostedBalanceOf(user).call();
      // expect(balance2).bignumber.lt(balance1);
    });

    it("early partial withdrawal with penalty", async () => {
      await lock({ duration: 1, amount });

      const balanceBefore = await xctdBalance(user1);
      const withdrawalAmount = bn18(100);
      await locking.methods.earlyWithdrawWithPenalty(withdrawalAmount).send({ from: user1 });

      const balanceAfter = await xctdBalance(user1);
      expect(balanceAfter.minus(balanceBefore)).bignumber.closeTo(withdrawalAmount.times(0.1), 1e18);
      expect((await locking.methods.locks(user1).call()).amount).bignumber.closeTo(bn18(amount).minus(withdrawalAmount), 1e18);
    });

    it("penalty goes to fee receivers 50/50", async () => {
      expect(await xctdBalance(feeReceiver1)).bignumber.zero;
      expect(await xctdBalance(feeReceiver2)).bignumber.zero;
      await locking.methods.lock(await xctd.amount(amount), 1).send({ from: user1 });
      const withdrawalAmount = bn18(100);
      await locking.methods.earlyWithdrawWithPenalty(withdrawalAmount).send({ from: user1 });
      expect(await xctdBalance(feeReceiver1)).bignumber.closeTo(bn18(45), 1e18);
      expect(await xctdBalance(feeReceiver2)).bignumber.closeTo(bn18(45), 1e18);
    });

    it("withdraw all of the amount after the lock has elapsed", async () => {
      await lock({ duration: 6, amount });
      await advanceMonths(6);
      await locking.methods.withdraw().send({ from: user1 });
      const balance = await xctdBalance(user1);
      expect(balance).bignumber.closeTo(bn18(amount), 1e18);

      expect((await locking.methods.locks(user1).call()).amount).bignumber.eq("0");
      await locking.methods.withdraw().send({ from: user1 });
      expect(await xctdBalance(user1)).bignumber.eq(balance);
    });

    it("create lock with zero duration is valid but wasteful", async () => {
      await locking.methods.lock(await xctd.amount(amount), 0).send({ from: user1 });
    });

    it("create lock with zero amount is valid but wasteful", async () => {
      await locking.methods.lock(0, 1).send({ from: user1 });
    });

    it("ownable", async () => {
      expect(await locking.methods.owner().call()).eq(deployer);
    });

    it("early full withdrawal deletes the lock and updates totals", async () => {
      expect(await locking.methods.totalBoosted().call()).bignumber.zero;

      await locking.methods.lock(await xctd.amount(amount / 2), 24).send({ from: user1 });
      await locking.methods.lock(await xctd.amount(amount / 2), 24).send({ from: user2 });

      await advanceMonths(1);

      expect(await locking.methods.totalBoosted().call()).bignumber.eq(
        (await xctd.amount(amount)).multipliedBy(await locking.methods.monthToBoost(23).call()).dividedBy(PRECISION)
      );
      expect(await locking.methods.totalLocked().call()).bignumber.eq(await xctd.amount(amount));

      await locking.methods.earlyWithdrawWithPenalty(maxUint256).send({ from: user1 });

      expect((await locking.methods.locks(user1).call()).endMonth).bignumber.zero;
      expect(await locking.methods.totalBoosted().call()).bignumber.eq(
        (await xctd.amount(amount / 2)).multipliedBy(await locking.methods.monthToBoost(23).call()).dividedBy(PRECISION)
      );
      expect(await locking.methods.totalLocked().call()).bignumber.eq(await xctd.amount(amount / 2));
    });

    it("recover tokens above total locked", async () => {
      await locking.methods.lock(await xctd.amount(amount / 2), 24).send({ from: user1 });
      await locking.methods.lock(await xctd.amount(amount / 2), 24).send({ from: user1 });
      expect(await locking.methods.totalLocked().call()).bignumber.eq(await xctd.amount(amount));

      const balanceBefore = await xctdBalance(deployer);
      await xctd.methods.transfer(locking.options.address, await xctd.amount(98765)).send({ from: deployer });
      expect(await locking.methods.totalLocked().call()).bignumber.eq(await xctd.amount(amount));

      await advanceMonths(1);

      await locking.methods.recover(xctd.options.address, 0, 0).send({ from: deployer });
      expect(await locking.methods.totalLocked().call()).bignumber.eq(await xctd.amount(amount));
      expect(await xctdBalance(deployer)).bignumber.eq(balanceBefore);
    });

    it("recover native balance", async () => {
      await advanceMonths(1);
      await setBalance(locking.options.address, bn(12345 * 1e18));
      expect(await web3().eth.getBalance(locking.options.address)).bignumber.eq(12345 * 1e18);
      await locking.methods.recover(xctd.address, 0, 0).send({ from: deployer });
      expect(await web3().eth.getBalance(locking.options.address)).bignumber.zero;
    });

    describe("errors", () => {
      it("cannot send eth to contract", async () => {
        await expectRevert(() => web3().eth.sendTransaction({ from: user1, to: locking.options.address, value: 1 }), "no fallback nor receive function");
      });

      it("withdraw only possible after lock elapsed", async () => {
        await lock({ duration: 1 });
        await expectRevert(() => locking.methods.withdraw().send({ from: user1 }), "Locking:withdraw:endMonth");
      });

      it("create lock with zero amount and duration", async () => {
        await expectRevert(() => locking.methods.lock(0, 0).send({ from: user1 }), "Locking:lock:params");
      });

      describe("only owner", () => {
        it("cannot renounce ownership", async () => {
          await expectRevert(() => locking.methods.renounceOwnership().send({ from: deployer }), "revert");
        });
      });
    });

    describe("events", () => {
      it("Lock", async () => {
        const tx = await lock({ duration: 1, amount });
        const events = parseEvents(tx, locking);
        expect(events[0].event).eq("Locked");
        expect(events[0].returnValues.target).eq(user1);
        expect(events[0].returnValues.amount).bignumber.eq(bn18(amount));
      });

      it("Withdraw", async () => {
        await lock({ duration: 1, amount });
        await advanceMonths(1);
        const tx = await locking.methods.withdraw().send({ from: user1 });
        const events = parseEvents(tx, locking);
        expect(events[0].event).eq("Withdraw");
        expect(events[0].returnValues.target).eq(user1);
        expect(events[0].returnValues.amount).bignumber.eq(bn18(amount));
      });

      it("WithdrawWithPenalty", async () => {
        await lock({ amount, duration: 1 });
        const tx = await locking.methods.earlyWithdrawWithPenalty(await xctd.amount(amount / 2)).send({ from: user1 });
        const events = parseEvents(tx, locking);
        expect(events[0].event).eq("WithdrawWithPenalty");
        expect(events[0].returnValues.target).eq(user1);
        expect(events[0].returnValues.amount).bignumber.eq(bn18(amount / 2));
      });
    });
  });
});
