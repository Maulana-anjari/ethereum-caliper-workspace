// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.3/contracts/token/ERC721/ERC721.sol";

contract BenchmarkNFT is ERC721 {
    uint256 private _nextTokenId;

    constructor() ERC721("Benchmark NFT", "BNFT") {}

    // Operasi Tulis (Write)
    function mintItem(address to) public {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
    }
}