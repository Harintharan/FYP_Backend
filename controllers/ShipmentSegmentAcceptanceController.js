// const { ethers } = require("ethers");
// const SegmentAcceptance = require("../models/ShipmentSegmentAcceptanceModel");
// require("dotenv").config();

// const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
// const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_OTHER, provider);
// const contractABI = require("../blockchain/artifacts/contracts/ShipmentSegmentAcceptance.sol/ShipmentSegmentAcceptance.json").abi;
// const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS_SHIPMENT_SEGMENT_ACCEPTANCE, contractABI, wallet);


// function stableStringify(obj) {
//     return JSON.stringify(obj, Object.keys(obj).sort());
// }
// //
// // 🔹 Hash helper
// //
// function computeAcceptanceHash(data) {
//     const joined = [
//         data.shipment_id,
//         data.segment_start_checkpoint_id,
//         data.segment_end_checkpoint_id,
//         data.assigned_role,
//         data.assigned_party_uuid,
//         data.estimated_pickup_time,
//         data.estimated_delivery_time,
//         stableStringify(data.shipment_items),   // ✅ stable JSON serialization
//         data.acceptance_timestamp || ""        // ✅ include acceptance timestamp
//     ].join("|");

//     return ethers.keccak256(ethers.toUtf8Bytes(joined));
// }

// //
// // 🔹 Validation
// //
// function validateAcceptancePayload(data) {
//     const requiredTop = [
//         "shipment_id",
//         "segment_start_checkpoint_id",
//         "segment_end_checkpoint_id",
//         "assigned_role",
//         "assigned_party_uuid"
//     ];

//     for (const f of requiredTop) {
//         if (!data[f]) return `Missing required field: ${f}`;
//     }

//     if (!Array.isArray(data.shipment_items) || data.shipment_items.length === 0) {
//         return "shipment_items must be a non-empty array";
//     }

//     for (const [i, item] of data.shipment_items.entries()) {
//         const requiredItemFields = [
//             "product_uuid",
//             "quantity",
//             "container_id",
//             "container_wifi_ssid",
//             "container_wifi_password"
//         ];
//         for (const f of requiredItemFields) {
//             if (!item[f]) {
//                 return `shipment_items[${i}] is missing required field: ${f}`;
//             }
//         }
//     }

//     return null;
// }

// //
// // 🔹 Register
// //
// const registerSegmentAcceptance = async (req, res) => {
//     try {
//         const data = req.body;



//         const errMsg = validateAcceptancePayload(data);
//         if (errMsg) return res.status(400).json({ message: errMsg });

//         const acceptanceTimestamp = new Date().toISOString();
//         data.acceptance_timestamp = acceptanceTimestamp;

//         const dbHash = computeAcceptanceHash(data);

//         const tx = await contract.registerSegmentAcceptance(
//             data.shipment_id,
//             dbHash,
//             data.digital_signature || ""
//         );
//         const receipt = await tx.wait();

//         const event = receipt.logs
//             .map((log) => {
//                 try {
//                     return contract.interface.parseLog(log);
//                 } catch {
//                     return null;
//                 }
//             })
//             .find((parsed) => parsed && parsed.name === "SegmentAccepted");

//         const acceptanceId = event.args.acceptanceId.toString();

//         const saved = await SegmentAcceptance.createSegmentAcceptance({
//             acceptance_id: acceptanceId,
//             ...data,
//             acceptance_hash: dbHash,
//             tx_hash: receipt.hash,
//             created_by: wallet.address
//         });

//         res.status(201).json({ ...saved, blockchainTx: receipt.hash });
//     } catch (err) {
//         console.error("❌ Error registering acceptance:", err.message);
//         res.status(500).json({ message: "Server error" });
//     }
// };

// //
// // 🔹 Update
// //
// const updateSegmentAcceptance = async (req, res) => {
//     try {
//         const { acceptance_id } = req.params;
//         const data = req.body;

//         const errMsg = validateAcceptancePayload(data);
//         if (errMsg) return res.status(400).json({ message: errMsg });

//         const acceptanceTimestamp = new Date().toISOString();
//         data.acceptance_timestamp = acceptanceTimestamp;


//         const existing = await SegmentAcceptance.getSegmentAcceptanceById(acceptance_id);
//         if (!existing) {
//             return res.status(404).json({ message: `Acceptance ${acceptance_id} not found` });
//         }

//         const newDbHash = computeAcceptanceHash(data);

