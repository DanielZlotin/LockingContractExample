import { expect } from "chai";
import { deployer, locking, xctd, user1, user2, withFixture, fundWithXCTD, PRECISION, advanceDays, advanceMonths } from "./fixture";

describe("locking boosted total", () => {
  beforeEach(async () => withFixture());

  const amount = 1234.567891234567;
  beforeEach(async () => fundWithXCTD(amount));

  it("total boosted power should be 0 when no locks", async () => {
    const totalBoosted = await locking.methods.totalBoosted().call();
    expect(totalBoosted).to.be.bignumber.eq(0);
  });

  it("total boosted power immediately after locking for one user should be maximum", async () => {
    await locking.methods.lock(await xctd.amount(amount), 3).send({ from: user1 });
    const totalBoosted = await locking.methods.totalBoosted().call();
    expect(totalBoosted).to.be.bignumber.eq((await xctd.amount(amount)).multipliedBy(3.74));
  });

  it("total boosted power immediately after locking for two users should be maximum", async () => {
    await locking.methods.lock(await xctd.amount(amount), 3).send({ from: user1 });
    await locking.methods.lock(await xctd.amount(amount), 6).send({ from: user2 });
    const totalBoosted = await locking.methods.totalBoosted().call();
    const firstUserBoosted = (await xctd.amount(amount)).multipliedBy(3.74);
    const secondUserBoosted = (await xctd.amount(amount)).multipliedBy(8.59);
    expect(totalBoosted).to.be.bignumber.eq(firstUserBoosted.plus(secondUserBoosted));
  });

  it("total boosted power after 20 days should be 3 month boost", async () => {
    await locking.methods.lock(await xctd.amount(amount), 3).send({ from: user1 });
    await advanceDays(20);
    const totalBoosted = await locking.methods.totalBoosted().call();
    expect(totalBoosted).to.be.bignumber.eq((await xctd.amount(amount)).multipliedBy(3.74));
  });

  it("total boosted power after 1.5month should be 2 month boost", async () => {
    await locking.methods.lock(await xctd.amount(amount), 3).send({ from: user1 });
    await advanceDays(45);
    const totalBoosted = await locking.methods.totalBoosted().call();
    expect(totalBoosted).to.be.bignumber.eq((await xctd.amount(amount)).multipliedBy(3.74));
  });

  it("total boosted power 2.5months after locking for two users decays by 2 months", async () => {
    await locking.methods.lock(await xctd.amount(amount), 3).send({ from: user1 });
    await locking.methods.lock(await xctd.amount(amount), 6).send({ from: user2 });
    await advanceDays(75); // Decays by 2 months
    const totalBoosted = await locking.methods.totalBoosted().call();
    const firstUserBoosted = (await xctd.amount(amount)).multipliedBy(1);
    const secondUserBoosted = (await xctd.amount(amount)).multipliedBy(8.59);
    expect(totalBoosted).to.be.bignumber.eq(firstUserBoosted.plus(secondUserBoosted));
  });

  it("total boosted power 3 months after locking for two users decays by 3 months", async () => {
    await locking.methods.lock(await xctd.amount(amount), 3).send({ from: user1 });
    await locking.methods.lock(await xctd.amount(amount), 6).send({ from: user2 });
    await advanceDays(90); // Decays by 3 months
    const totalBoosted = await locking.methods.totalBoosted().call();
    const firstUserBoosted = (await xctd.amount(amount)).multipliedBy(0);
    const secondUserBoosted = (await xctd.amount(amount)).multipliedBy(3.74);
    expect(totalBoosted).to.be.bignumber.eq(firstUserBoosted.plus(secondUserBoosted));
  });

  it("two users locking at different times decay correctly", async () => {
    await locking.methods.lock(await xctd.amount(amount), 3).send({ from: user1 });
    await advanceDays(35); // Decays by 1 months
    await locking.methods.lock(await xctd.amount(amount), 6).send({ from: user2 });
    await advanceDays(35); // Decays by another 1 month
    const totalBoosted = await locking.methods.totalBoosted().call();
    const firstUserBoosted = (await xctd.amount(amount)).multipliedBy(1);
    const secondUserBoosted = (await xctd.amount(amount)).multipliedBy(8.59);
    expect(totalBoosted).to.be.bignumber.eq(firstUserBoosted.plus(secondUserBoosted));
  });

  it("two users locking at different times decay correctly", async () => {
    await locking.methods.lock(await xctd.amount(amount), 3).send({ from: user1 });
    await advanceDays(35); // Decays by 1 months
    await locking.methods.lock(await xctd.amount(amount), 6).send({ from: user2 });
    await advanceDays(65); // Decays by another 2 months
    const totalBoosted = await locking.methods.totalBoosted().call();
    const firstUserBoosted = (await xctd.amount(amount)).multipliedBy(0);
    const secondUserBoosted = (await xctd.amount(amount)).multipliedBy(8.59);
    expect(totalBoosted).to.be.bignumber.eq(firstUserBoosted.plus(secondUserBoosted));
  });

  it("user staking for 24 months after time has passed decays correctly", async () => {
    await advanceDays(35);
    await locking.methods.lock(await xctd.amount(amount), 24).send({ from: user1 });
    await advanceDays(65); // Decays by 2 months
    const totalBoosted = await locking.methods.totalBoosted().call();
    const firstUserBoosted = (await xctd.amount(amount)).multipliedBy(45.32);
    expect(totalBoosted).to.be.bignumber.eq(firstUserBoosted);
  });

  // @dev - we need to reset back to 0 stale months
  it("two users locking at different times for 24 months is reflected correctly at end of period", async () => {
    await locking.methods.lock(await xctd.amount(amount), 24).send({ from: user1 });
    await advanceDays(35); // Decays by 1 months
    await locking.methods.lock(await xctd.amount(amount), 24).send({ from: user2 });
    await advanceMonths(23);
    const totalBoosted = await locking.methods.totalBoosted().call();
    const firstUserBoosted = (await xctd.amount(amount)).multipliedBy(0);
    const secondUserBoosted = (await xctd.amount(amount)).multipliedBy(1);
    expect(totalBoosted).to.be.bignumber.eq(firstUserBoosted.plus(secondUserBoosted));
  });

  it("returns correct amount locked when multiple locks with multiple time shifts", async () => {
    const userLockedAmount = amount / 2;
    await locking.methods.lock(await xctd.amount(userLockedAmount), 12).send({ from: user1 });

    expect(await locking.methods.totalBoosted().call()).to.be.bignumber.eq((await xctd.amount(userLockedAmount)).multipliedBy(19.73));

    await advanceMonths(7);

    expect(await locking.methods.totalBoosted().call()).to.be.bignumber.eq((await xctd.amount(userLockedAmount)).multipliedBy(8.59));

    await locking.methods.lock(await xctd.amount(userLockedAmount), 6).send({ from: user2 });
    expect(await locking.methods.totalBoosted().call()).to.be.bignumber.eq(
      (await xctd.amount(userLockedAmount)).multipliedBy(8.59).plus((await xctd.amount(userLockedAmount)).multipliedBy(8.59))
    );
    await advanceMonths(1);
    // prettier-ignore
    expect(await locking.methods.totalBoosted().call()).to.be.bignumber.eq(
        (await xctd.amount(userLockedAmount)).multipliedBy(8.59)
        .plus( 
        (await xctd.amount(userLockedAmount)).multipliedBy(8.59))
      );
  });

  describe("Configurable boosts", () => {
    const newBoostFactors = [0.5, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1, 2.2, 2.3, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];

    const updateBoostFactors = async () => {
      await locking.methods.updateBoostFactors(newBoostFactors.map((x) => x * PRECISION)).send({ from: deployer });
    };

    it("monthly boosts should be admin configurable", async () => {
      const original12MonthBoostFactor = await locking.methods.monthToBoost(12).call();
      expect(original12MonthBoostFactor).to.eq("453200");
      await updateBoostFactors();

      for (let i = 0; i < 24; i++) {
        const updatedBoostFactor = await locking.methods.monthToBoost(i).call();
        expect(updatedBoostFactor).to.eq(String(newBoostFactors[i] * PRECISION));
      }
    });

    it("changes to boost factors are relected in total boosts", async () => {
      await locking.methods.lock(await xctd.amount(amount), 24).send({ from: user1 });
      await advanceDays(35); // Decays by 1 months
      const originalTotalBoosted = await locking.methods.totalBoosted().call();
      expect(originalTotalBoosted).to.be.bignumber.eq((await xctd.amount(amount)).multipliedBy(45.32));

      await updateBoostFactors();

      const updatedTotalBoosted = await locking.methods.totalBoosted().call();
      expect(updatedTotalBoosted).to.be.bignumber.eq((await xctd.amount(amount)).multipliedBy(newBoostFactors[22]));
    });
  });
});

// TODO test cases:
// deposit for 24 months (initial)
// deposit for 25 months (fail?)
// deposit some, move 1.5 month forward, deposit for 24 months
// deposit some, move 24 months, deposit for 24 months
