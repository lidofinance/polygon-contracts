// SPDX-FileCopyrightText: 2021 ShardLabs
// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

contract StMATICMock {
    address public operator;
    event WithdrawTotalDelegated();

    function setOperator(address _operator) public {
        operator = _operator;
    }

    function claimTokens2StMatic(address) public view {
        require(operator != address(0), "Operator address not set");
    }

    function withdrawTotalDelegated(address) public {
        emit WithdrawTotalDelegated();
    }
}
