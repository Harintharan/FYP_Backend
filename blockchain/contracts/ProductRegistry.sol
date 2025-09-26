

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ProductRegistry {
    address public owner;
    uint256 public nextProductId = 1;

    struct ProductMeta {
        bytes32 hash;       // integrity hash from DB
        uint256 createdAt;
        uint256 updatedAt;
        address createdBy;
        address updatedBy;
    }

    mapping(uint256 => ProductMeta) public products;

    event ProductRegistered(uint256 indexed productId, bytes32 hash, address createdBy, uint256 createdAt);
    event ProductUpdated(uint256 indexed productId, bytes32 newHash, address updatedBy, uint256 updatedAt);

    constructor() {
        owner = msg.sender;
    }

    // 🔹 Register a new product with hash
    function registerProduct(bytes32 dbHash) external returns (uint256) {
        uint256 productId = nextProductId++;

        products[productId] = ProductMeta({
            hash: dbHash,
            createdAt: block.timestamp,
            updatedAt: 0,
            createdBy: msg.sender,
            updatedBy: address(0)
        });

        emit ProductRegistered(productId, dbHash, msg.sender, block.timestamp);
        return productId;
    }

    // 🔹 Update an existing product’s hash
    function updateProduct(uint256 productId, bytes32 newHash) external {
        require(products[productId].createdAt != 0, "Product does not exist");

        ProductMeta storage prod = products[productId];
        prod.hash = newHash;
        prod.updatedAt = block.timestamp;
        prod.updatedBy = msg.sender;

        emit ProductUpdated(productId, newHash, msg.sender, block.timestamp);
    }

    // 🔹 Get product hash and metadata
    function getProduct(uint256 productId) external view returns (ProductMeta memory) {
        return products[productId];
    }
}

