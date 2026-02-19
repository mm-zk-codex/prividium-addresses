// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract BridgeAdapterMock {
    address public immutable treasury;

    event Bridged(address indexed recipient, uint256 amount, bytes metadata);

    constructor(address treasury_) {
        require(treasury_ != address(0), "treasury=0");
        treasury = treasury_;
    }

    function bridgeNative(address recipient, bytes calldata metadata) external payable {
        uint256 amount = msg.value;
        (bool ok, ) = treasury.call{value: amount}("");
        require(ok, "treasury transfer failed");
        emit Bridged(recipient, amount, metadata);
    }
}
