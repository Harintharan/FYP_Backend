// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract RegistrationRegistry {
    enum RegistrationType {
        MANUFACTURER,
        SUPPLIER,
        WAREHOUSE
    }

    struct Registration {
        bytes32 payloadHash;
        uint8 regType;
        address submitter;
        uint256 updatedAt;
        string payloadCanonicalJson;
    }

    mapping(bytes16 => Registration) private registrations;
    mapping(bytes16 => bool) private registrationExists;

    event RegistrationSubmitted(
        bytes16 indexed uuid,
        bytes32 payloadHash,
        uint8 regType,
        address indexed submitter,
        uint256 timestamp,
        bool isUpdate
    );

    error InvalidRegistrationType(uint8 regType);
    error RegistrationAlreadyExists(bytes16 uuid);
    error RegistrationDoesNotExist(bytes16 uuid);

    function submit(
        bytes16 uuid,
        uint8 regType,
        string calldata payloadCanonicalJson,
        bool isUpdate
    ) external {
        if (regType > uint8(RegistrationType.WAREHOUSE)) {
            revert InvalidRegistrationType(regType);
        }

        bool hasExisting = registrationExists[uuid];
        if (hasExisting && !isUpdate) {
            revert RegistrationAlreadyExists(uuid);
        }
        if (!hasExisting && isUpdate) {
            revert RegistrationDoesNotExist(uuid);
        }

        bytes32 payloadHash = keccak256(bytes(payloadCanonicalJson));
        uint256 timestamp = block.timestamp;

        registrations[uuid] = Registration({
            payloadHash: payloadHash,
            regType: regType,
            submitter: msg.sender,
            updatedAt: timestamp,
            payloadCanonicalJson: payloadCanonicalJson
        });

        if (!hasExisting) {
            registrationExists[uuid] = true;
        }

        emit RegistrationSubmitted(uuid, payloadHash, regType, msg.sender, timestamp, isUpdate);
    }

    function getRegistration(bytes16 uuid)
        external
        view
        returns (
            bytes32 payloadHash,
            uint8 regType,
            address submitter,
            uint256 updatedAt,
            string memory payloadCanonicalJson
        )
    {
        if (!registrationExists[uuid]) {
            revert RegistrationDoesNotExist(uuid);
        }
        Registration storage info = registrations[uuid];
        return (
            info.payloadHash,
            info.regType,
            info.submitter,
            info.updatedAt,
            info.payloadCanonicalJson
        );
    }

    function exists(bytes16 uuid) external view returns (bool) {
        return registrationExists[uuid];
    }
}
