// SPDX-FileCopyrightText: 2021 ShardLabs
// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

interface IAdminUpgradeabilityProxy {
    function upgrade(address proxy, address impl) external;

    function getProxyImplementation(address proxy)
        external
        view
        returns (address);
}
