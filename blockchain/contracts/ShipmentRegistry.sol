// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ShipmentRegistry {
    address public owner;

    struct ShipmentMeta {
        bytes32 hash;
        uint256 createdAt;
        uint256 updatedAt;
        address createdBy;
        address updatedBy;
    }

    mapping(bytes16 => ShipmentMeta) public shipments;

    event ShipmentRegistered(bytes16 indexed shipmentId, bytes32 hash, address createdBy, uint256 createdAt);
    event ShipmentUpdated(bytes16 indexed shipmentId, bytes32 newHash, address updatedBy, uint256 updatedAt);

    constructor() {
        owner = msg.sender;
    }

    function registerShipment(bytes16 shipmentId, bytes32 dbHash) external {
        require(shipments[shipmentId].createdAt == 0, "Shipment already exists");

        shipments[shipmentId] = ShipmentMeta({
            hash: dbHash,
            createdAt: block.timestamp,
            updatedAt: 0,
            createdBy: msg.sender,
            updatedBy: address(0)
        });

        emit ShipmentRegistered(shipmentId, dbHash, msg.sender, block.timestamp);
    }

    function updateShipment(bytes16 shipmentId, bytes32 newHash) external {
        require(shipments[shipmentId].createdAt != 0, "Shipment does not exist");

        ShipmentMeta storage sh = shipments[shipmentId];
        sh.hash = newHash;
        sh.updatedAt = block.timestamp;
        sh.updatedBy = msg.sender;

        emit ShipmentUpdated(shipmentId, newHash, msg.sender, block.timestamp);
    }

    function getShipment(bytes16 shipmentId) external view returns (ShipmentMeta memory) {
        return shipments[shipmentId];
    }
}
