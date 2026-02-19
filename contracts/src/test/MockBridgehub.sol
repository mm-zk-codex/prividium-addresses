// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBridgehub} from "../l1/StealthForwarderL1.sol";

contract MockBridgehub is IBridgehub {
    uint256 public directChainId;
    uint256 public directMintValue;
    address public directL2Contract;
    uint256 public directL2Value;
    address public directRefund;

    L2TransactionRequestTwoBridgesOuter public lastTwoBridges;

    function requestL2TransactionDirect(
        uint256 chainId,
        uint256 mintValue,
        address l2Contract,
        uint256 l2Value,
        bytes calldata,
        uint256,
        uint256,
        bytes[] calldata,
        address refundRecipient
    ) external payable returns (bytes32) {
        directChainId = chainId;
        directMintValue = mintValue;
        directL2Contract = l2Contract;
        directL2Value = l2Value;
        directRefund = refundRecipient;
        return keccak256(abi.encodePacked("direct", block.number, msg.value));
    }

    function requestL2TransactionTwoBridges(
        L2TransactionRequestTwoBridgesOuter calldata request
    ) external payable returns (bytes32) {
        lastTwoBridges = request;
        return keccak256(abi.encodePacked("two", block.number, msg.value));
    }
}
