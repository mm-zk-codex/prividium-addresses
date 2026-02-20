import { encodeFunctionData, type Abi, type Address, type Hex, type PublicClient, type WalletClient } from 'viem';
import { SiweAuthManager } from '../auth/siweAuth.js';

type WriteContractParams = {
  contractAddress: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
};

export class PrividiumTxSender {
  constructor(private readonly authManager: SiweAuthManager) {}

  async writeContractAuthorized(params: WriteContractParams): Promise<Hex> {
    return this.authManager.withAuthRetry(async ({ publicClient, walletClient }) => {
      return this.sendAuthorizedTx(publicClient, walletClient, params);
    });
  }

  private async sendAuthorizedTx(publicClient: PublicClient, walletClient: WalletClient, params: WriteContractParams): Promise<Hex> {
    const from = this.authManager.getAddress();
    const calldata = encodeFunctionData({
      abi: params.abi,
      functionName: params.functionName,
      args: params.args
    });
    const nonce = await publicClient.getTransactionCount({ address: from, blockTag: 'pending' });
    const gas = await publicClient.estimateGas({ account: from, to: params.contractAddress, data: calldata, value: params.value ?? 0n });
    const fees = await publicClient.estimateFeesPerGas();

    await this.authManager.authorizeTransaction({
      walletAddress: from,
      contractAddress: params.contractAddress,
      nonce,
      calldata,
      ...(typeof params.value === 'bigint' ? { value: params.value } : {})
    });

    return walletClient.sendTransaction({
      chain: null,
      account: from,
      to: params.contractAddress,
      data: calldata,
      value: params.value,
      nonce,
      gas,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas
    });
  }
}

