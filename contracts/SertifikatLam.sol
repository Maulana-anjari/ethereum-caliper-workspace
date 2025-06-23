// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.3/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.3/contracts/access/Ownable.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.9.3/contracts/utils/Counters.sol";

contract SertifikatLam is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private tokenIds_;

    address public admin;
    mapping(address => bool) public minters;
    mapping(bytes32 => bool) private isBurned;
    mapping(bytes32 => uint256) private tokenIdLam;

    // Array to track all minted token IDs
    uint256[] private allTokens;
    // Mapping to track token metadata
    mapping(uint256 => MetadataLAM) private tokenMetadata;

    event LAMMinted(
        uint256 indexed tokenId,
        address mintedTo
    );

    event MinterAdded(address minter);
    event MinterRemoved(address minter);
    event AdminChanged(address newAdmin);

    struct MetadataLAM {
        string codeUniv;
        string codeProdi;
        string akreditasi;
        string mulaiBerlaku;
        string akhirBerlaku;
        string skNumber;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Hanya admin yang bisa pakai fungsi ini");
        _;
    }

    modifier onlyMinter() {
        require(minters[msg.sender], "Hanya minter can bisa pakai fungsi ini");
        _;
    }

    constructor() ERC721("SertifikatLam", "SRTL") {
        admin = msg.sender;
    }

    function setAdmin(address newAdmin) external onlyOwner {
        require(newAdmin != address(0), "Invalid admin address");
        admin = newAdmin;
        emit AdminChanged(newAdmin);
    }

    function addMinter(address minter) external onlyAdmin {
        require(minter != address(0), "Invalid minter address");
        minters[minter] = true;
        emit MinterAdded(minter);
    }

    function removeMinter(address minter) external onlyAdmin {
        minters[minter] = false;
        emit MinterRemoved(minter);
    }

    function mint(
        string calldata uri_,
        MetadataLAM calldata metadataLam,
        address _minter
    ) external onlyMinter returns (uint256) {
        require(
            bytes(metadataLam.codeProdi).length > 0,
            "Code Prodi tidak boleh empty"
        );

        bytes32 prodiHash = keccak256(abi.encodePacked(metadataLam.codeProdi));
        require(!isBurned[prodiHash], "sertifikat lam podi ini telah di burn");

        tokenIds_.increment();
        uint256 newItemId = tokenIds_.current();

        address mintTo = admin;
        
        if (_minter != address(0)) {
            mintTo = _minter;
        }

        _safeMint(mintTo, newItemId);
        _setTokenURI(newItemId, uri_);

        tokenIdLam[prodiHash] = newItemId;
        isBurned[prodiHash] = false;

        // Store metadata untuk track token
        tokenMetadata[newItemId] = metadataLam;
        allTokens.push(newItemId);

        emit LAMMinted(
            newItemId,
            mintTo
        );

        return newItemId;
    }

    function burn(uint256 tokenId) external {
        require(
            msg.sender == admin || minters[msg.sender],
            "hanya admin atau minter yang bisa burn"
        );
        require(ownerOf(tokenId) != address(0), "sertifikat tidak tersedia");

        bytes32 prodiHash = keccak256(abi.encodePacked(tokenURI(tokenId)));
        isBurned[prodiHash] = true;

        // Remove from allTokens array
        for (uint i = 0; i < allTokens.length; i++) {
            if (allTokens[i] == tokenId) {
                allTokens[i] = allTokens[allTokens.length - 1];
                allTokens.pop();
                break;
            }
        }

        _burn(tokenId);
    }

    // Get sertifikat by ID
    function getSertifikat(
        uint256 tokenId
    )
        external
        view
        returns (
            MetadataLAM memory metadata,
            string memory uri,
            address owner,
            bool exists
        )
    {
        if (ownerOf(tokenId) != address(0)) {
            return (
                tokenMetadata[tokenId],
                tokenURI(tokenId),
                ownerOf(tokenId),
                true
            );
        }
        return (MetadataLAM("", "", "", "", "", ""), "", address(0), false);
    }

    // Get all sertifikat
    function getAllSertifikat()
        external
        view
        returns (
            uint256[] memory tokenIds,
            MetadataLAM[] memory metadata,
            string[] memory uris,
            address[] memory owners
        )
    {
        uint256 totalTokens = allTokens.length;

        metadata = new MetadataLAM[](totalTokens);
        uris = new string[](totalTokens);
        owners = new address[](totalTokens);

        for (uint i = 0; i < totalTokens; i++) {
            uint256 tokenId = allTokens[i];
            metadata[i] = tokenMetadata[tokenId];
            uris[i] = tokenURI(tokenId);
            owners[i] = ownerOf(tokenId);
        }

        return (allTokens, metadata, uris, owners);
    }

    // Get total sertifikat
    function getTotalSertifikat() external view returns (uint256) {
        return allTokens.length;
    }

    // Check jika sertifikat exists
    function sertifikatExists(uint256 tokenId) external view returns (bool) {
        return ownerOf(tokenId) != address(0);
    }
}
