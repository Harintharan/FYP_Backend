// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ShipmentSegmentRegistry {
    address public owner;

    struct SegmentMeta {
        bytes32 hash;
        uint256 createdAt;
        uint256 updatedAt;
        address createdBy;
        address updatedBy;
    }

    mapping(bytes16 => SegmentMeta) public segments;

    event SegmentRegistered(bytes16 indexed segmentId, bytes32 hash, address createdBy, uint256 createdAt);
    event SegmentUpdated(bytes16 indexed segmentId, bytes32 newHash, address updatedBy, uint256 updatedAt);

    constructor() {
        owner = msg.sender;
    }

    function registerSegment(bytes16 segmentId, bytes32 segmentHash) external {
        require(segments[segmentId].createdAt == 0, "Segment already exists");

        segments[segmentId] = SegmentMeta({
            hash: segmentHash,
            createdAt: block.timestamp,
            updatedAt: 0,
            createdBy: msg.sender,
            updatedBy: address(0)
        });

        emit SegmentRegistered(segmentId, segmentHash, msg.sender, block.timestamp);
    }

    function updateSegment(bytes16 segmentId, bytes32 newHash) external {
        require(segments[segmentId].createdAt != 0, "Segment does not exist");

        SegmentMeta storage segment = segments[segmentId];
        segment.hash = newHash;
        segment.updatedAt = block.timestamp;
        segment.updatedBy = msg.sender;

        emit SegmentUpdated(segmentId, newHash, msg.sender, block.timestamp);
    }

    function getSegment(bytes16 segmentId) external view returns (SegmentMeta memory) {
        return segments[segmentId];
    }
}
