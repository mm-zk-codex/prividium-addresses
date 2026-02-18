
## Burning assets - L2AssetRouter

To withdraw funds, we'll have to interact with L2AssetRouter, which is deployed at a constant address 0x10003 (or `0x0000000000000000000000000000000000010003` to be exact).

```shell
export L2_ASSET_ROUTER=0x0000000000000000000000000000000000010003
```

We will be calling `function withdraw(bytes32 _assetId, bytes memory _assetData)`.

So the first step, is to get the assetId.

AssetId is the unique identifier of the asset in the ecosystem (think about it as a hash of original chain id where asset was minted, and the address on that chain).

As we're trying to withdraw base token, we can call the `BASE_TOKEN_ASSET_ID` to get the information. (for non-base tokens, there are different methods, that we'll cover in future articles).

```shell
cast call -r http://localhost:3050 0x0000000000000000000000000000000000010003 'BASE_TOKEN_ASSET_ID()'
# result: 0x8df3463b1850eb1d8d1847743ea155aef6b16074db8ba81d897dc30554fb2085
export BASE_TOKEN_ID=0x8df3463b1850eb1d8d1847743ea155aef6b16074db8ba81d897dc30554fb2085
```

The assetData, is coming from DataEncoding library, and is equal to:

```sol
return abi.encode(_amount, _remoteReceiver, _maybeTokenAddress);
```

So let's create this payload first:

```shell
cast abi-encode "x(uint256,address,address)" 100 $DESTINATION_ADDRESS 0x0000000000000000000000000000000000000000

# result: 0x0000000000000000000000000000000000000000000000000000000000000064000000000000000000000000f3f011f9ab6252f9aad3a472e47d365e85e334370000000000000000000000000000000000000000000000000000000000000000
export ASSET_DATA=...
```

Now we can call the withdrawal method:

```
cast call -r http://localhost:3050 $L2_ASSET_ROUTER "withdraw(bytes32, bytes)" $BASE_TOKEN_ID $ASSET_DATA
```