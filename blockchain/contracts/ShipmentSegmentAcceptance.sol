// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ShipmentSegmentAcceptance {
    address public owner;
    uint256 public nextAcceptanceId = 1;

    struct AcceptanceMeta {
        bytes32 hash;        // integrity hash of all DB fields
        uint256 shipmentId;  // link to shipment
        uint256 createdAt;
        uint256 updatedAt;
        address createdBy;
        address updatedBy;
    }

    mapping(uint256 => AcceptanceMeta) public acceptances;

    event SegmentAccepted(
        uint256 indexed acceptanceId,
        uint256 shipmentId,
        bytes32 hash,
        address createdBy,
        uint256 createdAt
    );

    event SegmentUpdated(
        uint256 indexed acceptanceId,
        bytes32 newHash,
        address updatedBy,
        uint256 updatedAt
    );

    constructor() {
        owner = msg.sender;
    }

    /// 🔹 Register new acceptance
    function registerSegmentAcceptance(
        uint256 shipmentId,
        bytes32 dbHash
    ) external returns (uint256) {
        uint256 acceptanceId = nextAcceptanceId++;

        acceptances[acceptanceId] = AcceptanceMeta({
            hash: dbHash,
            shipmentId: shipmentId,
            createdAt: block.timestamp,
            updatedAt: 0,
            createdBy: msg.sender,
            updatedBy: address(0)
        });

        emit SegmentAccepted(acceptanceId, shipmentId, dbHash, msg.sender, block.timestamp);
        return acceptanceId;
    }

    /// 🔹 Update existing acceptance
    function updateSegmentAcceptance(uint256 acceptanceId, bytes32 newHash) external {
        require(acceptances[acceptanceId].createdAt != 0, "Acceptance does not exist");

        AcceptanceMeta storage acc = acceptances[acceptanceId];
        acc.hash = newHash;
        acc.updatedAt = block.timestamp;
        acc.updatedBy = msg.sender;

        emit SegmentUpdated(acceptanceId, newHash, msg.sender, block.timestamp);
    }

    /// 🔹 Get acceptance
    function getSegmentAcceptance(uint256 acceptanceId) external view returns (AcceptanceMeta memory) {
        return acceptances[acceptanceId];
    }
}
