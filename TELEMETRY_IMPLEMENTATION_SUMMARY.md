# Telemetry System Implementation Summary

## Overview

Complete implementation of normalized telemetry system with blockchain integration for IoT cold chain monitoring.

## Architecture

### Database Schema (4 Tables)

1. **telemetry_messages** - Payload metadata + blockchain reference

   - Stores: message ID, package ID, MAC address, timestamps, payload hash, tx hash, Pinata CID
   - Indexes: package_id, request_received_timestamp
   - Blockchain: YES (via TelemetryMessageRegistry.sol)

2. **sensor_readings** - Individual sensor measurements

   - Stores: reading ID, message ID, sensor type, values, GPS coordinates, timestamp
   - Bulk insert optimized (single INSERT with multiple VALUES)
   - GPS coordinates populated from nearest GPS reading
   - Blockchain: NO (too expensive, covered by parent message hash)

3. **condition_breaches** - Detected violations

   - Stores: breach ID, type, severity, duration, gap tracking, certainty level
   - Types: TEMPERATURE_EXCURSION, DOOR_TAMPER
   - Certainty: CONFIRMED, ASSUMED_ENDED, ONGOING
   - Blockchain: YES (via ConditionBreachRegistry.sol)

4. **daily_condition_summary** - Daily aggregates
   - Stores: package/date summary, total breaches, duration, severity counts
   - Upsert pattern for incremental updates
   - Blockchain: NO (derived data)

### Smart Contracts

1. **TelemetryMessageRegistry.sol**

   - Stores message hashes on Ethereum
   - Functions: registerTelemetryMessage, getTelemetryMessage, getMessagesByPackage, verifyTelemetryMessage
   - Events: TelemetryMessageRegistered
   - Gas optimized: bytes16 for UUIDs, hash-only storage

2. **ConditionBreachRegistry.sol**
   - Stores breach hashes on Ethereum
   - Functions: registerConditionBreach, getConditionBreach, getBreachesByPackage, getBreachesByMessage, verifyConditionBreach
   - Events: ConditionBreachRegistered
   - Includes breach start time for temporal queries

## Key Features

### GPS Coordinate Population

- All sensor readings include GPS coordinates
- Non-GPS readings use **nearest GPS reading by timestamp**
- Algorithm: Find closest GPS reading (forward or backward in time)
- Populated **in-memory** before bulk insert (not in DB)

### Adaptive Breach Detection

- **Grace Period**: 30 seconds (gaps <30s continue breach)
- **Max Gap Tolerance**: 60 seconds
- **Gap Handling**:
  - Gap 0-30s: Continue breach, ignore gap
  - Gap 30-60s: Assume breach ended if next reading normal
  - Gap >60s: Finalize breach, start new breach if condition continues
- **Duration**: Calculated from actual timestamps (NOT interval × count)
- **Certainty Tracking**: CONFIRMED, ASSUMED_ENDED, ONGOING

### Breach Types

#### Temperature Excursion

- Compares against product requirements (required_start_temp, required_end_temp)
- Severity: LOW, MEDIUM, HIGH, CRITICAL (based on deviation)
- Tracks: min/max/avg measured values, expected range, location, gaps

#### Door Tamper

- Only checked during IN_TRANSIT shipment status
- Triggered by: door open events, status changes
- Tracks: shipment status, location, duration

### Blockchain Integration

- **What goes on chain**: telemetry_messages + condition_breaches (hashes only)
- **What stays in DB**: sensor_readings (high volume, covered by parent hash)
- **Verification**: Hash verification prevents tampering
- **Backup**: IPFS via Pinata for redundancy

## File Structure

### Migrations

```
migrations/
  01_initial_schema.sql           - Full schema including telemetry tables
  01_initial_schema.js            - Migration runner
  07_create_telemetry_tables.sql  - Standalone telemetry schema
  07_create_telemetry_tables.js   - Standalone migration runner
```

### Models

```
models/
  TelemetryMessageModel.js        - CRUD for telemetry_messages
  SensorReadingModel.js           - Bulk insert for sensor_readings
  ConditionBreachModel.js         - CRUD for condition_breaches
  DailyConditionSummaryModel.js   - Upsert for daily summaries
```

### Services

```
services/
  telemetryService.js             - Main entry point for processing
  breachDetectionService.js       - Temperature + door tamper detection
  dailySummaryService.js          - Daily aggregation logic
```

### Blockchain

```
blockchain/
  contracts/
    TelemetryMessageRegistry.sol    - Message hash registry
    ConditionBreachRegistry.sol     - Breach hash registry
  scripts/
    deploy-telemetry-message-registry.js  - Deployment script
    deploy-condition-breach-registry.js   - Deployment script
```

### Ethereum Integration

```
src/eth/
  telemetryMessageContract.js     - JavaScript wrapper for TelemetryMessageRegistry
  conditionBreachContract.js      - JavaScript wrapper for ConditionBreachRegistry
```

### Utilities

```
utils/
  sensorDataUtils.js              - GPS population, parsing, timestamp handling
```

### Configuration

```
config/
  breachDetectionConfig.js        - Configurable thresholds and severity levels
  buildConfig.js                  - Contract addresses, environment variables
```

## Data Flow

### Incoming Telemetry Payload

