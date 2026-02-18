# ERC20 withdrawals

Now let's try to withdraw ERC20 tokens from L2 to L1.

```shell
export SOURCE_ADDRESS=0x36615Cf349d7F6344891B1e7CA7C72883F5dc049
export L2_TOKEN_ADDRESS=0x5C9b194733b9D6A93c51B3F313A2029873426740
export L2_RPC=http://localhost:3050
export L2_ASSET_ROUTER=0x0000000000000000000000000000000000010003
export L2_NATIVE_TOKEN_VAULT=0x0000000000000000000000000000000000010004
```


Sanity check, we should have >0 tokens:

```shell
cast call -r $L2_RPC $L2_TOKEN_ADDRESS "balanceOf(address)(uint256)" $SOURCE_ADDRESS
```


## Setup

Let's get asset id first:

```shell
cast call -r $L2_RPC $L2_NATIVE_TOKEN_VAULT "assetId(address)(bytes32)" $L2_TOKEN_ADDRESS
```

If asset id is not present, we should 'register' the token (needs to be done once, and is permisionless).

```shell
cast send -r $L2_RPC $L2_NATIVE_TOKEN_VAULT "registerToken(address)" $L2_TOKEN_ADDRESS --private-key $PRIVATE_KEY
```

And then we should see the asset id:

```shell
cast call -r $L2_RPC $L2_NATIVE_TOKEN_VAULT "assetId(address)(bytes32)" $L2_TOKEN_ADDRESS
> 0x2273b9b5a8e719e6b1e23f5329fed0e1017deacde6fda5919ac6c42785c4c61e
export ASSET_ID=0x2273b9b5a8e719e6b1e23f5329fed0e1017deacde6fda5919ac6c42785c4c61e
```



## Withdrawal

Now let's do the withdrawal:

First approve token spend:

```shell
cast send -r $L2_RPC  $L2_TOKEN_ADDRESS "approve(address,uint256)" $L2_NATIVE_TOKEN_VAULT 85 --private-key $PRIVATE_KEY
```

And then create the withdrawal data, and call the asset router.

```shell
WITHDRAW_DATA=$(cast abi-encode "f(uint256,address,address)" 85 $SOURCE_ADDRESS 0x0000000000000000000000000000000000000000)
cast send -r $L2_RPC $L2_ASSET_ROUTER "withdraw(bytes32, bytes)" $ASSET_ID $WITHDRAW_DATA --private-key $PRIVATE_KEY
```

Store the transaction hash as `$WITHDRAW_TX_HASH`.


Now you should wait until this block is included in the batch, and proven & executed on L1.


## L1

Now let's find the address on destination chain

```shell
export L1_RPC=http://localhost:5010
export BRIDGEHUB_ADDRESS=0xaab95dfc116d9d9d9dd931cda1fd4142db135365
export L2_CHAIN_ID=6565
```

```shell
cast call -r $L1_RPC $BRIDGEHUB_ADDRESS "assetRouter()(address)"   
> 0xe6438F51c0cb23fA454985C6AdFd6b5A634Cd79B
export ASSET_ROUTER=0xe6438F51c0cb23fA454985C6AdFd6b5A634Cd79B
```

```shell
cast call -r $L1_RPC $ASSET_ROUTER "nativeTokenVault()(address)"
> 0x8e33D84723d161b79A2324FFF96393Ac63A85893
export NATIVE_TOKEN_VAULT=0x8e33D84723d161b79A2324FFF96393Ac63A85893
```


### Collecing proofs and data

This proof will be there only once batch is finalized.

```shell
curl --request POST \
  --url $L2_RPC \
  --header 'Content-Type: application/json' \
  --data '{
      "jsonrpc": "2.0",
      "id": 1,
      "method": "zks_getL2ToL1LogProof",
      "params": [
        $WITHDRAW_TX_HASH,
        0
      ]
    }'
```

Get proof & batch number.

```shell
export PROOF=...
export BATCH_NUMBER=...
```

Get withdrawal message from the logs: look for one from `0x..8008` with topic starting with `0x3a36e472`. Then take its data as LOG_DATA and run:

```
export MESSAGE=$(cast abi-decode 'x()(bytes)' $LOG_DATA)
```

```shell
cast call -r $L1_RPC $ASSET_ROUTER "L1_NULLIFIER()(address)"
> 0x8AF03418FBb71ba82D850a53C8019e358f0d1608
export NULLIFIER=0x8AF03418FBb71ba82D850a53C8019e358f0d1608
```


Check if all the arguments were correct:
```shell
cast call -r $L1_RPC $NULLIFIER "finalizeDeposit((uint256,uint256,uint256,address,uint16,bytes,bytes32[]))" "($L2_CHAIN_ID,$BATCH_NUMBER,0,$L2_ASSET_ROUTER,0,$MESSAGE,$PROOF)"
```

And then finally:

```shell
cast send -r $L1_RPC $NULLIFIER "finalizeDeposit((uint256,uint256,uint256,address,uint16,bytes,bytes32[]))" "($L2_CHAIN_ID,$BATCH_NUMBER,0,$L2_ASSET_ROUTER,0,$MESSAGE,$PROOF)" --private-key
```


And now let's check:

```shell
cast call -r $L1_RPC $NATIVE_TOKEN_VAULT "tokenAddress(bytes32)(address)" $ASSET_ID
> 0x7C72aB27AFA1C082AF2E6c6AB61C71D0578e294d
export L1_TOKEN_ADDRESS=0x7C72aB27AFA1C082AF2E6c6AB61C71D0578e294d

cast call -r $L1_RPC $L1_TOKEN_ADDRESS "balanceOf(address)(uint256)" $SOURCE_ADDRESS
```
And this should show 85.

