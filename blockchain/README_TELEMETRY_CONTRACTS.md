# Telemetry Blockchain Contracts

This document describes the blockchain smart contracts for the telemetry system.

## Overview

The telemetry system stores two types of records on the blockchain for immutable proof:

1. **Telemetry Messages** - Metadata about sensor data payloads
2. **Condition Breaches** - Records of detected violations

Individual sensor readings are NOT stored on blockchain (too expensive). They remain in the PostgreSQL database and are covered by the parent telemetry message hash.

## Smart Contracts

### TelemetryMessageRegistry.sol

Stores telemetry message hashes on the blockchain.

**Key Methods:**

- `registerTelemetryMessage(bytes16 messageId, bytes16 packageId, bytes16 manufacturerId, bytes32 payloadHash)` - Register a new telemetry message
- `getTelemetryMessage(bytes16 messageId)` - Retrieve message details
- `getMessagesByPackage(bytes16 packageId)` - Get all messages for a package
- `verifyTelemetryMessage(bytes16 messageId, bytes32 payloadHash)` - Verify hash matches

**Events:**

- `TelemetryMessageRegistered(bytes16 indexed messageId, bytes16 indexed packageId, bytes16 indexed manufacturerId, bytes32 payloadHash, uint256 timestamp, address registeredBy)`

### ConditionBreachRegistry.sol

Stores condition breach records on the blockchain.

**Key Methods:**

- `registerConditionBreach(bytes16 breachId, bytes16 packageId, bytes16 messageId, bytes32 payloadHash, uint256 breachStartTime)` - Register a new breach
- `getConditionBreach(bytes16 breachId)` - Retrieve breach details
- `getBreachesByPackage(bytes16 packageId)` - Get all breaches for a package
- `getBreachesByMessage(bytes16 messageId)` - Get all breaches for a message
- `verifyConditionBreach(bytes16 breachId, bytes32 payloadHash)` - Verify hash matches

**Events:**

- `ConditionBreachRegistered(bytes16 indexed breachId, bytes16 indexed packageId, bytes16 indexed messageId, bytes32 payloadHash, uint256 breachStartTime, uint256 timestamp, address registeredBy)`

## Deployment

### Prerequisites

1. Hardhat environment configured
2. Network RPC URL in environment
3. Deployer private key

### Deploy TelemetryMessageRegistry

```bash
cd Backend/blockchain
npx hardhat run scripts/deploy-telemetry-message-registry.js --network <network-name>
```

This will output:

```
TelemetryMessageRegistry deployed to: 0x...
```

### Deploy ConditionBreachRegistry

```bash
cd Backend/blockchain
npx hardhat run scripts/deploy-condition-breach-registry.js --network <network-name>
```

This will output:

```
ConditionBreachRegistry deployed to: 0x...
```

### Update Environment Variables

Add the contract addresses to your `.env` file:

```env
CONTRACT_ADDRESS_TELEMETRY_MESSAGE=0x...
CONTRACT_ADDRESS_CONDITION_BREACH=0x...
```

## Backend Integration

### Contract Wrappers

JavaScript wrapper files are located in `Backend/src/eth/`:

- `telemetryMessageContract.js` - Telemetry message blockchain operations
- `conditionBreachContract.js` - Condition breach blockchain operations

### Usage in Services

**Telemetry Service** (`services/telemetryService.js`):

```javascript
import { registerTelemetryMessageOnChain } from "../eth/telemetryMessageContract.js";

// Register telemetry message on blockchain
const { txHash, payloadHash } = await registerTelemetryMessageOnChain(
  uuidToBytes16Hex(telemetryMessageId),
  uuidToBytes16Hex(packageId),
  uuidToBytes16Hex(manufacturerUuid),
  canonical
);
```

**Breach Detection Service** (`services/breachDetectionService.js`):

```javascript
import { registerConditionBreachOnChain } from "../eth/conditionBreachContract.js";

// Register condition breach on blockchain
const { txHash } = await registerConditionBreachOnChain(
  uuidToBytes16Hex(breachId),
  uuidToBytes16Hex(packageId),
  uuidToBytes16Hex(messageId),
  canonical,
  breachStartUnix
);
```

## Data Flow

### Telemetry Message Registration

1. IoT device sends sensor data payload
2. Backend receives payload and assigns message ID
3. Payload normalized and hashed
4. **Blockchain**: `registerTelemetryMessage()` stores hash
5. **Database**: Full message details stored in `telemetry_messages`
6. **IPFS**: Backup stored via Pinata
7. Sensor readings stored in `sensor_readings` (DB only)

### Condition Breach Registration

1. Breach detection service identifies violation
2. Breach data prepared and hashed
3. **Blockchain**: `registerConditionBreach()` stores hash
4. **Database**: Full breach details stored in `condition_breaches`
5. **IPFS**: Backup stored via Pinata

## Verification

### Verify Telemetry Message

```javascript
import { verifyTelemetryMessageHash } from "../eth/telemetryMessageContract.js";

const isValid = await verifyTelemetryMessageHash(
  uuidToBytes16Hex(messageId),
  payloadHash
);
```

### Verify Condition Breach

```javascript
import { verifyConditionBreachHash } from "../eth/conditionBreachContract.js";

const isValid = await verifyConditionBreachHash(
  uuidToBytes16Hex(breachId),
  payloadHash
);
```

## Querying

### Get All Messages for a Package

```javascript
import { getMessagesByPackage } from "../eth/telemetryMessageContract.js";

const messageIds = await getMessagesByPackage(uuidToBytes16Hex(packageId));
```

### Get All Breaches for a Package

```javascript
import { getBreachesByPackage } from "../eth/conditionBreachContract.js";

const breachIds = await getBreachesByPackage(uuidToBytes16Hex(packageId));
```

### Get All Breaches for a Message

```javascript
import { getBreachesByMessage } from "../eth/conditionBreachContract.js";

const breachIds = await getBreachesByMessage(uuidToBytes16Hex(messageId));
```

## Security

- All contract functions are `public` (no access control needed for registration)
- Once registered, records are immutable
- Hash verification prevents tampering
- Events provide audit trail
- Multiple indexes for efficient querying

## Gas Optimization

- Uses `bytes16` for UUIDs (vs `bytes32` or `string`)
- Stores only hashes on-chain (actual data in DB/IPFS)
- Efficient indexing with mapping structures
- Events indexed for off-chain queries

## Testing

### Local Testing with Hardhat

```bash
cd Backend/blockchain
npx hardhat test
```

### Integration Testing

Test full flow including blockchain:

1. Send sensor data payload
2. Verify telemetry message registered on blockchain
3. Trigger breach condition
4. Verify breach registered on blockchain
5. Query messages/breaches by package

## Troubleshooting

**Issue**: Contract deployment fails

- Check RPC URL is accessible
- Verify deployer account has sufficient funds
- Check network configuration in `hardhat.config.js`

**Issue**: Hash mismatch error

- Ensure canonical payload format is consistent
- Check UUID to bytes16 conversion
- Verify ethers.js version compatibility

**Issue**: Transaction reverts

- Check all parameters are correct types
- Verify bytes16 conversion for UUIDs
- Ensure message/breach ID not already registered

## Future Enhancements

- Batch registration for multiple messages/breaches
- Off-chain signature verification
- Merkle tree proof system for sensor readings
- Cross-chain bridge for multi-network support
