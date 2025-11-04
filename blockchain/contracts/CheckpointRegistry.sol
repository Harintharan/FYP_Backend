// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CheckpointRegistry {
    address public owner;

    struct CheckpointMeta {
        bytes32 hash;
        uint256 createdAt;
        uint256 updatedAt;
        address createdBy;
        address updatedBy;
    }

    mapping(bytes16 => CheckpointMeta) public checkpoints;

    event CheckpointRegistered(
        bytes16 indexed checkpointId,
        bytes32 hash,
        address createdBy,
        uint256 createdAt
    );

    event CheckpointUpdated(
        bytes16 indexed checkpointId,
        bytes32 newHash,
        address updatedBy,
        uint256 updatedAt
    );

    constructor() {
        owner = msg.sender;
    }

    function registerCheckpoint(bytes16 checkpointId, bytes calldata canonicalPayload)
        external
        returns (bytes16)
    {
        require(checkpoints[checkpointId].createdAt == 0, "Checkpoint already exists");

        bytes32 hash = keccak256(canonicalPayload);

        checkpoints[checkpointId] = CheckpointMeta({
            hash: hash,
            createdAt: block.timestamp,
            updatedAt: 0,
            createdBy: msg.sender,
            updatedBy: address(0)
        });

        emit CheckpointRegistered(checkpointId, hash, msg.sender, block.timestamp);
        return checkpointId;
    }

    function updateCheckpoint(bytes16 checkpointId, bytes calldata canonicalPayload) external {
        require(checkpoints[checkpointId].createdAt != 0, "Checkpoint does not exist");

        bytes32 newHash = keccak256(canonicalPayload);

        CheckpointMeta storage cp = checkpoints[checkpointId];
        cp.hash = newHash;
        cp.updatedAt = block.timestamp;
        cp.updatedBy = msg.sender;

        emit CheckpointUpdated(checkpointId, newHash, msg.sender, block.timestamp);
    }

    function getCheckpoint(bytes16 checkpointId)
        external
        view
        returns (CheckpointMeta memory)
    {
        require(checkpoints[checkpointId].createdAt != 0, "Checkpoint does not exist");
        return checkpoints[checkpointId];
    }
}
