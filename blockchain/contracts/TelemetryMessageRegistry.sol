// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title TelemetryMessageRegistry
 * @dev Stores telemetry message hashes on the blockchain for immutable record keeping
 */
contract TelemetryMessageRegistry {
    
    struct TelemetryMessage {
        bytes16 messageId;
        bytes16 packageId;
        bytes16 manufacturerId;
        bytes32 payloadHash;
        uint256 timestamp;
        address registeredBy;
    }
    
    // Mapping from messageId to TelemetryMessage
    mapping(bytes16 => TelemetryMessage) public telemetryMessages;
    
    // Array to track all message IDs
    bytes16[] public messageIds;
    
    // Events
    event TelemetryMessageRegistered(
        bytes16 indexed messageId,
        bytes16 indexed packageId,
        bytes16 indexed manufacturerId,
        bytes32 payloadHash,
        uint256 timestamp,
        address registeredBy
    );
    
    /**
     * @dev Register a new telemetry message
     * @param _messageId Unique identifier for the telemetry message
     * @param _packageId Package identifier
     * @param _manufacturerId Manufacturer identifier
     * @param _payloadHash Hash of the telemetry payload
     * @return success Whether the registration was successful
     * @return storedHash The hash stored on chain
     */
    function registerTelemetryMessage(
        bytes16 _messageId,
        bytes16 _packageId,
        bytes16 _manufacturerId,
        bytes32 _payloadHash
    ) public returns (bool success, bytes32 storedHash) {
        require(_messageId != 0, "Message ID cannot be zero");
        require(_packageId != 0, "Package ID cannot be zero");
        require(_manufacturerId != 0, "Manufacturer ID cannot be zero");
        require(_payloadHash != 0, "Payload hash cannot be zero");
        require(telemetryMessages[_messageId].messageId == 0, "Message already registered");
        
        telemetryMessages[_messageId] = TelemetryMessage({
            messageId: _messageId,
            packageId: _packageId,
            manufacturerId: _manufacturerId,
            payloadHash: _payloadHash,
            timestamp: block.timestamp,
            registeredBy: msg.sender
        });
        
        messageIds.push(_messageId);
        
        emit TelemetryMessageRegistered(
            _messageId,
            _packageId,
            _manufacturerId,
            _payloadHash,
            block.timestamp,
            msg.sender
        );
        
        return (true, _payloadHash);
    }
    
    /**
     * @dev Get telemetry message details
     * @param _messageId Message identifier
     * @return messageId Message ID
     * @return packageId Package ID
     * @return manufacturerId Manufacturer ID
     * @return payloadHash Payload hash
     * @return timestamp Registration timestamp
     * @return registeredBy Address that registered the message
     */
    function getTelemetryMessage(bytes16 _messageId) 
        public 
        view 
        returns (
            bytes16 messageId,
            bytes16 packageId,
            bytes16 manufacturerId,
            bytes32 payloadHash,
            uint256 timestamp,
            address registeredBy
        ) 
    {
        TelemetryMessage memory message = telemetryMessages[_messageId];
        require(message.messageId != 0, "Message not found");
        
        return (
            message.messageId,
            message.packageId,
            message.manufacturerId,
            message.payloadHash,
            message.timestamp,
            message.registeredBy
        );
    }
    
    /**
     * @dev Get messages by package ID
     * @param _packageId Package identifier
     * @return List of message IDs for the package
     */
    function getMessagesByPackage(bytes16 _packageId) 
        public 
        view 
        returns (bytes16[] memory) 
    {
        uint256 count = 0;
        
        // Count matching messages
        for (uint256 i = 0; i < messageIds.length; i++) {
            if (telemetryMessages[messageIds[i]].packageId == _packageId) {
                count++;
            }
        }
        
        // Create result array
        bytes16[] memory result = new bytes16[](count);
        uint256 index = 0;
        
        for (uint256 i = 0; i < messageIds.length; i++) {
            if (telemetryMessages[messageIds[i]].packageId == _packageId) {
                result[index] = messageIds[i];
                index++;
            }
        }
        
        return result;
    }
    
    /**
     * @dev Verify a telemetry message hash
     * @param _messageId Message identifier
     * @param _payloadHash Hash to verify
     * @return Whether the hash matches
     */
    function verifyTelemetryMessage(bytes16 _messageId, bytes32 _payloadHash) 
        public 
        view 
        returns (bool) 
    {
        TelemetryMessage memory message = telemetryMessages[_messageId];
        require(message.messageId != 0, "Message not found");
        
        return message.payloadHash == _payloadHash;
    }
    
    /**
     * @dev Get total number of registered messages
     */
    function getTotalMessages() public view returns (uint256) {
        return messageIds.length;
    }
}
