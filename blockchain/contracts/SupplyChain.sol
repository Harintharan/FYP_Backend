// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SupplyChain {
    address public owner;

    enum Role { None, Manufacturer, Transporter, Retailer, Regulator }

    struct User {
        bytes32 detailsHash; 
        Role role;
        uint256 registeredAt;
        bool active;
    }

    struct Product {
        bytes32 hash;
        uint256 timestamp;
        address creator;
    }

    struct ProductBatch {
        bytes32 hash;
        uint256 timestamp;
        address creator;
    }

    mapping(address => User) public users;
    mapping(uint256 => Product) public products;
    mapping(uint256 => ProductBatch) public batches;

    event UserRegistered(address user, Role role, bytes32 detailsHash);
    event UserRevoked(address user);
    event ProductStored(uint256 indexed productId, bytes32 hash, address creator, uint256 timestamp);
    event BatchStored(uint256 indexed productId, bytes32 hash, address creator, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not contract owner");
        _;
    }

    modifier onlyAuthorized(Role role) {
        require(users[msg.sender].active, "Not registered");
        require(users[msg.sender].role == role, "Wrong role");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function registerUser(address user, Role role, bytes32 detailsHash) external onlyOwner {
        users[user] = User(detailsHash, role, block.timestamp, true);
        emit UserRegistered(user, role, detailsHash);
    }

    function revokeUser(address user) external onlyOwner {
        users[user].active = false;
        emit UserRevoked(user);
    }


      // ----------- Product Management -----------
    function storeProduct(
        uint256 productId,
        string memory name,
        string memory manufacturer,
        string memory details
    ) external onlyAuthorized(Role.Manufacturer) {
        bytes32 hash = keccak256(abi.encodePacked(name, manufacturer, details));
        products[productId] = Product(hash, block.timestamp, msg.sender);
        emit ProductStored(productId, hash, msg.sender, block.timestamp);
    }

    function getProduct(uint256 productId) external view returns (bytes32, uint256, address) {
        Product memory p = products[productId];
        return (p.hash, p.timestamp, p.creator);
    }


    function storeBatch(uint256 productId, bytes32 batchHash) external onlyAuthorized(Role.Manufacturer) {
        batches[productId] = ProductBatch(batchHash, block.timestamp, msg.sender);
        emit BatchStored(productId, batchHash, msg.sender, block.timestamp);
    }

    function getBatch(uint256 productId) external view returns (bytes32, uint256, address) {
        ProductBatch memory b = batches[productId];
        return (b.hash, b.timestamp, b.creator);
    }
}
