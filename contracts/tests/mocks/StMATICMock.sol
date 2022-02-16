// SPDX-FileCopyrightText: 2021 ShardLabs
// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "../../StMATIC.sol";

contract StMATICMock is StMATIC {
    address public operator;

    function setOperator(address _operator) public {
        operator = _operator;
    }

    function claimTokens2StMatic(address) public {
        require(operator != address(0), "Operator address not set");
    }
}
