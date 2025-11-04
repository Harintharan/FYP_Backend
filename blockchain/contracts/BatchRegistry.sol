// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BatchRegistry {
    address public owner;

    struct BatchMeta {
        bytes32 hash;
        uint256 createdAt;
        uint256 updatedAt;
        address createdBy;
        address updatedBy;
    }

    mapping(bytes16 => BatchMeta) public batches;

    event BatchRegistered(
        bytes16 indexed batchId,
        bytes32 hash,
        address createdBy,
        uint256 createdAt
    );

    event BatchUpdated(
        bytes16 indexed batchId,
        bytes32 newHash,
        address updatedBy,
        uint256 updatedAt
    );

    constructor() {
        owner = msg.sender;
    }

    function registerBatch(bytes16 batchId, bytes calldata canonicalPayload)
        external
        returns (bytes16)
    {
        require(batches[batchId].createdAt == 0, "Batch already exists");

        bytes32 hash = keccak256(canonicalPayload);

        batches[batchId] = BatchMeta({
            hash: hash,
            createdAt: block.timestamp,
            updatedAt: 0,
            createdBy: msg.sender,
            updatedBy: address(0)
        });

        emit BatchRegistered(batchId, hash, msg.sender, block.timestamp);
        return batchId;
    }

    function updateBatch(bytes16 batchId, bytes calldata canonicalPayload)
        external
    {
        require(batches[batchId].createdAt != 0, "Batch does not exist");

        bytes32 newHash = keccak256(canonicalPayload);

        BatchMeta storage meta = batches[batchId];
        meta.hash = newHash;
        meta.updatedAt = block.timestamp;
        meta.updatedBy = msg.sender;

        emit BatchUpdated(batchId, newHash, msg.sender, block.timestamp);
    }

    function getBatch(bytes16 batchId)
        external
        view
        returns (BatchMeta memory)
    {
        require(batches[batchId].createdAt != 0, "Batch does not exist");
        return batches[batchId];
    }
}
