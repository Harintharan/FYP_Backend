# 🏗️ Backend Architecture Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture Patterns](#architecture-patterns)
4. [Data Flow](#data-flow)
5. [Smart Contracts](#smart-contracts)
6. [Security & Encryption](#security--encryption)
7. [Database Design](#database-design)
8. [API Structure](#api-structure)
9. [Deployment Guide](#deployment-guide)
10. [Troubleshooting](#troubleshooting)

---

## 🌟 System Overview

This backend implements a **hybrid blockchain-database architecture** for supply chain management, combining:

- **Traditional Database** (PostgreSQL) for fast queries and complex relationships
- **Smart Contracts** (Ethereum/L2) for immutable data integrity and audit trails
- **IPFS Storage** (Pinata) for decentralized backup and redundancy
- **REST API** (Express.js) for client communication

```
┌─────────────────┐
│   Frontend      │
│   Applications  │
└─────────┬───────┘
          │ HTTP/HTTPS
          ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Express.js    │───▶│   PostgreSQL     │    │  Smart Contracts│
│   REST API      │    │   Database       │    │  (Ethereum)     │
│   (Port 5000)   │    │   (Primary Data) │    │  (Integrity)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
          │                                              │
          │                                              │
          ▼                                              ▼
┌─────────────────┐                            ┌─────────────────┐
│   IPFS/Pinata   │                            │   Blockchain    │
│   (Backup)      │                            │   Networks      │
└─────────────────┘                            └─────────────────┘
```

---

## 🛠️ Technology Stack

### **Core Backend**
| Technology | Purpose | Version |
|------------|---------|---------|
| Node.js | Runtime Environment | Latest LTS |
| Express.js | Web Framework | ^4.x |
| PostgreSQL | Primary Database | ^14+ |
| Ethers.js | Blockchain Interaction | ^6.x |

### **Blockchain & Smart Contracts**
| Technology | Purpose | Version |
|------------|---------|---------|
| Solidity | Smart Contract Language | ^0.8.24 |
| Hardhat | Development Framework | ^2.22.7 |
| OpenZeppelin | Security Libraries | Latest |

### **Security & Encryption**
| Technology | Purpose | Implementation |
|------------|---------|----------------|
| AES-256-CBC | Data Encryption | Node.js Crypto |
| JWT (RS256) | Authentication | RSA Key Pairs |
| Helmet.js | HTTP Security | Security Headers |
| CORS | Cross-Origin | Configurable |

### **External Services**
| Service | Purpose | Usage |
|---------|---------|-------|
| Pinata | IPFS Pinning | Backup Storage |
| Infura/Alchemy | RPC Provider | Blockchain Access |

---

## 🏛️ Architecture Patterns

### **1. Layered Architecture**
```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                       │
│              (Express Routes & Controllers)                 │
├─────────────────────────────────────────────────────────────┤
│                     BUSINESS LAYER                          │
│              (Services & Business Logic)                    │
├─────────────────────────────────────────────────────────────┤
│                      DATA LAYER                             │
│            (Models, Database, Smart Contracts)              │
├─────────────────────────────────────────────────────────────┤
│                   INFRASTRUCTURE LAYER                      │
│          (Database, Blockchain, IPFS, External APIs)        │
└─────────────────────────────────────────────────────────────┘
```

### **2. Hybrid Data Storage Pattern**
- **Database First**: Store all data in PostgreSQL for performance
- **Blockchain Verification**: Store data hashes on smart contracts
- **IPFS Backup**: Create immutable backups on IPFS
- **Integrity Checking**: Verify data hasn't been tampered with

---

## 🔄 Data Flow

### **Complete Data Lifecycle**

#### **1. Data Creation Flow**
```
1. API Request
   POST /api/batches
   {
     "product_category": "Electronics",
     "manufacturer_uuid": "abc-123",
     "facility": "Factory A",
     "production_window": "2025-01-01",
     "quantity_produced": "1000",
     "release_status": "pending"
   }
   
2. Controller Processing
   ├── Input Validation
   ├── UUID Generation
   └── Data Preparation
   
3. Database Storage
   INSERT INTO batches (id, product_category, ...)
   VALUES (uuid, 'Electronics', ...)
   
4. Data Canonicalization
   {
     "facility": "Factory A",
     "manufacturer_uuid": "abc-123",
     "product_category": "Electronics",
     "production_window": "2025-01-01",
     "quantity_produced": "1000",
     "release_status": "pending"
   }
   
5. Smart Contract Interaction
   batchContract.registerBatch(
     uuidBytes16,
     "Electronics",
     "abc-123",
     "Factory A",
     "2025-01-01",
     "1000",
     "pending"
   )
   
6. Blockchain Transaction
   ├── Gas Estimation
   ├── Transaction Submission
   ├── Transaction Receipt
   └── Event Parsing
   
7. IPFS Backup
   pinata.pinJSONToIPFS({
     entity: "batch",
     operation: "create",
     record: batchData,
     timestamp: "2025-10-31T10:00:00Z"
   })
   
8. Response
   {
     "success": true,
     "batch_id": "abc-123-def-456",
     "tx_hash": "0x...",
     "pinata_cid": "Qm..."
   }
```

#### **2. Data Retrieval Flow**
```
1. API Request
   GET /api/batches/abc-123-def-456
   
2. Database Query
   SELECT * FROM batches WHERE id = 'abc-123-def-456'
   
3. Data Decryption (if enabled)
   decrypt(encryptedField) → plainTextValue
   
4. Smart Contract Verification
   batchContract.getBatch(uuidBytes16)
   Returns: (hash, batchStruct)
   
5. Integrity Verification
   canonicalData = canonicalize(databaseData)
   expectedHash = keccak256(canonicalData)
   isValid = (expectedHash === contractHash)
   
6. Response Assembly
   {
     "batch": {
       "id": "abc-123-def-456",
       "product_category": "Electronics",
       // ... other fields
     },
     "blockchain": {
       "hash": "0x...",
       "tx_hash": "0x...",
       "verified": true
     },
     "backup": {
       "pinata_cid": "Qm...",
       "pinned_at": "2025-10-31T10:00:00Z"
     }
   }
```

#### **3. Data Update Flow**
```
1. Update Request
   PUT /api/batches/abc-123-def-456
   { "quantity_produced": "1200" }
   
2. Validation & Processing
   ├── Existence Check
   ├── Permission Validation
   └── Data Preparation
   
3. Database Update
   UPDATE batches 
   SET quantity_produced = '1200', updated_at = NOW()
   WHERE id = 'abc-123-def-456'
   
4. Smart Contract Update
   batchContract.updateBatch(uuidBytes16, ...)
   
5. New Hash Generation
   newHash = keccak256(updatedCanonicalData)
   
6. IPFS Version Backup
   pinata.pinJSONToIPFS({
     entity: "batch",
     operation: "update",
     record: updatedData,
     version: 2
   })
```

---

## 📜 Smart Contracts

### **Contract Architecture**

#### **1. BatchRegistry.sol**
```solidity
// Purpose: Track product batches
struct Batch {
    string productCategory;     // Type of product
    string manufacturerUUID;    // Manufacturer identifier
    string facility;           // Production facility
    string productionWindow;   // Production timeframe
    string quantityProduced;   // Amount produced
    string releaseStatus;      // Current status
    
    bytes32 hash;              // Data integrity hash
    uint256 createdAt;         // Creation timestamp
    uint256 updatedAt;         // Last update timestamp
    address createdBy;         // Creator wallet
    address updatedBy;         // Last updater wallet
}

// Key Functions:
registerBatch()  → Create new batch
updateBatch()    → Update existing batch
getBatch()       → Retrieve batch data
```

#### **2. RegistrationRegistry.sol**
```solidity
// Purpose: Company registrations
enum RegistrationType {
    MANUFACTURER,
    SUPPLIER,
    WAREHOUSE
}

struct Registration {
    RegistrationType regType;
    string canonicalData;
    bytes32 payloadHash;
    uint256 submittedAt;
    address submittedBy;
    bool isUpdate;
}
```

#### **3. ProductRegistry.sol**
```solidity
// Purpose: Product definitions and specifications
struct Product {
    string name;
    string description;
    string category;
    string specifications;
    string manufacturerUUID;
    // ... integrity fields
}
```

#### **4. ShipmentRegistry.sol**
```solidity
// Purpose: Shipment tracking and logistics
struct Shipment {
    string originCheckpointUUID;
    string destinationCheckpointUUID;
    string batchUUID;
    string carrierUUID;
    string estimatedDelivery;
    string actualDelivery;
    string status;
    // ... integrity fields
}
```

### **Smart Contract Deployment Process**

#### **Hardhat Configuration**
```javascript
// hardhat.config.js
module.exports = {
  solidity: "0.8.24",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
      accounts: [CHAIN_PRIVATE_KEY]
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: [SEPOLIA_PRIVATE_KEY]
    }
  }
};
```

#### **Deployment Commands**
```bash
# Compile contracts
npx hardhat compile

# Deploy to local network
npx hardhat run scripts/deploy-batch-registry.js --network localhost

# Deploy to Sepolia testnet
npx hardhat run scripts/deploy-batch-registry.js --network sepolia

# Verify on Etherscan
npx hardhat verify --network sepolia DEPLOYED_ADDRESS
```

---

## 🔐 Security & Encryption

### **Multi-Layer Security**

#### **1. Data Encryption (AES-256-CBC)**
```javascript
// encryptionHelper.js
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 64-char hex
const ENCRYPTION_IV = process.env.ENCRYPTION_IV;   // 32-char hex

export function encrypt(text) {
    if (!isConfigured()) return text; // Fallback to plaintext
    
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return encrypted;
}

// Usage in models
const encryptedData = encrypt(sensitiveField);
```

#### **2. JWT Authentication (RS256)**
```javascript
// RSA Key Pair Authentication
const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY;
const JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY;

// Token Generation
const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: '24h'
});

// Token Verification
const decoded = jwt.verify(token, publicKey, {
    algorithms: ['RS256']
});
```

#### **3. Wallet-Based Authentication**
```javascript
// Nonce-based signing for wallet authentication
const nonce = crypto.randomBytes(32).toString('hex');
const message = `Sign this message to authenticate: ${nonce}`;

// Client signs message with wallet
const signature = await wallet.signMessage(message);

// Server verifies signature
const recoveredAddress = ethers.verifyMessage(message, signature);
```

#### **4. Data Integrity Verification**
```javascript
// Canonicalization ensures consistent hashing
export function stableStringify(data) {
    // Sort object keys recursively
    if (typeof data === 'object' && data !== null) {
        const sorted = {};
        Object.keys(data).sort().forEach(key => {
            sorted[key] = stableStringify(data[key]);
        });
        return JSON.stringify(sorted);
    }
    return JSON.stringify(data);
}

// Hash verification
const canonical = stableStringify(databaseData);
const computedHash = ethers.keccak256(ethers.toUtf8Bytes(canonical));
const isValid = (computedHash === blockchainHash);
```

---

## 🗄️ Database Design

### **Schema Overview**

#### **Core Tables Structure**
```sql
-- Common pattern for all entities
CREATE TABLE entity_name (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Business Data
    field1 TEXT NOT NULL,
    field2 TEXT,
    
    -- Blockchain Integration
    entity_hash TEXT,           -- Smart contract hash
    tx_hash TEXT,              -- Transaction hash
    created_by TEXT,           -- Wallet address
    updated_by TEXT,           -- Last updater wallet
    
    -- IPFS Backup
    pinata_cid TEXT,           -- IPFS content ID
    pinata_pinned_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### **Key Tables**

##### **1. Accounts & Authentication**
```sql
-- User accounts with wallet addresses
CREATE TABLE accounts (
    address TEXT PRIMARY KEY,           -- Wallet address
    role user_role NOT NULL DEFAULT 'USER',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Authentication nonces
CREATE TABLE auth_nonces (
    address TEXT PRIMARY KEY,
    nonce TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
```

##### **2. Company Registrations**
```sql
CREATE TABLE registrations (
    id UUID PRIMARY KEY,
    company_name TEXT NOT NULL,
    registration_type reg_type NOT NULL,
    status reg_status DEFAULT 'PENDING',
    
    -- Business details
    business_address TEXT,
    contact_person TEXT,
    email TEXT,
    phone TEXT,
    
    -- Blockchain fields
    payload_hash TEXT,
    tx_hash TEXT,
    submitted_by TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

##### **3. Product Batches**
```sql
CREATE TABLE batches (
    id UUID PRIMARY KEY,
    
    -- Batch Information
    product_category TEXT NOT NULL,
    manufacturer_uuid TEXT NOT NULL,
    facility TEXT NOT NULL,
    production_window TEXT NOT NULL,
    quantity_produced TEXT NOT NULL,
    release_status TEXT NOT NULL,
    
    -- Blockchain Integration
    batch_hash TEXT,
    tx_hash TEXT,
    created_by TEXT,
    updated_by TEXT,
    
    -- IPFS Backup
    pinata_cid TEXT,
    pinata_pinned_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### **Database Migration System**
```javascript
// migrations/index.js
export async function runMigrations() {
    const migrations = [
        '01_initial_schema',
        '02_add_indexes',
        '03_add_constraints'
    ];
    
    for (const migration of migrations) {
        await runMigration(migration);
    }
}
```

---

## 🌐 API Structure

### **RESTful Endpoints**

#### **Authentication Endpoints**
```javascript
POST /auth/request-nonce
{
  "address": "0x742d35Cc6639Cfeb5BD5F2F"
}
Response: { "nonce": "abc123..." }

POST /auth/verify-signature
{
  "address": "0x742d35Cc6639Cfeb5BD5F2F",
  "signature": "0x...",
  "message": "Sign this message..."
}
Response: { "token": "eyJ..." }
```

#### **Batch Management**
```javascript
// Create Batch
POST /api/batches
{
  "product_category": "Electronics",
  "manufacturer_uuid": "abc-123",
  "facility": "Factory A",
  "production_window": "2025-Q1",
  "quantity_produced": "1000",
  "release_status": "pending"
}

// Get Batch
GET /api/batches/:id
Response: {
  "batch": { /* batch data */ },
  "blockchain": {
    "verified": true,
    "hash": "0x...",
    "tx_hash": "0x..."
  }
}

// Update Batch
PUT /api/batches/:id
{
  "quantity_produced": "1200",
  "release_status": "approved"
}

// List Batches
GET /api/batches?manufacturer_uuid=abc-123&limit=10&offset=0
```

#### **Registration Endpoints**
```javascript
// Company Registration
POST /api/registrations
{
  "company_name": "Tech Corp",
  "registration_type": "MANUFACTURER",
  "business_address": "123 Tech Street",
  "contact_person": "John Doe",
  "email": "john@techcorp.com"
}

// Get Registration
GET /api/registrations/:id

// Update Registration Status (Admin only)
PUT /api/registrations/:id/status
{
  "status": "APPROVED"
}
```

### **Error Handling**
```javascript
// Standardized error responses
{
  "error": {
    "code": "BATCH_NOT_FOUND",
    "message": "Batch with ID abc-123 not found",
    "details": {
      "batch_id": "abc-123",
      "timestamp": "2025-10-31T10:00:00Z"
    }
  }
}

// Common error codes
VALIDATION_ERROR     → 400 Bad Request
UNAUTHORIZED        → 401 Unauthorized
FORBIDDEN           → 403 Forbidden
NOT_FOUND           → 404 Not Found
BLOCKCHAIN_ERROR    → 500 Internal Server Error
DATABASE_ERROR      → 500 Internal Server Error
```

---

## 🚀 Deployment Guide

### **Environment Configuration**

#### **Required Environment Variables**
```bash
# Server Configuration
PORT=5000
NODE_ENV=production

# Database
DATABASE_URL=postgres://user:pass@host:port/database
# OR individual components:
DB_USER=supply_chain_user
DB_PASSWORD=secure_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=supply_chain_db

# JWT Authentication (RSA Key Pair)
JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"

# Blockchain Configuration
CHAIN_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
CHAIN_PRIVATE_KEY=0x1234567890abcdef...
REGISTRY_ADDRESS=0xContractAddress...

# Smart Contract Addresses
CONTRACT_ADDRESS_BATCH=0x...
CONTRACT_ADDRESS_PRODUCT=0x...
CONTRACT_ADDRESS_CHECKPOINT=0x...
CONTRACT_ADDRESS_SHIPMENT=0x...
CONTRACT_ADDRESS_SHIPMENT_SEGMENT_ACCEPTANCE=0x...
CONTRACT_ADDRESS_SHIPMENT_SEGMENT_HANDOVER=0x...

# Additional Wallets
PRIVATE_KEY_OTHER=0x...  # Operator wallet

# IPFS/Pinata Configuration
PINATA_JWT_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
# OR API Keys:
PINATA_API_KEY=your_api_key
PINATA_SECRET_API_KEY=your_secret

# Optional: Data Encryption
ENCRYPTION_KEY=64_character_hex_string
ENCRYPTION_IV=32_character_hex_string
```

### **Deployment Steps**

#### **1. Database Setup**
```bash
# Create PostgreSQL database
createdb supply_chain_db

# Run migrations (automatic on server start)
npm start
# OR manually:
npm run migrate
```

#### **2. Smart Contract Deployment**
```bash
# Navigate to blockchain directory
cd blockchain

# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Deploy to testnet
npx hardhat run scripts/deploy-batch-registry.js --network sepolia
npx hardhat run scripts/deploy-product-registry.js --network sepolia
# ... deploy other contracts

# Update .env with deployed addresses
```

#### **3. Backend Deployment**
```bash
# Install dependencies
npm install

# Build if needed
npm run build

# Start server
npm start

# Or with PM2 for production
pm2 start src/index.js --name "supply-chain-backend"
```

#### **4. Health Checks**
```bash
# Test API health
curl http://localhost:5000/health

# Test database connection
curl http://localhost:5000/api/test/db

# Test blockchain connection
curl http://localhost:5000/api/test/blockchain
```

---

## 🔧 Troubleshooting

### **Common Issues & Solutions**

#### **1. Database Connection Issues**
```
Error: "Cannot read properties of undefined (reading 'searchParams')"
```
**Solution:**
- Check DATABASE_URL format: `postgres://user:pass@host:port/db`
- Ensure all DB_* environment variables are set
- Verify PostgreSQL is running and accessible

#### **2. Smart Contract Deployment Failures**
```
Error: "insufficient funds for intrinsic transaction cost"
```
**Solution:**
- Ensure wallet has enough ETH for gas fees
- Check network configuration in hardhat.config.js
- Verify RPC URL is correct and accessible

#### **3. IPFS/Pinata Errors**
```
Error: "Request failed with status code 401"
```
**Solution:**
- Verify PINATA_JWT_KEY or API keys are correct
- Check Pinata account limits and billing
- Ensure content size is within limits

#### **4. Encryption Configuration**
```
Warning: "Encryption keys missing or invalid"
```
**Solution:**
- Generate proper hex keys:
  ```bash
  # Generate 256-bit key (64 hex chars)
  openssl rand -hex 32
  
  # Generate 128-bit IV (32 hex chars)
  openssl rand -hex 16
  ```

#### **5. JWT Authentication Issues**
```
Error: "Invalid token signature"
```
**Solution:**
- Ensure RSA key pair is properly formatted
- Check for escaped newlines: `\\n` should be `\n`
- Verify token hasn't expired

### **Monitoring & Logging**

#### **Application Logs**
```javascript
// Structured logging
console.log('✅ Database setup completed successfully');
console.error('❌ Error setting up database:', error);

// Monitor key metrics
- API response times
- Database query performance
- Blockchain transaction success rates
- IPFS upload success rates
```

#### **Health Monitoring**
```bash
# Database health
SELECT 1; -- Should return quickly

# Blockchain connectivity
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  $CHAIN_RPC_URL

# IPFS connectivity
curl https://api.pinata.cloud/data/testAuthentication \
  -H "Authorization: Bearer $PINATA_JWT_KEY"
```

---

## 📚 Additional Resources

### **Development Commands**
```bash
# Backend development
npm run dev          # Start with nodemon
npm run test         # Run tests
npm run lint         # Code linting

# Blockchain development
npx hardhat compile  # Compile contracts
npx hardhat test     # Run contract tests
npx hardhat clean    # Clean artifacts
npx hardhat node     # Start local blockchain
```

### **Useful Scripts**
```bash
# Generate wallet
node -e "console.log(require('ethers').Wallet.createRandom())"

# Generate RSA key pair for JWT
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

# Database backup
pg_dump supply_chain_db > backup.sql

# Database restore
psql supply_chain_db < backup.sql
```

### **Performance Optimization**

#### **Database Indexes**
```sql
-- Add indexes for common queries
CREATE INDEX idx_batches_manufacturer ON batches(manufacturer_uuid);
CREATE INDEX idx_batches_created_at ON batches(created_at);
CREATE INDEX idx_registrations_type ON registrations(registration_type);
```

#### **Caching Strategy**
```javascript
// Redis caching for frequently accessed data
const redis = require('redis');
const client = redis.createClient();

// Cache blockchain data
const cacheKey = `batch_${batchId}_blockchain`;
await client.setex(cacheKey, 300, JSON.stringify(blockchainData));
```

---

This documentation provides a complete understanding of the backend architecture, from high-level concepts to implementation details. Use it as a reference for development, deployment, and maintenance of the supply chain management system.