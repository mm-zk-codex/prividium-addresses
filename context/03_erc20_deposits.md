# ERC20 deposits

Let's assume that we have a token on L1, and we want to deposit it on L2.

```shell
export L1_TOKEN_ADDRESS=0xf10A110E59a22b444c669C83b02f0E6d945b2b69

export BRIDGEHUB_ADDRESS=0xaab95dfc116d9d9d9dd931cda1fd4142db135365
export SOURCE_ADDRESS=0x36615Cf349d7F6344891B1e7CA7C72883F5dc049
export L2_RPC=http://localhost:3050
export L1_RPC=http://localhost:5010
export L2_CHAIN_ID=6565
```

First, let's do a sanity check, to see that sender has the token:

```shell
cast call -r $L1_RPC $L1_TOKEN_ADDRESS 'balanceOf(address)(uint256)'  $SOURCE_ADDRESS
```

Should be > 0.

## Setup

### Collecting other addresses



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


### Registering the token

This has to be done once, and this is permisionless.

```shell
cast send -r $L1_RPC $NATIVE_TOKEN_VAULT "registerToken(address)" $L1_TOKEN_ADDRESS --private-key $PRIVATE_KEY
```

Once it is done, we can get the token asset id:


```shell
cast call -r $L1_RPC $NATIVE_TOKEN_VAULT "assetId(address)(bytes32)" $L1_TOKEN_ADDRESS
> 0x198fcafa5658c622ae2bfb85de297fe3801b608ae17e263bcaa8f286799918a4
export TOKEN_ASSET_ID=0x198fcafa5658c622ae2bfb85de297fe3801b608ae17e263bcaa8f286799918a4
```

## Deposit

First, we have to approve the token (when we deposit the token, on L1 it is being stored in native token vault).
We'll deposit 123 units, so that's how much we have to approve.

```shell
cast send -r $L1_RPC  $L1_TOKEN_ADDRESS "approve(address,uint256)" $NATIVE_TOKEN_VAULT 123 --private-key $PRIVATE_KEY
```

Now let's create a payload (to whom, and how much). Last field is not needed in our case. We'll deposit 123 units into $SOURCE_ADDRESS on the destination chain.

```shell
DEPOSIT_DATA=$(cast abi-encode "f(uint256,address,address)" 123 $SOURCE_ADDRESS 0x0000000000000000000000000000000000000000)
```
Now we have to wrap it into the bridge calldata:

```shell
ENCODED=$(cast abi-encode "f(bytes32,bytes)" $TOKEN_ASSET_ID $DEPOSIT_DATA)
BRIDGE_CALLDATA=$(echo 0x01${ENCODED:2})
```

And we're ready to execute:

```shell
cast send -r $L1_RPC $BRIDGEHUB_ADDRESS "requestL2TransactionTwoBridges((uint256,uint256,uint256, uint256, uint256, address, address, uint256, bytes))" "($L2_CHAIN_ID,825000000000000,0,3000000,800, $SOURCE_ADDRESS, $ASSET_ROUTER, 0, $BRIDGE_CALLDATA)" --value 825000000000000 --private-key $PRIVATE_KEY
```

Here we specify a lot higher value - as we set 3m gas (the first call has to pay for creation of the contract on the destination chain).

## Final checks.


Now let's see on L2. First get the address of our token on L2:

```shell
cast call -r $L2_RPC $L2_NATIVE_TOKEN_VAULT "tokenAddress(bytes32)(address)" $TOKEN_ASSET_ID
> 0xFf624454c43E44eaF1F6A25189815A22a84d9Fb5
export L2_TOKEN_ADDRESS=0xFf624454c43E44eaF1F6A25189815A22a84d9Fb5
```

And then check the balance:

```shell
cast call -r $L2_RPC $L2_TOKEN_ADDRESS "balanceOf(address)(uint256)" $SOURCE_ADDRESS
```
It should be 123.