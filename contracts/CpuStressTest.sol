// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

contract CpuStressTest {
    // Operasi Tulis dengan Komputasi Berat
    function calculate(uint256 iterations) public pure returns (uint256) {
        uint256 result = 0;
        for (uint i = 0; i < iterations; i++) {
            // Lakukan operasi matematika sederhana berulang kali
            result = result + i * 2 - i;
        }
        return result;
    }
}