//         const tx = await contract.updateSegmentAcceptance(acceptance_id, newDbHash);
//         const receipt = await tx.wait();

//         const updated = await SegmentAcceptance.updateSegmentAcceptance(acceptance_id, {
//             ...data,
//             acceptance_hash: newDbHash,
//             tx_hash: receipt.hash,
//             updated_by: wallet.address
//         });

//         res.json({ ...updated, blockchainTx: receipt.hash });
//     } catch (err) {
//         console.error("❌ Error updating acceptance:", err.message);
//         res.status(500).json({ message: "Server error" });
//     }
// };

// //
// // Get Single Acceptance with Integrity Check
// //
// const getSegmentAcceptance = async (req, res) => {
//     try {
//         const { acceptance_id } = req.params;

//         // 1️⃣ Fetch from DB
//         const acceptance = await SegmentAcceptance.getSegmentAcceptanceById(acceptance_id);
//         if (!acceptance) {
//             return res.status(404).json({ message: "Acceptance not found" });
//         }

//         // 2️⃣ Recompute DB hash
//         const dbHash = computeAcceptanceHash(acceptance);

//         // 3️⃣ Fetch from blockchain
//         const bc = await contract.getSegmentAcceptance(acceptance_id);
//         const blockchainHash = bc.hash;

//         // 4️⃣ Compare
//         const integrity = dbHash === blockchainHash ? "valid" : "tampered";

//         res.json({ ...acceptance, dbHash, blockchainHash, integrity });
//     } catch (err) {
//         console.error("❌ Error fetching acceptance:", err.message);
//         res.status(500).json({ message: "Server error" });
//     }
// };


// module.exports = {
//     registerSegmentAcceptance,
//     updateSegmentAcceptance,
//     getSegmentAcceptance
// };
// const { ethers } = require("ethers");
// const SegmentAcceptance = require("../models/ShipmentSegmentAcceptanceModel");
// require("dotenv").config();

// const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
// const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_OTHER, provider);
// const contractABI = require("../blockchain/artifacts/contracts/ShipmentSegmentAcceptance.sol/ShipmentSegmentAcceptance.json").abi;
// const contract = new ethers.Contract(
//     process.env.CONTRACT_ADDRESS_SHIPMENT_SEGMENT_ACCEPTANCE,
//     contractABI,
//     wallet
// );

// //
// // 🔹 Helpers
// //

// // Always normalize timestamp to ISO UTC
// function normalizeTimestamp(ts) {
//     if (!ts) return "";
//     return new Date(ts).toISOString();
// }

// // Stable JSON serialization (sorted keys, no whitespace)
// function stableStringify(obj) {
//     if (Array.isArray(obj)) {
//         return JSON.stringify(
//             obj.map((item) => {
//                 const sorted = {};
//                 Object.keys(item)
//                     .sort()
//                     .forEach((k) => (sorted[k] = item[k]));
//                 return sorted;
//             })
//         );
//     } else if (typeof obj === "object" && obj !== null) {
//         const sorted = {};
//         Object.keys(obj)
//             .sort()
//             .forEach((k) => (sorted[k] = obj[k]));
//         return JSON.stringify(sorted);
//     }
//     return JSON.stringify(obj);
// }

// // Compute deterministic hash
// function computeAcceptanceHash(data) {
//     const joined = [
//         data.shipment_id,
//         data.segment_start_checkpoint_id,
//         data.segment_end_checkpoint_id,
//         data.assigned_role,
//         data.assigned_party_uuid,
//         data.estimated_pickup_time,
//         data.estimated_delivery_time,
//         stableStringify(data.shipment_items), // ✅ sorted JSON
//         normalizeTimestamp(data.acceptance_timestamp) // ✅ normalized timestamp
//     ].join("|");

//     console.log("🟦 Hash input:", joined); // debug
//     return ethers.keccak256(ethers.toUtf8Bytes(joined));
// }

// // Validate payload before insert/update
// function validateAcceptancePayload(data) {
//     const requiredTop = [
//         "shipment_id",
//         "segment_start_checkpoint_id",
//         "segment_end_checkpoint_id",
//         "assigned_role",
//         "assigned_party_uuid"
//     ];
//     for (const f of requiredTop) {
//         if (!data[f]) return `Missing required field: ${f}`;
//     }

//     if (!Array.isArray(data.shipment_items) || data.shipment_items.length === 0) {
//         return "shipment_items must be a non-empty array";
//     }

