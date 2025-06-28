// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

contract CpuStressTest {
    uint256 public latestResult;
    uint256 public totalCalculations;

    // This function performs heavy calculations and then writes to state.
    function calculate(uint256 iterations) public {
        uint256 result = 0;
        for (uint i = 0; i < iterations; i++) {
            // Some arbitrary math to consume CPU cycles
            result += (i * 2) / (i + 1);
        }
        
        // Write the result to storage to make this a state-changing transaction
        latestResult = result;
        totalCalculations++;
    }
}