// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ConditionBreachRegistry
 * @dev Stores condition breach records on the blockchain for immutable compliance tracking
 */
contract ConditionBreachRegistry {
    
    struct ConditionBreach {
        bytes16 breachId;
        bytes16 packageId;
        bytes16 messageId;
        bytes32 payloadHash;
        uint256 breachStartTime;
        uint256 timestamp;
        address registeredBy;
    }
    
    // Mapping from breachId to ConditionBreach
    mapping(bytes16 => ConditionBreach) public conditionBreaches;
    
    // Array to track all breach IDs
    bytes16[] public breachIds;
    
    // Events
    event ConditionBreachRegistered(
        bytes16 indexed breachId,
        bytes16 indexed packageId,
        bytes16 indexed messageId,
        bytes32 payloadHash,
        uint256 breachStartTime,
        uint256 timestamp,
        address registeredBy
    );
    
    /**
     * @dev Register a new condition breach
     * @param _breachId Unique identifier for the breach
     * @param _packageId Package identifier
     * @param _messageId Telemetry message identifier
     * @param _payloadHash Hash of the breach payload
     * @param _breachStartTime When the breach started (Unix timestamp)
     * @return success Whether the registration was successful
     * @return storedHash The hash stored on chain
     */
    function registerConditionBreach(
        bytes16 _breachId,
        bytes16 _packageId,
        bytes16 _messageId,
        bytes32 _payloadHash,
        uint256 _breachStartTime
    ) public returns (bool success, bytes32 storedHash) {
        require(_breachId != 0, "Breach ID cannot be zero");
        require(_packageId != 0, "Package ID cannot be zero");
        require(_payloadHash != 0, "Payload hash cannot be zero");
        require(conditionBreaches[_breachId].breachId == 0, "Breach already registered");
        
        conditionBreaches[_breachId] = ConditionBreach({
            breachId: _breachId,
            packageId: _packageId,
            messageId: _messageId,
            payloadHash: _payloadHash,
            breachStartTime: _breachStartTime,
            timestamp: block.timestamp,
            registeredBy: msg.sender
        });
        
        breachIds.push(_breachId);
        
        emit ConditionBreachRegistered(
            _breachId,
            _packageId,
            _messageId,
            _payloadHash,
            _breachStartTime,
            block.timestamp,
            msg.sender
        );
        
        return (true, _payloadHash);
    }
    
    /**
     * @dev Get condition breach details
     * @param _breachId Breach identifier
     * @return breachId Breach ID
     * @return packageId Package ID
     * @return messageId Message ID
     * @return payloadHash Payload hash
     * @return breachStartTime When breach started
     * @return timestamp When breach was registered on chain
     * @return registeredBy Address that registered the breach
     */
    function getConditionBreach(bytes16 _breachId) 
        public 
        view 
        returns (
            bytes16 breachId,
            bytes16 packageId,
            bytes16 messageId,
            bytes32 payloadHash,
            uint256 breachStartTime,
            uint256 timestamp,
            address registeredBy
        ) 
    {
        ConditionBreach memory breach = conditionBreaches[_breachId];
        require(breach.breachId != 0, "Breach not found");
        
        return (
            breach.breachId,
            breach.packageId,
            breach.messageId,
            breach.payloadHash,
            breach.breachStartTime,
            breach.timestamp,
            breach.registeredBy
        );
    }
    
    /**
     * @dev Get breaches by package ID
     * @param _packageId Package identifier
     * @return List of breach IDs for the package
     */
    function getBreachesByPackage(bytes16 _packageId) 
        public 
        view 
        returns (bytes16[] memory) 
    {
        uint256 count = 0;
        
        // Count matching breaches
        for (uint256 i = 0; i < breachIds.length; i++) {
            if (conditionBreaches[breachIds[i]].packageId == _packageId) {
                count++;
            }
        }
        
        // Create result array
        bytes16[] memory result = new bytes16[](count);
        uint256 index = 0;
        
        for (uint256 i = 0; i < breachIds.length; i++) {
            if (conditionBreaches[breachIds[i]].packageId == _packageId) {
                result[index] = breachIds[i];
                index++;
            }
        }
        
        return result;
    }
    
    /**
     * @dev Get breaches by message ID
     * @param _messageId Message identifier
     * @return List of breach IDs for the message
     */
    function getBreachesByMessage(bytes16 _messageId) 
        public 
        view 
        returns (bytes16[] memory) 
    {
        uint256 count = 0;
        
        // Count matching breaches
        for (uint256 i = 0; i < breachIds.length; i++) {
            if (conditionBreaches[breachIds[i]].messageId == _messageId) {
                count++;
            }
        }
        
        // Create result array
        bytes16[] memory result = new bytes16[](count);
        uint256 index = 0;
        
        for (uint256 i = 0; i < breachIds.length; i++) {
            if (conditionBreaches[breachIds[i]].messageId == _messageId) {
                result[index] = breachIds[i];
                index++;
            }
        }
        
        return result;
    }
    
    /**
     * @dev Verify a condition breach hash
     * @param _breachId Breach identifier
     * @param _payloadHash Hash to verify
     * @return Whether the hash matches
     */
    function verifyConditionBreach(bytes16 _breachId, bytes32 _payloadHash) 
        public 
        view 
        returns (bool) 
    {
        ConditionBreach memory breach = conditionBreaches[_breachId];
        require(breach.breachId != 0, "Breach not found");
        
        return breach.payloadHash == _payloadHash;
    }
    
    /**
     * @dev Get total number of registered breaches
     */
    function getTotalBreaches() public view returns (uint256) {
        return breachIds.length;
    }
}
