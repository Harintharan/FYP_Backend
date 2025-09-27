// const { ethers } = require("ethers");
// const Handover = require("../models/ShipmentSegmentHandoverModel");
// require("dotenv").config();

// const provider = new ethers.JsonRpcProvider(process.env.CHAIN_RPC_URL);
// const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_OTHER, provider);
// const contractABI = require("../../blockchain/artifacts/contracts/ShipmentSegmentHandover.sol/ShipmentSegmentHandover.json").abi;
// const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS_SHIPMENT_SEGMENT_HANDOVER, contractABI, wallet);

// // Helper: Stable stringify
// function stableStringify(obj) {
//   if (Array.isArray(obj)) {
//     return `[${obj.map(stableStringify).join(",")}]`;
//   } else if (obj && typeof obj === "object") {
//     return `{${Object.keys(obj).sort().map(k => `"${k}":${stableStringify(obj[k])}`).join(",")}}`;
//   }
//   return JSON.stringify(obj);
// }

// // Hash helper
// function computeHandoverHash(data) {
//   const joined = [
//     data.shipment_id,
//     data.acceptance_id,
//     data.segment_start_checkpoint_id,
//     data.segment_end_checkpoint_id,
//     data.from_party_uuid,
//     data.to_party_uuid,
//     data.handover_timestamp,  // backend-generated text string
//     data.gps_lat || "",
//     data.gps_lon || "",
//     data.quantity_transferred,
//     data.from_party_signature || "",
//     data.to_party_signature || ""
//   ].join("|");

//   return ethers.keccak256(ethers.toUtf8Bytes(joined));
// }

// // Register Handover
// const registerHandover = async (req, res) => {
//   try {
//     const data = req.body;

//     // Backend assigns timestamp
//     data.handover_timestamp = new Date().toISOString();

//     const dbHash = computeHandoverHash(data);

//     const tx = await contract.registerHandover(
//       data.shipment_id,
//       data.acceptance_id,
//       dbHash
//     );
//     const receipt = await tx.wait();

//     const event = receipt.logs.map(log => {
//       try { return contract.interface.parseLog(log); } catch { return null; }
//     }).find(parsed => parsed && parsed.name === "HandoverRegistered");

//     const handoverId = event.args.handoverId.toString();

//     const saved = await Handover.createHandover({
//       handover_id: handoverId,
//       ...data,
//       handover_hash: dbHash,
//       tx_hash: receipt.hash,
//       created_by: wallet.address
//     });

//     res.status(201).json({ ...saved, blockchainTx: receipt.hash });
//   } catch (err) {
//     console.error("❌ Error registering handover:", err.message);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// // Update Handover
// const updateHandover = async (req, res) => {
//   try {
//     const { handover_id } = req.params;
//     const data = req.body;

//     const existing = await Handover.getHandoverById(handover_id);
//     if (!existing) return res.status(404).json({ message: `Handover ${handover_id} not found` });

//     const newDbHash = computeHandoverHash(data);

//     const tx = await contract.updateHandover(handover_id, newDbHash);
//     const receipt = await tx.wait();

//     const updated = await Handover.updateHandover(handover_id, {
//       ...data,
//       handover_hash: newDbHash,
//       tx_hash: receipt.hash,
//       updated_by: wallet.address
//     });

//     res.json({ ...updated, blockchainTx: receipt.hash });
//   } catch (err) {
//     console.error("❌ Error updating handover:", err.message);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// // Get single with integrity check
// const getHandover = async (req, res) => {
//   try {
//     const { handover_id } = req.params;
//     const handover = await Handover.getHandoverById(handover_id);
//     if (!handover) return res.status(404).json({ message: "Handover not found" });

//     // Normalize timestamp as ISO
//     const dbHash = computeHandoverHash({
//       ...handover,
//       handover_timestamp: new Date(handover.handover_timestamp).toISOString()
//     });

