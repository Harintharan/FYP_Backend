// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CheckpointRegistry {
    address public owner;
    uint256 public nextCheckpointId = 1;

    struct CheckpointMeta {
        bytes32 hash;        // integrity hash from DB
        uint256 createdAt;
        uint256 updatedAt;
        address createdBy;
        address updatedBy;
    }

    mapping(uint256 => CheckpointMeta) public checkpoints;

    event CheckpointRegistered(
        uint256 indexed checkpointId,
        bytes32 hash,
        address createdBy,
        uint256 createdAt
    );

    event CheckpointUpdated(
        uint256 indexed checkpointId,
        bytes32 newHash,
        address updatedBy,
        uint256 updatedAt
    );

    constructor() {
        owner = msg.sender;
    }

    // 🔹 Register a new checkpoint
    function registerCheckpoint(bytes32 dbHash) external returns (uint256) {
        uint256 checkpointId = nextCheckpointId++;

        checkpoints[checkpointId] = CheckpointMeta({
            hash: dbHash,
            createdAt: block.timestamp,
            updatedAt: 0,
            createdBy: msg.sender,
            updatedBy: address(0)
        });

        emit CheckpointRegistered(checkpointId, dbHash, msg.sender, block.timestamp);
        return checkpointId;
    }

    // 🔹 Update existing checkpoint
    function updateCheckpoint(uint256 checkpointId, bytes32 newHash) external {
        require(checkpoints[checkpointId].createdAt != 0, "Checkpoint does not exist");

        CheckpointMeta storage cp = checkpoints[checkpointId];
        cp.hash = newHash;
        cp.updatedAt = block.timestamp;
        cp.updatedBy = msg.sender;

        emit CheckpointUpdated(checkpointId, newHash, msg.sender, block.timestamp);
    }

    // 🔹 Get checkpoint
    function getCheckpoint(uint256 checkpointId) external view returns (CheckpointMeta memory) {
        return checkpoints[checkpointId];
    }
}