//     for (const [i, item] of data.shipment_items.entries()) {
//         const requiredItemFields = [
//             "product_uuid",
//             "quantity",
//             "container_id",
//             "container_wifi_ssid",
//             "container_wifi_password"
//         ];
//         for (const f of requiredItemFields) {
//             if (!item[f]) {
//                 return `shipment_items[${i}] is missing required field: ${f}`;
//             }
//         }
//     }

//     return null;
// }

// //
// // 🔹 Register
// //
// const registerSegmentAcceptance = async (req, res) => {
//     try {
//         const data = req.body;

//         // Backend generates acceptance timestamp
//         data.acceptance_timestamp = normalizeTimestamp(
//             data.acceptance_timestamp || new Date()
//         );

//         const errMsg = validateAcceptancePayload(data);
//         if (errMsg) return res.status(400).json({ message: errMsg });

//         const dbHash = computeAcceptanceHash(data);

//         const tx = await contract.registerSegmentAcceptance(
//             data.shipment_id,
//             dbHash,
//             data.digital_signature || ""
//         );
//         const receipt = await tx.wait();

//         const event = receipt.logs
//             .map((log) => {
//                 try {
//                     return contract.interface.parseLog(log);
//                 } catch {
//                     return null;
//                 }
//             })
//             .find((parsed) => parsed && parsed.name === "SegmentAccepted");

//         const acceptanceId = event.args.acceptanceId.toString();

//         const saved = await SegmentAcceptance.createSegmentAcceptance({
//             acceptance_id: acceptanceId,
//             ...data,
//             shipment_items: data.shipment_items,
//             acceptance_hash: dbHash,
//             tx_hash: receipt.hash,
//             created_by: wallet.address
//         });

//         res.status(201).json({ ...saved, blockchainTx: receipt.hash });
//     } catch (err) {
//         console.error("❌ Error registering acceptance:", err.message);
//         res.status(500).json({ message: "Server error" });
//     }
// };

// //
// // 🔹 Update
// //
// const updateSegmentAcceptance = async (req, res) => {
//     try {
//         const { acceptance_id } = req.params;
//         const data = req.body;

//         data.acceptance_timestamp = normalizeTimestamp(
//             data.acceptance_timestamp || new Date()
//         );

//         const errMsg = validateAcceptancePayload(data);
//         if (errMsg) return res.status(400).json({ message: errMsg });

//         const existing = await SegmentAcceptance.getSegmentAcceptanceById(
//             acceptance_id
//         );
//         if (!existing) {
//             return res
//                 .status(404)
//                 .json({ message: `Acceptance ${acceptance_id} not found` });
//         }

//         const newDbHash = computeAcceptanceHash(data);

//         const tx = await contract.updateSegmentAcceptance(
//             acceptance_id,
//             newDbHash
//         );
//         const receipt = await tx.wait();

//         const updated = await SegmentAcceptance.updateSegmentAcceptance(
//             acceptance_id,
//             {
//                 ...data,
//                 shipment_items: data.shipment_items,
//                 acceptance_hash: newDbHash,
//                 tx_hash: receipt.hash,
//                 updated_by: wallet.address
//             }
//         );

//         res.json({ ...updated, blockchainTx: receipt.hash });
//     } catch (err) {
//         console.error("❌ Error updating acceptance:", err.message);
//         res.status(500).json({ message: "Server error" });
//     }
// };

// //
// // 🔹 Get Single Acceptance with Integrity Check
// //
// const getSegmentAcceptance = async (req, res) => {
//     try {
//         const { acceptance_id } = req.params;

//         const acceptance = await SegmentAcceptance.getSegmentAcceptanceById(
//             acceptance_id
//         );
//         if (!acceptance) {
//             return res.status(404).json({ message: "Acceptance not found" });
//         }

//         let items = acceptance.shipment_items;
//         if (typeof items === "string") {
//             try {
//                 items = JSON.parse(items);
//             } catch {
//                 items = [];
//             }
//         }
//         acceptance.shipment_items = items;

//         acceptance.acceptance_timestamp = normalizeTimestamp(
//             acceptance.acceptance_timestamp
//         );

//         const dbHash = computeAcceptanceHash({
//             ...acceptance,
//             shipment_items: items
//         });

//         const bc = await contract.getSegmentAcceptance(acceptance_id);
//         const blockchainHash = bc.hash;

//         const integrity = dbHash === blockchainHash ? "valid" : "tampered";

//         res.json({ ...acceptance, dbHash, blockchainHash, integrity });
//     } catch (err) {
//         console.error("❌ Error fetching acceptance:", err.message);
//         res.status(500).json({ message: "Server error" });
//     }
// };

