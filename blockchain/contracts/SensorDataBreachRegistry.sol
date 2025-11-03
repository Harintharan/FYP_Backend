// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SensorDataBreachRegistry {
    address public owner;

    struct BreachMeta {
        bytes32 hash;
        uint256 createdAt;
        address createdBy;
    }

    mapping(bytes16 => BreachMeta) public breaches;

    event SensorDataBreachRegistered(
        bytes16 indexed breachId,
        bytes16 indexed manufacturerId,
        bytes16 indexed packageId,
        bytes16 sensorDataId,
        bytes32 hash,
        address createdBy,
        uint256 createdAt
    );

    constructor() {
        owner = msg.sender;
    }

    function registerSensorDataBreach(
        bytes16 breachId,
        bytes16 manufacturerId,
        bytes16 packageId,
        bytes16 sensorDataId,
        bytes calldata canonicalPayload
    ) external {
        require(breaches[breachId].createdAt == 0, "Sensor data breach already exists");

        bytes32 hash = keccak256(canonicalPayload);

        breaches[breachId] = BreachMeta({
            hash: hash,
            createdAt: block.timestamp,
            createdBy: msg.sender
        });

        emit SensorDataBreachRegistered(
            breachId,
            manufacturerId,
            packageId,
            sensorDataId,
            hash,
            msg.sender,
            block.timestamp
        );
    }

    function getSensorDataBreach(bytes16 breachId) external view returns (BreachMeta memory) {
        require(breaches[breachId].createdAt != 0, "Sensor data breach does not exist");
        return breaches[breachId];
    }
}