1. **Receive**: IoT device sends JSON payload with sensor data array
2. **Validate**: Check package exists, get manufacturer UUID
3. **Transaction Start**: Begin database transaction
4. **Create Message**:
   - Generate message ID (UUID)
   - Hash payload (keccak256)
   - **Register on blockchain** (TelemetryMessageRegistry)
   - Backup to Pinata IPFS
   - Insert into `telemetry_messages` table
5. **Process Readings**:
   - Parse sensor data array
   - **Populate GPS coordinates** (nearest GPS algorithm)
   - Parse values by sensor type (number/text/unit)
   - **Bulk insert** into `sensor_readings` (single query)
6. **Detect Breaches**:
   - Get product temperature requirements
   - Get shipment status
   - **Run temperature breach detection** (adaptive gap handling)
   - **Run door tamper detection** (if IN_TRANSIT)
   - For each breach:
     - Generate breach ID
     - Hash breach data
     - **Register on blockchain** (ConditionBreachRegistry)
     - Backup to Pinata
     - Insert into `condition_breaches` table
7. **Update Summary**: Async daily summary update
8. **Transaction Commit**: All or nothing
9. **Response**: Return message, readings, and detected breaches

### Breach Detection Logic

```javascript
for each temperature reading:
  if temperature out of range:
    if no current breach:
      START new breach
    else if gap > 60s:
      FINALIZE previous breach
      START new breach
    else if gap 30-60s:
      TRACK gap (might assume ended)
    else if gap < 30s:
      CONTINUE breach (ignore gap)
  else (temperature normal):
    if current breach exists:
      if previous gap 30-60s:
        FINALIZE breach as ASSUMED_ENDED
      else:
        FINALIZE breach as CONFIRMED
```

## Configuration

### Environment Variables (New)

```env
CONTRACT_ADDRESS_TELEMETRY_MESSAGE=0x...
CONTRACT_ADDRESS_CONDITION_BREACH=0x...
```

### Breach Detection Config

```javascript
{
  Temperature: {
    gracePeriod: 30,      // seconds
    maxGapTolerance: 60,  // seconds
  },
  DoorTamper: {
    gracePeriod: 30,
    maxGapTolerance: 60,
  }
}
```

### Severity Thresholds

```javascript
{
  Temperature: {
    LOW: 2,       // °C deviation
    MEDIUM: 5,
    HIGH: 10,
    CRITICAL: 15
  }
}
```

## Deployment Steps

1. **Deploy Contracts**:

   ```bash
   cd Backend/blockchain
   npx hardhat run scripts/deploy-telemetry-message-registry.js --network <network>
   npx hardhat run scripts/deploy-condition-breach-registry.js --network <network>
   ```

2. **Update Environment**:

   - Add contract addresses to `.env`

3. **Run Migrations**:

   ```bash
   cd Backend
   npm run migrate
   ```

4. **Start Backend**:
   ```bash
   npm start
   ```

## Testing Checklist

- [ ] Deploy both smart contracts
- [ ] Update .env with contract addresses
- [ ] Run database migrations
- [ ] Send test telemetry payload with mixed sensor types
- [ ] Verify telemetry message stored in DB
- [ ] Verify telemetry message registered on blockchain
- [ ] Verify sensor readings stored with GPS coordinates
- [ ] Trigger temperature breach (out-of-range temperature)
- [ ] Verify breach detected and stored in DB
- [ ] Verify breach registered on blockchain
- [ ] Test gap handling (30s, 60s, 90s gaps)
- [ ] Test door tamper detection (IN_TRANSIT status)
- [ ] Verify daily summary updated
- [ ] Query messages by package from blockchain
- [ ] Query breaches by package from blockchain
- [ ] Verify hash integrity (DB hash matches blockchain hash)

## Edge Cases Handled

1. **No GPS readings in payload**: GPS coordinates will be null
2. **Irregular sensor intervals**: Adaptive gap detection handles varying intervals
3. **Multiple breaches in one payload**: All detected and stored separately
4. **Ongoing breach at end of payload**: Marked as ONGOING, duration = null
5. **Large data gaps**: Breach split into separate records if gap >60s
6. **Product without temperature requirements**: Temperature breach detection skipped
7. **Package not IN_TRANSIT**: Door tamper detection skipped
8. **Blockchain transaction fails**: Database transaction rolls back (atomic)

## Performance Optimizations

1. **Bulk Insert**: Sensor readings inserted in single query (not loop)
2. **GPS Population**: Done in-memory before insert (not separate queries)
3. **Async Summary**: Daily summary updated asynchronously (doesn't block response)
4. **Blockchain**: Only hashes stored (not full payloads)
5. **Indexes**: Proper indexes on package_id, timestamp columns
6. **Transaction**: Single transaction for all related operations

## Security Considerations

1. **Blockchain Immutability**: Hashes prevent tampering
2. **IPFS Backup**: Pinata provides redundancy
3. **Hash Verification**: On-chain hash compared to computed hash
4. **Transaction Rollback**: Failed blockchain write rolls back DB changes
5. **Access Control**: Wallet address tracked for audit trail

## Future Enhancements

- [ ] Batch blockchain registration (gas optimization)
- [ ] Merkle tree proofs for sensor readings
- [ ] Real-time breach alerts via WebSocket
- [ ] Machine learning for anomaly detection
- [ ] Multi-chain support (Polygon, BSC, etc.)
- [ ] GraphQL API for complex queries
- [ ] Breach prediction based on historical patterns
- [ ] Automated reporting and notifications
