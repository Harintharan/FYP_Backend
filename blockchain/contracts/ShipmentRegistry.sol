// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ShipmentRegistry {
    address public owner;
    uint256 public nextShipmentId = 1;

    struct ShipmentMeta {
        bytes32 hash;        // integrity hash (from DB)
        uint256 createdAt;
        uint256 updatedAt;
        address createdBy;
        address updatedBy;
    }

    mapping(uint256 => ShipmentMeta) public shipments;

    event ShipmentRegistered(uint256 indexed shipmentId, bytes32 hash, address createdBy, uint256 createdAt);
    event ShipmentUpdated(uint256 indexed shipmentId, bytes32 newHash, address updatedBy, uint256 updatedAt);

    constructor() {
        owner = msg.sender;
    }

    function registerShipment(bytes32 dbHash) external returns (uint256) {
        uint256 shipmentId = nextShipmentId++;

        shipments[shipmentId] = ShipmentMeta({
            hash: dbHash,
            createdAt: block.timestamp,
            updatedAt: 0,
            createdBy: msg.sender,
            updatedBy: address(0)
        });

        emit ShipmentRegistered(shipmentId, dbHash, msg.sender, block.timestamp);
        return shipmentId;
    }

    function updateShipment(uint256 shipmentId, bytes32 newHash) external {
        require(shipments[shipmentId].createdAt != 0, "Shipment does not exist");

        ShipmentMeta storage sh = shipments[shipmentId];
        sh.hash = newHash;
        sh.updatedAt = block.timestamp;
        sh.updatedBy = msg.sender;

        emit ShipmentUpdated(shipmentId, newHash, msg.sender, block.timestamp);
    }

    function getShipment(uint256 shipmentId) external view returns (ShipmentMeta memory) {
        return shipments[shipmentId];
    }
}
