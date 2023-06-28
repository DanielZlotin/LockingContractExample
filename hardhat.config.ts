import "dotenv/config";
import { task, HardhatUserConfig } from "hardhat/config";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-web3";
import "hardhat-gas-reporter";
import "hardhat-tracer";
import { hardhatDefaultConfig } from "@defi.org/web3-candies/dist/hardhat";
import _ from "lodash";
import "hardhat-watcher";

task("foo", async () => {});

export default _.merge(hardhatDefaultConfig(), {
  networks: {
    hardhat: {
      // forking: {
      //   blockNumber: 17576915
      // }
    },
  },
  mocha: {
    bail: false,
  },
  watcher: {
    test: {
      tasks: ['test'],
    },
  },
} as HardhatUserConfig);
