# Setup

You need 2 things:

* running zksync-os-server (see instructions in zksync-os-server repo - you'll start anvil and zksync-os-server)
* 'cast' and 'forge' tools (from foundry)

## Checking rich accounts

When you start using instructions above, the account below should have funds on both L1 and L2:

```shell
export PRIVATE_KEY=0x7726827caac94a7f9e1b160f7ea819f172f7b6f9d2a97f992c38edeab82d4110
export ACCOUNT_ID=0x36615Cf349d7F6344891B1e7CA7C72883F5dc049
```

Let's check:

```shell
# Calling anvil (L1)
cast balance $ACCOUNT_ID
# Calling zkos (L2)
cast balance -r http://localhost:3050 $ACCOUNT_ID
```

Both should be > 0

## Bridgehub contract

We have to get the bridgehub contract.

```shell
curl http://localhost:3050 -X POST -H "Content-Type: application/json" --data '{"method":"zks_getBridgehubContract","params":[""],"id":1,"jsonrpc":"2.0"}'

# example response: {"jsonrpc":"2.0","id":1,"result":"0xa2c7cb747b91c0064eccbcac58b65d439e014263"}%
export BRIDGEHUB_ADDRESS=0xa2c7cb747b91c0064eccbcac58b65d439e014263
```

## L2 Chain id

```shell
cast chain-id -r http://localhost:3050
# should be 270
export L2_CHAIN_ID=270
```
