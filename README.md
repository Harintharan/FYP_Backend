# Registration Registry Backend

Wallet-based authentication service for managing manufacturer, supplier, and warehouse registrations. The backend persists the full request payload, sends canonical JSON to an on-chain registry, and exposes role-restricted moderation endpoints.

## Prerequisites
- Node.js 20+
- PostgreSQL 14+
- Access to an Ethereum JSON-RPC endpoint with the deployed `RegistrationRegistry` contract

## Setup
1. Copy `.env.example` to `.env` and fill in the real values (private keys must remain single-line with `\n` escapes).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Apply the migration:
   ```bash
   psql "$DATABASE_URL" -f migrations/001_init.sql
   ```
4. Start the server:
   ```bash
   npm run dev
   ```

## Wallet Login Flow
1. `GET /auth/nonce?address=0xYourWallet` → receive nonce + message.
2. Sign the message off-chain with `personal_sign`.
3. `POST /auth/login` with `{ address, signature }` → receive JWT (RS256) with `role` claim.
4. Use `Authorization: Bearer <token>` for protected endpoints.

## curl Examples
Request a nonce:
```bash
curl "http://localhost:8080/auth/nonce?address=0xabc123..."
```

Submit a MANUFACTURER registration (replace `<token>` and payload fields as needed):
```bash
curl -X POST "http://localhost:8080/api/registrations" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "MANUFACTURER",
    "identification": {
      "uuid": "d290f1ee-6c54-4b01-90e6-d701748f0851",
      "legalName": "Acme Manufacturing",
      "businessRegNo": "REG-12345",
      "countryOfIncorporation": "US"
    },
    "contact": {
      "personName": "Jane Doe",
      "designation": "Director",
      "email": "jane@acme.example",
      "phone": "+1-555-123-0000",
      "address": "123 Industry Way, Springfield"
    },
    "metadata": {
      "publicKey": "0x04deadbeef",
      "smartContractRole": "MANUFACTURER",
      "dateOfRegistration": "2024-01-01"
    },
    "details": {
      "productCategoriesManufactured": ["Widgets", "Gadgets"],
      "certifications": ["ISO9001"]
    }
  }'
```

Update an existing registration (UUID must match the existing record and it will revert to `PENDING` status):
```bash
curl -X PUT "http://localhost:8080/api/registrations/<id>" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "SUPPLIER",
    "identification": {
      "uuid": "4c5b8f62-7db9-4c42-b995-9c6f1b5f2acd",
      "legalName": "Global Supplies Ltd.",
      "businessRegNo": "SUP-445599",
      "countryOfIncorporation": "SG"
    },
    "contact": {
      "personName": "Michael Lee",
      "designation": "Supply Director",
      "email": "michael.lee@globalsupplies.example",
      "phone": "+65-5550-1234",
      "address": "88 Harbour Drive, Singapore"
    },
    "metadata": {
      "publicKey": "0x0456789abcdeffedcba9876543210fedcba9876543210fedcba9876543210fedcb",
      "smartContractRole": "SUPPLIER",
      "dateOfRegistration": "2024-03-15"
    },
    "details": {
      "productCategoriesSupplied": ["Steel", "Aluminum"],
      "sourceRegions": ["CN", "MY"]
    }
  }'
```

List pending registrations:
```bash
curl "http://localhost:8080/api/registrations/pending"
```

Approve a registration (admin token required):
```bash
curl -X PATCH "http://localhost:8080/api/registrations/<id>/approve" \
  -H "Authorization: Bearer <admin-token>"
```

## Smart Contract Development
The reference Solidity contract lives in `blockchain/contracts/RegistrationRegistry.sol` and mirrors the on-chain interface used by the backend. It now supports updates (when the backend calls with `isUpdate=true`).

1. Install the Hardhat workspace dependencies:
   ```bash
   cd blockchain
   npm install
   ```
2. Compile the contract:
   ```bash
   npm run compile
   ```
3. Run tests (add your own under `blockchain/test`):
   ```bash
   npm test
   ```
4. Deploy to the configured network (defaults to `.env` values):
   ```bash
   npm run deploy
   ```
   The script logs the deployed address; copy it into the backend `.env` as `REGISTRY_ADDRESS` and update the ABI file if the contract changes.

## Notes
- Addresses are lowercased for storage and comparison.
- Nonces expire after 10 minutes and are single-use.
- Replace `abi/RegistrationRegistry.json` with the contract ABI used on-chain if it differs from the placeholder.
- Updating a registration triggers a new on-chain transaction and the record re-enters the `PENDING` state until re-approved.

## Integrity Matrix (Registration)
- The integrity matrix reports, per registration row, whether the on-chain payload hash matches the recomputed hash from the stored JSON, and whether the stored DB hash matches the recomputed hash.
- For now, each registration anchors a single hash on-chain (m = 0). The falsification probability for a single hash is exactly `1 / 2^b` (Keccak-256 → `b = 256`).
- When we adopt batched Merkle-root anchoring, `m` becomes the Merkle path length: `m = ceil(log2(N))` for a batch size `N`. The large-b approximation is `(m + 1) / 2^b`.

### Security analysis endpoint
Query the falsification summary directly:

```bash
curl "http://localhost:8080/security/falsification?N=1&b=256"
```

Responses include `{ b, N, m, exact, approx }`. For `N=1` and `b=256`, both `exact` and `approx` are `1/2^256`.

### List endpoints with integrityMatrix
Append `?integrityMatrix=true` to list endpoints to include an `integrityMatrix` array and a `security` object alongside the existing data. Example:

```bash
curl "http://localhost:8080/api/registrations/pending?integrityMatrix=true"
```