//     const bc = await contract.getHandover(handover_id);
//     const blockchainHash = bc.hash;

//     const integrity = dbHash === blockchainHash ? "valid" : "tampered";

//     res.json({ ...handover, dbHash, blockchainHash, integrity });
//   } catch (err) {
//     console.error("❌ Error fetching handover:", err.message);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// // Get all with integrity check
// const getAllHandovers = async (req, res) => {
//   try {
//     const handovers = await Handover.getAllHandovers();
//     const results = await Promise.all(
//       handovers.map(async (h) => {
//         const dbHash = computeHandoverHash({
//           ...h,
//           handover_timestamp: new Date(h.handover_timestamp).toISOString()
//         });

//         let blockchainHash = null;
//         let integrity = "unknown";
//         try {
//           const bc = await contract.getHandover(h.handover_id);
//           blockchainHash = bc.hash;
//           integrity = dbHash === blockchainHash ? "valid" : "tampered";
//         } catch {
//           integrity = "not_on_chain";
//         }

//         return { ...h, dbHash, blockchainHash, integrity };
//       })
//     );
//     res.json(results);
//   } catch (err) {
//     console.error("❌ Error fetching all handovers:", err.message);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// module.exports = { registerHandover, updateHandover, getHandover, getAllHandovers };
const { ethers } = require("ethers");
const Handover = require("../models/ShipmentSegmentHandoverModel");
require("dotenv").config();

const provider = new ethers.JsonRpcProvider(process.env.CHAIN_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_OTHER, provider);
const contractABI =
  require("../../blockchain/artifacts/contracts/ShipmentSegmentHandover.sol/ShipmentSegmentHandover.json").abi;
const contract = new ethers.Contract(
  process.env.CONTRACT_ADDRESS_SHIPMENT_SEGMENT_HANDOVER,
  contractABI,
  wallet
);

//
// Hash helper
//

function normalizeNumber(num, decimals = 6) {
  if (num === null || num === undefined || num === "") return "";
  return parseFloat(num).toFixed(decimals); // always "6.901200"
}

function computeHandoverHash(data) {
  const joined = [
    data.shipment_id,
    data.acceptance_id,
    data.segment_start_checkpoint_id,
    data.segment_end_checkpoint_id,
    data.from_party_uuid,
    data.to_party_uuid,
    data.handover_timestamp,
    normalizeNumber(data.gps_lat), // ✅ normalize GPS
    normalizeNumber(data.gps_lon),
    data.quantity_transferred,
    data.from_party_signature || "",
    data.to_party_signature || "",
  ].join("|");

  console.log("🟦 Hash input:", joined);
  const hash = ethers.keccak256(ethers.toUtf8Bytes(joined));
  console.log("🟢 Computed Hash:", hash);
  return hash;
}

//
// Validation helper
//
function validateHandoverPayload(data) {
  const required = [
    "shipment_id",
    "acceptance_id",
    "segment_start_checkpoint_id",
    "segment_end_checkpoint_id",
    "from_party_uuid",
    "to_party_uuid",
    "quantity_transferred",
    "from_party_signature",
    "to_party_signature",
  ];
  for (const f of required) {
    if (!data[f]) return `Missing required field: ${f}`;
  }
  return null;
}

