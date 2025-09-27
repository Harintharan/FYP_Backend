// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ShipmentSegmentHandover {
    address public owner;
    uint256 public nextHandoverId = 1;

    struct HandoverMeta {
        bytes32 hash;          // integrity hash of DB record
        uint256 shipmentId;    // link to shipment
        uint256 acceptanceId;  // link to acceptance
        uint256 createdAt;
        uint256 updatedAt;
        address createdBy;
        address updatedBy;
    }

    mapping(uint256 => HandoverMeta) public handovers;

    event SegmentHandedOver(
        uint256 indexed handoverId,
        uint256 shipmentId,
        uint256 acceptanceId,
        bytes32 hash,
        address createdBy,
        uint256 createdAt
    );

    event SegmentHandoverUpdated(
        uint256 indexed handoverId,
        bytes32 newHash,
        address updatedBy,
        uint256 updatedAt
    );

    constructor() {
        owner = msg.sender;
    }

    function registerHandover(
        uint256 shipmentId,
        uint256 acceptanceId,
        bytes32 dbHash
    ) external returns (uint256) {
        uint256 handoverId = nextHandoverId++;

        handovers[handoverId] = HandoverMeta({
            hash: dbHash,
            shipmentId: shipmentId,
            acceptanceId: acceptanceId,
            createdAt: block.timestamp,
            updatedAt: 0,
            createdBy: msg.sender,
            updatedBy: address(0)
        });

        emit SegmentHandedOver(handoverId, shipmentId, acceptanceId, dbHash, msg.sender, block.timestamp);
        return handoverId;
    }

    function updateHandover(uint256 handoverId, bytes32 newHash) external {
        require(handovers[handoverId].createdAt != 0, "Handover does not exist");

        HandoverMeta storage h = handovers[handoverId];
        h.hash = newHash;
        h.updatedAt = block.timestamp;
        h.updatedBy = msg.sender;

        emit SegmentHandoverUpdated(handoverId, newHash, msg.sender, block.timestamp);
    }

    function getHandover(uint256 handoverId) external view returns (HandoverMeta memory) {
        return handovers[handoverId];
    }
}
