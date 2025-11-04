// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SensorDataRegistry {
    address public owner;

    struct SensorDataMeta {
        bytes32 hash;
        uint256 createdAt;
        address createdBy;
    }

    mapping(bytes16 => SensorDataMeta) public sensorDataRecords;

    event SensorDataRegistered(
        bytes16 indexed sensorDataId,
        bytes16 indexed manufacturerId,
        bytes16 indexed packageId,
        bytes32 hash,
        address createdBy,
        uint256 createdAt
    );

    constructor() {
        owner = msg.sender;
    }

    function registerSensorData(
        bytes16 sensorDataId,
        bytes16 manufacturerId,
        bytes16 packageId,
        bytes calldata canonicalPayload
    ) external {
        require(
            sensorDataRecords[sensorDataId].createdAt == 0,
            "Sensor data entry already exists"
        );

        bytes32 hash = keccak256(canonicalPayload);

        sensorDataRecords[sensorDataId] = SensorDataMeta({
            hash: hash,
            createdAt: block.timestamp,
            createdBy: msg.sender
        });

        emit SensorDataRegistered(
            sensorDataId,
            manufacturerId,
            packageId,
            hash,
            msg.sender,
            block.timestamp
        );
    }

    function getSensorData(bytes16 sensorDataId) external view returns (SensorDataMeta memory) {
        require(
            sensorDataRecords[sensorDataId].createdAt != 0,
            "Sensor data entry does not exist"
        );

        return sensorDataRecords[sensorDataId];
    }
}