// module.exports = {
//     registerSegmentAcceptance,
//     updateSegmentAcceptance,
//     getSegmentAcceptance
// };

const { ethers } = require("ethers");
const SegmentAcceptance = require("../models/ShipmentSegmentAcceptanceModel");
require("dotenv").config();

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_OTHER, provider);
const contractABI = require("../blockchain/artifacts/contracts/ShipmentSegmentAcceptance.sol/ShipmentSegmentAcceptance.json").abi;
const contract = new ethers.Contract(
    process.env.CONTRACT_ADDRESS_SHIPMENT_SEGMENT_ACCEPTANCE,
    contractABI,
    wallet
);

//
// 🔹 Helpers
//


function stableStringify(obj) {
    if (Array.isArray(obj)) {
        return JSON.stringify(
            obj.map((item) => {
                const sorted = {};
                Object.keys(item)
                    .sort()
                    .forEach((k) => (sorted[k] = item[k]));
                return sorted;
            })
        );
    } else if (typeof obj === "object" && obj !== null) {
        const sorted = {};
        Object.keys(obj)
            .sort()
            .forEach((k) => (sorted[k] = obj[k]));
        return JSON.stringify(sorted);
    }
    return JSON.stringify(obj);
}

function computeAcceptanceHash(data) {
    const joined = [
        data.shipment_id,
        data.segment_start_checkpoint_id,
        data.segment_end_checkpoint_id,
        data.assigned_role,
        data.assigned_party_uuid,
        data.estimated_pickup_time,
        data.estimated_delivery_time,
        stableStringify(data.shipment_items),
        data.acceptance_timestamp || ""
    ].join("|");

    console.log("🟦 Hash input:", joined);
    const hash = ethers.keccak256(ethers.toUtf8Bytes(joined));
    console.log("🟢 Computed Hash:", hash);
    return hash;
}


function validateAcceptancePayload(data) {
    const requiredTop = [
        "shipment_id",
        "segment_start_checkpoint_id",
        "segment_end_checkpoint_id",
        "assigned_role",
        "assigned_party_uuid"
    ];
    for (const f of requiredTop) {
        if (!data[f]) return `Missing required field: ${f}`;
    }

    if (!Array.isArray(data.shipment_items) || data.shipment_items.length === 0) {
        return "shipment_items must be a non-empty array";
    }

    for (const [i, item] of data.shipment_items.entries()) {
        const requiredItemFields = [
            "product_uuid",
            "quantity",
            "container_id",
            "container_wifi_ssid",
            "container_wifi_password"
        ];
        for (const f of requiredItemFields) {
            if (!item[f]) {
                return `shipment_items[${i}] is missing required field: ${f}`;
            }
        }
    }

    return null;
}

