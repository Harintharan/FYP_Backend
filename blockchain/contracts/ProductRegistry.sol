// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ProductRegistry {
    address public owner;

    struct ProductMeta {
        bytes32 hash;
        uint256 createdAt;
        uint256 updatedAt;
        address createdBy;
        address updatedBy;
    }

    mapping(bytes16 => ProductMeta) public products;

    event ProductRegistered(
        bytes16 indexed productId,
        bytes32 hash,
        address createdBy,
        uint256 createdAt
    );

    event ProductUpdated(
        bytes16 indexed productId,
        bytes32 newHash,
        address updatedBy,
        uint256 updatedAt
    );

    constructor() {
        owner = msg.sender;
    }

    function registerProduct(bytes16 productId, bytes calldata canonicalPayload)
        external
        returns (bytes16)
    {
        require(products[productId].createdAt == 0, "Product already exists");

        bytes32 hash = keccak256(canonicalPayload);

        products[productId] = ProductMeta({
            hash: hash,
            createdAt: block.timestamp,
            updatedAt: 0,
            createdBy: msg.sender,
            updatedBy: address(0)
        });

        emit ProductRegistered(productId, hash, msg.sender, block.timestamp);
        return productId;
    }

    function updateProduct(bytes16 productId, bytes calldata canonicalPayload)
        external
    {
        require(products[productId].createdAt != 0, "Product does not exist");

        bytes32 newHash = keccak256(canonicalPayload);

        ProductMeta storage prod = products[productId];
        prod.hash = newHash;
        prod.updatedAt = block.timestamp;
        prod.updatedBy = msg.sender;

        emit ProductUpdated(productId, newHash, msg.sender, block.timestamp);
    }

    function getProduct(bytes16 productId)
        external
        view
        returns (ProductMeta memory)
    {
        require(products[productId].createdAt != 0, "Product does not exist");
        return products[productId];
    }
}