//
// Register Handover
//
const registerHandover = async (req, res) => {
  try {
    const data = req.body;
    console.log("📥 Incoming register payload:", data);

    // Normalize timestamp
    if (!data.handover_timestamp) {
      data.handover_timestamp = new Date().toISOString();
    }

    // Extract GPS if nested
    if (data.handover_gps) {
      data.gps_lat = data.handover_gps.lat ?? null;
      data.gps_lon = data.handover_gps.lon ?? null;
    }

    const errMsg = validateHandoverPayload(data);
    if (errMsg) return res.status(400).json({ message: errMsg });

    const dbHash = computeHandoverHash(data);

    const tx = await contract.registerHandover(
      data.shipment_id,
      data.acceptance_id,
      dbHash
    );
    const receipt = await tx.wait();
    console.log("📤 Blockchain register tx hash:", receipt.hash);

    const event = receipt.logs
      .map((log) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "SegmentHandedOver");

    const handoverId = event.args.handoverId.toString();

    const saved = await Handover.createHandover({
      handover_id: handoverId,
      ...data,
      handover_hash: dbHash,
      tx_hash: receipt.hash,
      created_by: wallet.address,
      gps_lat: normalizeNumber(data.gps_lat),
      gps_lon: normalizeNumber(data.gps_lon),
    });

    res.status(201).json({ ...saved, blockchainTx: receipt.hash });
  } catch (err) {
    console.error("❌ Error registering handover:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

//
// Update Handover
//
const updateHandover = async (req, res) => {
  try {
    const { handover_id } = req.params;
    const data = req.body;
    console.log("📥 Incoming update payload:", data);

    const existing = await Handover.getHandoverById(handover_id);
    if (!existing)
      return res.status(404).json({ message: "Handover not found" });

    // Extract GPS if nested
    if (data.handover_gps) {
      data.gps_lat = data.handover_gps.lat ?? null;
      data.gps_lon = data.handover_gps.lon ?? null;
    }

    if (!data.handover_timestamp) {
      data.handover_timestamp = existing.handover_timestamp;
    }

    const errMsg = validateHandoverPayload(data);
    if (errMsg) return res.status(400).json({ message: errMsg });

    const newDbHash = computeHandoverHash(data);

    const tx = await contract.updateHandover(handover_id, newDbHash);
    const receipt = await tx.wait();
    console.log("📤 Blockchain update tx hash:", receipt.hash);

    const updated = await Handover.updateHandover(handover_id, {
      ...data,
      handover_hash: newDbHash,
      tx_hash: receipt.hash,
      updated_by: wallet.address,
      gps_lat: normalizeNumber(data.gps_lat), // ✅ normalize GPS
      gps_lon: normalizeNumber(data.gps_lon),
    });

    res.json({ ...updated, blockchainTx: receipt.hash });
  } catch (err) {
    console.error("❌ Error updating handover:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

//
// Get All Handovers
//
const getAllHandovers = async (req, res) => {
  try {
    const handovers = await Handover.getAllHandovers();
    const result = await Promise.all(
      handovers.map(async (h) => {
        const dbHash = computeHandoverHash(h);
        let blockchainHash = null;
        let integrity = "unknown";
        try {
          const bc = await contract.getHandover(h.handover_id);
          blockchainHash = bc.hash;
          integrity = dbHash === blockchainHash ? "valid" : "tampered";
        } catch {
          integrity = "not_on_chain";
        }
        return { ...h, dbHash, blockchainHash, integrity };
      })
    );
    res.json(result);
  } catch (err) {
    console.error("❌ Error fetching all handovers:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const getHandover = async (req, res) => {
  try {
    const { handover_id } = req.params;

    // 1️⃣ Fetch from DB
    const handover = await Handover.getHandoverById(handover_id);
    if (!handover) {
      return res.status(404).json({ message: "Handover not found" });
    }

    // 2️⃣ Normalize & recompute hash
    const dbHash = computeHandoverHash({
      ...handover,
      handover_timestamp: new Date(handover.handover_timestamp).toISOString(),
    });

    // 3️⃣ Fetch from blockchain
    let blockchainHash = null;
    let integrity = "unknown";
    try {
      const bc = await contract.getHandover(handover_id);
      blockchainHash = bc.hash;
      integrity = dbHash === blockchainHash ? "valid" : "tampered";
    } catch {
      integrity = "not_on_chain";
    }

    // 4️⃣ Respond
    res.json({ ...handover, dbHash, blockchainHash, integrity });
  } catch (err) {
    console.error("❌ Error fetching handover:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  registerHandover,
  updateHandover,
  getAllHandovers,
  getHandover,
};
