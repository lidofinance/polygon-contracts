// SPDX-FileCopyrightText: 2021 ShardLabs
// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;

import "../interfaces/IRateProvider.sol";
import "../interfaces/IFxStateChildTunnel.sol";

/**
 * @title RateProvider
 */
contract RateProvider is IRateProvider {
    IFxStateChildTunnel public fxChild;

    constructor(IFxStateChildTunnel _fxChild) {
        fxChild = _fxChild;
    }

    function getRate() external override view returns (uint256) {
        (uint256 stMATIC, uint256 MATIC) = fxChild.getReserves();
        return MATIC * 1 ether / stMATIC;
    }
}
