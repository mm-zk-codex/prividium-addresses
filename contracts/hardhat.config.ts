import { config as dotenvConfig } from 'dotenv';
import { HardhatUserConfig } from 'hardhat/config';
import hardhatToolboxViem from '@nomicfoundation/hardhat-toolbox-viem';

dotenvConfig({ path: '../infra/.env' });

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxViem],
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 200 } }
  },
  paths: {
    sources: './src',
    tests: './test'
  },
  networks: {
    sepolia: {
      url: process.env.RPC_URL_SEPOLIA ?? '',
      accounts: process.env.PRIVATE_KEY_RELAYER ? [process.env.PRIVATE_KEY_RELAYER] : []
    }
  }
};

export default config;