//
// 🔹 Register
//
//
// 🔹 Register
//
const registerSegmentAcceptance = async (req, res) => {
  try {
    const data = req.body;

    // Always add backend-generated timestamp
    data.acceptance_timestamp = new Date().toISOString();

    const errMsg = validateAcceptancePayload(data);
    if (errMsg) return res.status(400).json({ message: errMsg });

    // Normalize pickup/delivery if provided
    if (data.estimated_pickup_time) {
      const d = new Date(data.estimated_pickup_time);
      if (isNaN(d)) return res.status(400).json({ message: "Invalid estimated_pickup_time" });
      data.estimated_pickup_time = d.toISOString();
    }
    if (data.estimated_delivery_time) {
      const d = new Date(data.estimated_delivery_time);
      if (isNaN(d)) return res.status(400).json({ message: "Invalid estimated_delivery_time" });
      data.estimated_delivery_time = d.toISOString();
    }

    console.log("📥 Incoming register payload:", data);

    const dbHash = computeAcceptanceHash(data);

    const tx = await contract.registerSegmentAcceptance(
      data.shipment_id,
      dbHash,
      data.digital_signature || ""
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
      .find((parsed) => parsed && parsed.name === "SegmentAccepted");

    const acceptanceId = event.args.acceptanceId.toString();

    const saved = await SegmentAcceptance.createSegmentAcceptance({
      acceptance_id: acceptanceId,
      ...data,
      shipment_items: data.shipment_items,
      acceptance_hash: dbHash,
      tx_hash: receipt.hash,
      created_by: wallet.address
    });

    res.status(201).json({ ...saved, blockchainTx: receipt.hash });
  } catch (err) {
    console.error("❌ Error registering acceptance:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

//
// 🔹 Update
//
const updateSegmentAcceptance = async (req, res) => {
  try {
    const { acceptance_id } = req.params;
    const data = req.body;

    const errMsg = validateAcceptancePayload(data);
    if (errMsg) return res.status(400).json({ message: errMsg });

    // Normalize pickup/delivery if provided
    if (data.estimated_pickup_time) {
      const d = new Date(data.estimated_pickup_time);
      if (isNaN(d)) return res.status(400).json({ message: "Invalid estimated_pickup_time" });
      data.estimated_pickup_time = d.toISOString();
    }
    if (data.estimated_delivery_time) {
      const d = new Date(data.estimated_delivery_time);
      if (isNaN(d)) return res.status(400).json({ message: "Invalid estimated_delivery_time" });
      data.estimated_delivery_time = d.toISOString();
    }

    const existing = await SegmentAcceptance.getSegmentAcceptanceById(acceptance_id);
    if (!existing) {
      return res.status(404).json({ message: `Acceptance ${acceptance_id} not found` });
    }

    data.acceptance_timestamp = existing.acceptance_timestamp;

    console.log("📥 Incoming update payload:", data);

    const newDbHash = computeAcceptanceHash({
     
      ...data,
    acceptance_timestamp: existing.acceptance_timestamp
    });

    const tx = await contract.updateSegmentAcceptance(acceptance_id, newDbHash);
    const receipt = await tx.wait();

    console.log("📤 Blockchain update tx hash:", receipt.hash);

    const updated = await SegmentAcceptance.updateSegmentAcceptance(acceptance_id, {
      ...data,
      acceptance_timestamp: existing.acceptance_timestamp, // keep old timestamp
      shipment_items: data.shipment_items,
      acceptance_hash: newDbHash,
      tx_hash: receipt.hash,
      updated_by: wallet.address
    });

    res.json({ ...updated, blockchainTx: receipt.hash });
  } catch (err) {
    console.error("❌ Error updating acceptance:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

//
// 🔹 Get
//
const getSegmentAcceptance = async (req, res) => {
  try {
    const { acceptance_id } = req.params;
    const acceptance = await SegmentAcceptance.getSegmentAcceptanceById(acceptance_id);
    if (!acceptance) return res.status(404).json({ message: "Acceptance not found" });

    if (typeof acceptance.shipment_items === "string") {
      try {
        acceptance.shipment_items = JSON.parse(acceptance.shipment_items);
      } catch {
        acceptance.shipment_items = [];
      }
    }

    console.log("🔹 Raw DB record:", acceptance);

    const dbHash = computeAcceptanceHash(acceptance);

    const bc = await contract.getSegmentAcceptance(acceptance_id);
    const blockchainHash = bc.hash;

    console.log("🟢 Recomputed DB Hash:", dbHash);
    console.log("🟣 Blockchain Hash:", blockchainHash);

    const integrity = dbHash === blockchainHash ? "valid" : "tampered";

    res.json({ ...acceptance, dbHash, blockchainHash, integrity });
  } catch (err) {
    console.error("❌ Error fetching acceptance:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};
const getAllSegmentAcceptances = async (req, res) => {
  try {
    // 1️⃣ Fetch all from DB
    const acceptances = await SegmentAcceptance.getAllSegmentAcceptances();

    // 2️⃣ Process each
    const results = await Promise.all(
      acceptances.map(async (acc) => {
        // Parse shipment_items if string
        let items = acc.shipment_items;
        if (typeof items === "string") {
          try {
            items = JSON.parse(items);
          } catch {
            items = [];
          }
        }
        acc.shipment_items = items;

        // Recompute DB hash
        const dbHash = computeAcceptanceHash(acc);

        // Get blockchain hash
        let blockchainHash = null;
        let integrity = "unknown";
        try {
          const bc = await contract.getSegmentAcceptance(acc.acceptance_id);
          blockchainHash = bc.hash;
          integrity = dbHash === blockchainHash ? "valid" : "tampered";
        } catch (err) {
          console.warn(`⚠️ Acceptance ${acc.acceptance_id} not found on chain`);
          integrity = "not_on_chain";
        }

        return { ...acc, dbHash, blockchainHash, integrity };
      })
    );

    res.json(results);
  } catch (err) {
    console.error("❌ Error fetching all acceptances:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};


module.exports = {
    registerSegmentAcceptance,
    updateSegmentAcceptance,
    getSegmentAcceptance,
    getAllSegmentAcceptances
};

