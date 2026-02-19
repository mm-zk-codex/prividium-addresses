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
        L2TransactionRequestDirect calldata request
    ) external payable returns (bytes32) {
        directChainId = request.chainId;
        directMintValue = request.mintValue;
        directL2Contract = request.l2Contract;
        directL2Value = request.l2Value;
        directRefund = request.refundRecipient;
        return keccak256(abi.encodePacked("direct", block.number, msg.value));
    }

    function requestL2TransactionTwoBridges(
        L2TransactionRequestTwoBridgesOuter calldata request
    ) external payable returns (bytes32) {
        lastTwoBridges = request;
        return keccak256(abi.encodePacked("two", block.number, msg.value));
    }
}
