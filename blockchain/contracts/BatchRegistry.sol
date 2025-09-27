// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BatchRegistry {
    address public owner;
    uint256 public nextBatchId = 1;

    struct Batch {
        string productCategory;
        string manufacturerUUID;
        string facility;
        string productionWindow;
        string quantityProduced;
        string releaseStatus;

        bytes32 hash;
        uint256 createdAt;
        uint256 updatedAt;
        address createdBy;
        address updatedBy;
    }

    mapping(uint256 => Batch) public batches;

    event BatchRegistered(
        uint256 indexed batchId,
        bytes32 hash,
        address createdBy,
        uint256 createdAt
    );

    event BatchUpdated(
        uint256 indexed batchId,
        bytes32 newHash,
        address updatedBy,
        uint256 updatedAt
    );

    constructor() {
        owner = msg.sender;
    }

    // 🔹 Register a new batch
    function registerBatch(
        string memory productCategory,
        string memory manufacturerUUID,
        string memory facility,
        string memory productionWindow,
        string memory quantityProduced,
        string memory releaseStatus
    ) external returns (uint256) {
        uint256 batchId = nextBatchId++;

        bytes32 hash = keccak256(
            abi.encodePacked(
                productCategory,
                manufacturerUUID,
                facility,
                productionWindow,
                quantityProduced,
                releaseStatus
            )
        );

        batches[batchId] = Batch(
            productCategory,
            manufacturerUUID,
            facility,
            productionWindow,
            quantityProduced,
            releaseStatus,
            hash,
            block.timestamp,
            0,
            msg.sender,
            address(0)
        );

        emit BatchRegistered(batchId, hash, msg.sender, block.timestamp);
        return batchId;
    }

    // 🔹 Update an existing batch
    function updateBatch(
        uint256 batchId,
        string memory productCategory,
        string memory manufacturerUUID,
        string memory facility,
        string memory productionWindow,
        string memory quantityProduced,
        string memory releaseStatus
    ) external {
        require(batches[batchId].createdAt != 0, "Batch does not exist");

        bytes32 newHash = keccak256(
            abi.encodePacked(
                productCategory,
                manufacturerUUID,
                facility,
                productionWindow,
                quantityProduced,
                releaseStatus
            )
        );

        Batch storage b = batches[batchId];
        b.productCategory = productCategory;
        b.manufacturerUUID = manufacturerUUID;
        b.facility = facility;
        b.productionWindow = productionWindow;
        b.quantityProduced = quantityProduced;
        b.releaseStatus = releaseStatus;
        b.hash = newHash;
        b.updatedAt = block.timestamp;
        b.updatedBy = msg.sender;

        emit BatchUpdated(batchId, newHash, msg.sender, block.timestamp);
    }

    // 🔹 Get a batch by ID
    function getBatch(uint256 batchId) external view returns (bytes32, Batch memory) {
        require(batches[batchId].createdAt != 0, "Batch does not exist");
        return (batches[batchId].hash, batches[batchId]);
    }
}
