// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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
        uint256 createdAt;
        string payloadCanonicalJson;
    }

    mapping(bytes16 => Registration) private registrations;
    mapping(bytes16 => bool) private registrationExists;

    event RegistrationSubmitted(
        bytes16 indexed uuid,
        bytes32 payloadHash,
        uint8 regType,
        address indexed submitter,
        uint256 createdAt
    );

    error InvalidRegistrationType(uint8 regType);
    error RegistrationAlreadyExists(bytes16 uuid);

    function submit(
        bytes16 uuid,
        uint8 regType,
        string calldata payloadCanonicalJson
    ) external {
        if (regType > uint8(RegistrationType.WAREHOUSE)) {
            revert InvalidRegistrationType(regType);
        }
        if (registrationExists[uuid]) {
            revert RegistrationAlreadyExists(uuid);
        }

        bytes32 payloadHash = keccak256(bytes(payloadCanonicalJson));
        uint256 timestamp = block.timestamp;

        registrations[uuid] = Registration({
            payloadHash: payloadHash,
            regType: regType,
            submitter: msg.sender,
            createdAt: timestamp,
            payloadCanonicalJson: payloadCanonicalJson
        });
        registrationExists[uuid] = true;

        emit RegistrationSubmitted(uuid, payloadHash, regType, msg.sender, timestamp);
    }

    function getRegistration(bytes16 uuid)
        external
        view
        returns (
            bytes32 payloadHash,
            uint8 regType,
            address submitter,
            uint256 createdAt,
            string memory payloadCanonicalJson
        )
    {
        require(registrationExists[uuid], "Registration not found");
        Registration storage info = registrations[uuid];
        return (
            info.payloadHash,
            info.regType,
            info.submitter,
            info.createdAt,
            info.payloadCanonicalJson
        );
    }

    function exists(bytes16 uuid) external view returns (bool) {
        return registrationExists[uuid];
    }
}
