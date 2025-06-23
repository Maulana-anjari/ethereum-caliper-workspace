// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

contract BenchmarkERC20 {
    mapping(address => uint256) public balances;
    uint256 public totalSupply;

    constructor() {
        // Beri deployer pasokan awal yang besar untuk didistribusikan
        totalSupply = 1_000_000_000 * 10**18;
        balances[msg.sender] = totalSupply;
    }

    // Operasi Tulis (Write)
    function transfer(address to, uint256 amount) public {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        balances[to] += amount;
    }
}