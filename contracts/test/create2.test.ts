import { expect } from 'chai';
import { encodeAbiParameters, keccak256, parseEther, toHex } from 'viem';
import hre from 'hardhat';

describe('ForwarderFactory', function () {
  it('computeAddress matches deployed address and sweep routes to treasury', async function () {
    const { viem } = hre;
    const [_, recipient, treasury, sender] = await viem.getWalletClients();

    const adapter = await viem.deployContract('BridgeAdapterMock', [treasury.account.address]);
    const factory = await viem.deployContract('ForwarderFactory');

    const forwarderArtifact = await hre.artifacts.readArtifact('StealthForwarder');
    const initCode = `${forwarderArtifact.bytecode}${encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }],
      [recipient.account.address, adapter.address]
    ).slice(2)}` as `0x${string}`;

    const salt = keccak256(toHex('phase1'));
    const predicted = await factory.read.computeAddress([salt, initCode]);

    await sender.sendTransaction({ to: predicted, value: parseEther('0.05') });
    const publicClient = await viem.getPublicClient();
    expect(await publicClient.getBalance({ address: predicted })).to.equal(parseEther('0.05'));

    const deployHash = await factory.write.deploy([salt, recipient.account.address, adapter.address]);
    await publicClient.waitForTransactionReceipt({ hash: deployHash });

    const code = await publicClient.getCode({ address: predicted });
    expect(code).to.not.equal(undefined);
    expect(code).to.not.equal('0x');

    const forwarder = await viem.getContractAt('StealthForwarder', predicted);
    const before = await publicClient.getBalance({ address: treasury.account.address });
    const sweepHash = await forwarder.write.sweepNative([toHex('tracking-1')]);
    await publicClient.waitForTransactionReceipt({ hash: sweepHash });
    const after = await publicClient.getBalance({ address: treasury.account.address });

    expect(after - before).to.equal(parseEther('0.05'));
    expect(await publicClient.getBalance({ address: predicted })).to.equal(0n);
  });
});
