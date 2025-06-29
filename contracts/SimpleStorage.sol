// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

contract SimpleStorage {
    mapping(uint256 => string) public records;

    // Operasi Tulis (Write)
    function set(uint256 key, string calldata value) public {
        records[key] = value;
    }

    // Operasi Baca (Read)
    function get(uint256 key) public view returns (string memory) {
        return records[key];
    }
}