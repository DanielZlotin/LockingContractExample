import { deployArtifact, useChaiBigNumber } from "@defi.org/web3-candies/dist/hardhat";
import { expect } from "chai";
import BN from "bignumber.js";
import { account } from "@defi.org/web3-candies";
import type { Locking } from "../typechain-hardhat/contracts";

useChaiBigNumber();

describe("sanity", () => {
  it("env is working", async () => {
    expect(BN(1234.5678)).bignumber.gt(1234);
    expect(BN("1234.5678")).bignumber.eq(1234.5678);

    // const deployer = await account();
    // const uut = await deployArtifact<Locking>("Locking", { from: deployer });
    // expect(await uut.methods.foo().call()).bignumber.eq(1);
  });
});
