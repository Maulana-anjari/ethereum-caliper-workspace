// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.3/contracts/token/ERC721/ERC721.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.3/contracts/utils/Counters.sol";

contract BenchmarkSertifikat is ERC721 {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    // Kita tetap simpan satu state variable untuk disimulasikan
    mapping(uint256 => string) private certificateNumbers;

    constructor() ERC721("Benchmark Sertifikat", "BSRT") {}

    /**
     * @dev Fungsi minting yang disederhanakan untuk benchmark.
     * Siapa saja bisa memanggilnya berulang kali.
     * Menerima input sederhana yang mudah dibuat oleh Caliper.
     */
    function benchmarkMint(address recipient, uint256 uniqueId) public returns (uint256) {
        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();

        // Operasi tulis ke state untuk simulasi penyimpanan metadata
        certificateNumbers[newItemId] = string(abi.encodePacked("SK-", toString(uniqueId)));

        // Operasi inti minting NFT
        _safeMint(recipient, newItemId);
        
        return newItemId;
    }

    // Fungsi helper untuk mengubah uint menjadi string di dalam chain
    function toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}