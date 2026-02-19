import { expect } from 'chai';
import { encodeAbiParameters, keccak256, parseEther, toHex } from 'viem';
import hre from 'hardhat';

describe('Phase 2 contracts', function () {
  it('L2 vault receives prefunded ETH and sweeps only to recipient', async function () {
    const { viem } = hre;
    const [deployer, recipient, caller] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();

    const factory = await viem.deployContract('VaultFactory');
    const artifact = await hre.artifacts.readArtifact('OneWayVault');
    const salt = keccak256(toHex('vault-1'));
    const initCode = `${artifact.bytecode}${encodeAbiParameters([{ type: 'address' }], [recipient.account.address]).slice(2)}` as `0x${string}`;
    const predicted = await factory.read.computeVaultAddress([salt, recipient.account.address]);

    await deployer.sendTransaction({ to: predicted, value: parseEther('0.1') });
    expect(await publicClient.getBalance({ address: predicted })).to.equal(parseEther('0.1'));

    await publicClient.waitForTransactionReceipt({ hash: await factory.write.deployVault([salt, recipient.account.address]) });

    const vault = await viem.getContractAt('OneWayVault', predicted);
    const before = await publicClient.getBalance({ address: recipient.account.address });
    await publicClient.waitForTransactionReceipt({ hash: await vault.write.sweepETH([], { account: caller.account }) });
    const after = await publicClient.getBalance({ address: recipient.account.address });
    expect(after - before).to.equal(parseEther('0.1'));
  });

  it('L1 forwarder receives prefunded ETH and only calls bridgehub direct tx to X', async function () {
    const { viem } = hre;
    const [deployer, relayer] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();

    const bridgehub = await viem.deployContract('MockBridgehub');
    const factory = await viem.deployContract('ForwarderFactoryL1');

    const salt = keccak256(toHex('fwd-1'));
    const x = '0x1111111111111111111111111111111111111111';
    const refund = '0x2222222222222222222222222222222222222222';
    const assetRouter = '0x3333333333333333333333333333333333333333';
    const nativeTokenVault = '0x4444444444444444444444444444444444444444';

    const predicted = await factory.read.computeAddress([salt, bridgehub.address, 324n, x, refund, assetRouter, nativeTokenVault]);
    await deployer.sendTransaction({ to: predicted, value: parseEther('0.2') });

    await publicClient.waitForTransactionReceipt({
      hash: await factory.write.deploy([salt, bridgehub.address, 324n, x, refund, assetRouter, nativeTokenVault])
    });

    const forwarder = await viem.getContractAt('StealthForwarderL1', predicted);
    await publicClient.waitForTransactionReceipt({
      hash: await forwarder.write.sweepETH([parseEther('0.01'), parseEther('0.2'), 500000n, 800n], {
        account: relayer.account,
        value: parseEther('0.01')
      })
    });

    expect(await bridgehub.read.directL2Contract()).to.equal(x);
    expect(await bridgehub.read.directL2Value()).to.equal(parseEther('0.2'));
    expect(await bridgehub.read.directRefund()).to.equal(refund);
  });
});
