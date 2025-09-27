// const { ethers } = require("ethers");
// const Shipment = require("../models/ShipmentRegistryModel");
// require("dotenv").config();

// const provider = new ethers.JsonRpcProvider(process.env.CHAIN_RPC_URL);
// const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_OTHER, provider);
// const contractABI = require("../../blockchain/artifacts/contracts/ShipmentRegistry.sol/ShipmentRegistry.json").abi;
// const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS_SHIPMENT, contractABI, wallet);

// function normalizeArray(arr, keys) {
//   if (!Array.isArray(arr)) return "";
//   return arr
//     .map((obj) => keys.map((k) => obj[k] ?? "").join(","))
//     .join("|");
// }

// function computeShipmentHash(shipment) {
//   // Always normalize property names
//   const manufacturer = shipment.manufacturer_uuid || shipment.manufacturerUUID;
//   const destination = shipment.destination_party_uuid || shipment.destinationPartyUUID;

//   // Ensure JSON strings are parsed
//   const handover = typeof shipment.handover_checkpoints === "string"
//     ? JSON.parse(shipment.handover_checkpoints)
//     : shipment.handoverCheckpoints || shipment.handover_checkpoints || [];

//   const items = typeof shipment.shipment_items === "string"
//     ? JSON.parse(shipment.shipment_items)
//     : shipment.shipmentItems || shipment.shipment_items || [];

//   const joined = [
//     manufacturer,
//     destination,
//     normalizeArray(handover, [
//       "start_point",
//       "end_point",
//       "estimated_arrival_date",
//       "time_tolerance",
//       "expected_ship_date",
//       "required_action"
//     ]),
//     normalizeArray(items, ["product_uuid", "quantity"])
//   ].join("|");

//   return ethers.keccak256(ethers.toUtf8Bytes(joined));
// }

// // Register
// const registerShipment = async (req, res) => {
//   try {
//     const data = req.body;
//     const dbHash = computeShipmentHash(data);

//     const tx = await contract.registerShipment(dbHash);
//     const receipt = await tx.wait();

//     const event = receipt.logs
//       .map(log => { try { return contract.interface.parseLog(log); } catch { return null; } })
//       .find(parsed => parsed && parsed.name === "ShipmentRegistered");

//     if (!event) throw new Error("No ShipmentRegistered event found");

//     const blockchainShipmentId = event.args.shipmentId.toString();
//     const blockchainHash = event.args.hash;

//     const saved = await Shipment.createShipment({
//       shipment_id: blockchainShipmentId,
//       ...data,
//       shipment_hash: blockchainHash,
//       tx_hash: receipt.hash,
//       created_by: wallet.address,
//     });

//     res.status(201).json({ ...saved, blockchainTx: receipt.hash });
//   } catch (err) {
//     console.error("❌ Error registering shipment:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// // Update
// const updateShipment = async (req, res) => {
//   try {
//     const { shipment_id } = req.params;
//     const data = req.body;

//     // 1️⃣ Validate top-level required fields
//     if (!data.manufacturerUUID || !data.destinationPartyUUID) {
//       return res.status(400).json({
//         message: "manufacturerUUID and destinationPartyUUID are required"
//       });
//     }

//     // 2️⃣ Validate handoverCheckpoints array
//     if (!Array.isArray(data.handoverCheckpoints) || data.handoverCheckpoints.length === 0) {
//       return res.status(400).json({ message: "handoverCheckpoints must be a non-empty array" });
//     }

//     for (const [i, cp] of data.handoverCheckpoints.entries()) {
//       const requiredFields = [
//         "start_point",
//         "end_point",
//         "estimated_arrival_date",
//         "time_tolerance",
//         "expected_ship_date",
//         "required_action"
//       ];
//       for (const f of requiredFields) {
//         if (!cp[f]) {
//           return res.status(400).json({
//             message: `handoverCheckpoints[${i}] is missing required field: ${f}`
//           });
//         }
//       }
//     }

//     // 3️⃣ Validate shipmentItems array
//     if (!Array.isArray(data.shipmentItems) || data.shipmentItems.length === 0) {
//       return res.status(400).json({ message: "shipmentItems must be a non-empty array" });
//     }

//     for (const [i, item] of data.shipmentItems.entries()) {
//       if (!item.product_uuid || typeof item.quantity !== "number") {
//         return res.status(400).json({
//           message: `shipmentItems[${i}] must include product_uuid (string) and quantity (number)`
//         });
//       }
//     }

//     // 4️⃣ Fetch existing shipment
//     const existingShipment = await Shipment.getShipmentById(shipment_id);
//     if (!existingShipment) {
//       return res.status(404).json({ message: `Shipment ${shipment_id} not found` });
//     }

//     // 3️⃣ Normalize before hashing
//     const newDbHash = computeShipmentHash({
//       manufacturerUUID: data.manufacturerUUID,
//       destinationPartyUUID: data.destinationPartyUUID,
//       handoverCheckpoints: data.handoverCheckpoints,
//       shipmentItems: data.shipmentItems
//     });

//     // 5️⃣ Recompute new hash
//   //  const newDbHash = computeShipmentHash(data);

//     // 6️⃣ Blockchain update
//     const tx = await contract.updateShipment(shipment_id, newDbHash);
//     const receipt = await tx.wait();

//     // 7️⃣ Update DB
//     const updated = await Shipment.updateShipment(shipment_id, {
//       manufacturerUUID: data.manufacturerUUID,
//       destinationPartyUUID: data.destinationPartyUUID,
//       handoverCheckpoints: data.handoverCheckpoints,
//       shipmentItems: data.shipmentItems,
//       shipment_hash: newDbHash,
//       tx_hash: receipt.hash,
//       updated_by: wallet.address
//     });

//     res.status(200).json({ ...updated, blockchainTx: receipt.hash });
//   } catch (err) {
//     console.error("❌ Error updating shipment:", err.message);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// // Get One
// const getShipment = async (req, res) => {
//   try {
//     const { shipment_id } = req.params;
//     const shipment = await Shipment.getShipmentById(shipment_id);
//     if (!shipment) return res.status(404).json({ message: "Shipment not found" });

//     // Normalize + parse arrays
//     const dbHash = computeShipmentHash(shipment);

//     const blockchainShipment = await contract.getShipment(shipment_id);
//     const blockchainHash = blockchainShipment.hash;

//     console.log("DB Hash:", dbHash);
//     console.log("Blockchain Hash:", blockchainHash);

//     const integrity = dbHash === blockchainHash ? "valid" : "tampered";

//     res.json({ ...shipment, dbHash, blockchainHash, integrity });
//   } catch (err) {
//     console.error("❌ Error fetching shipment:", err.message);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// // Get All
// const getAllShipments = async (req, res) => {
//   try {
//     const shipments = await Shipment.getAllShipments();

//     const result = await Promise.all(
//       shipments.map(async (shp) => {
//         // ✅ Parse DB JSON strings into arrays before hashing
//         const normalized = {
//           manufacturerUUID: shp.manufacturer_uuid,
//           destinationPartyUUID: shp.destination_party_uuid,
//           handoverCheckpoints:
//             typeof shp.handover_checkpoints === "string"
//               ? JSON.parse(shp.handover_checkpoints)
//               : shp.handover_checkpoints,
//           shipmentItems:
//             typeof shp.shipment_items === "string"
//               ? JSON.parse(shp.shipment_items)
//               : shp.shipment_items,
//         };

//         const dbHash = computeShipmentHash(normalized);

//         let blockchainHash = null;
//         let integrity = "unknown";
//         try {
//           const bc = await contract.getShipment(shp.shipment_id);
//           blockchainHash = bc.hash;
//           integrity = dbHash === blockchainHash ? "valid" : "tampered";
//         } catch {
//           integrity = "not_on_chain";
//         }

//         return { ...shp, dbHash, blockchainHash, integrity };
//       })
//     );

//     res.json(result);
//   } catch (err) {
//     console.error("❌ Error fetching shipments:", err.message);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// // GET /shipments/product/:uuid
// // GET /shipments/product/:uuid
// const getShipmentsByProduct = async (req, res) => {
//   try {
//     const { uuid } = req.params;
//     const shipments = await Shipment.searchByProductUUID(uuid);

//     // Recompute hashes for validation
//     const result = await Promise.all(
//       shipments.map(async (shp) => {
//         const dbHash = computeShipmentHash(shp);
//         let blockchainHash = null;
//         let integrity = "unknown";
//         try {
//           const bc = await contract.getShipment(shp.shipment_id);
//           blockchainHash = bc.hash;
//           integrity = dbHash === blockchainHash ? "valid" : "tampered";
//         } catch {
//           integrity = "not_on_chain";
//         }
//         return { ...shp, dbHash, blockchainHash, integrity };
//       })
//     );

//     res.json(result);
//   } catch (err) {
//     console.error("❌ Error searching by product UUID:", err.message);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// module.exports = { registerShipment, updateShipment, getShipment, getAllShipments,getShipmentsByProduct };

const { ethers } = require("ethers");
const pool = require("../config/db");
const Shipment = require("../models/ShipmentRegistryModel");
const HandoverCheckpoint = require("../models/ShipmentHandoverCheckpointModel");
require("dotenv").config();

const provider = new ethers.JsonRpcProvider(process.env.CHAIN_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_OTHER, provider);
const contractABI =
  require("../../blockchain/artifacts/contracts/ShipmentRegistry.sol/ShipmentRegistry.json").abi;
const contract = new ethers.Contract(
  process.env.CONTRACT_ADDRESS_SHIPMENT,
  contractABI,
  wallet
);

// function computeShipmentHash(shipment, checkpoints) {
//   const joined = [
//     shipment.manufacturer_uuid || shipment.manufacturerUUID,
//     shipment.destination_party_uuid || shipment.destinationPartyUUID,
//     checkpoints
//       .map(cp =>
//         [cp.start_checkpoint_id, cp.end_checkpoint_id, cp.estimated_arrival_date, cp.time_tolerance, cp.expected_ship_date, cp.required_action].join(",")
//       )
//       .join("|"),
//     shipment.shipmentItems
//       ? shipment.shipmentItems.map(i => `${i.product_uuid},${i.quantity}`).join("|")
//       : JSON.parse(shipment.shipment_items).map(i => `${i.product_uuid},${i.quantity}`).join("|")
//   ].join("|");

//   return ethers.keccak256(ethers.toUtf8Bytes(joined));
// }

function computeShipmentHash(shipment, checkpoints) {
  // Normalize manufacturer and destination IDs
  const manufacturer = shipment.manufacturer_uuid || shipment.manufacturerUUID;
  const destination =
    shipment.destination_party_uuid || shipment.destinationPartyUUID;

  // Normalize checkpoints: assume checkpoints is already an array; if not use an empty array
  const normalizedCheckpoints = Array.isArray(checkpoints) ? checkpoints : [];
  const checkpointsStr = normalizedCheckpoints
    .map((cp) =>
      [
        cp.start_checkpoint_id,
        cp.end_checkpoint_id,
        cp.estimated_arrival_date,
        cp.time_tolerance,
        cp.expected_ship_date,
        cp.required_action,
      ].join(",")
    )
    .join("|");

  // Normalize shipment items: if shipmentItems exists use it;
  // otherwise, if shipment_items is a string, parse it; if not, assume it's already an array.
  let items = [];
  if (shipment.shipmentItems) {
    items = shipment.shipmentItems;
  } else if (shipment.shipment_items) {
    items =
      typeof shipment.shipment_items === "string"
        ? JSON.parse(shipment.shipment_items)
        : shipment.shipment_items;
  }
  const itemsStr = items
    .map((i) => `${i.product_uuid},${i.quantity}`)
    .join("|");

  const joined = [manufacturer, destination, checkpointsStr, itemsStr].join(
    "|"
  );

  return ethers.keccak256(ethers.toUtf8Bytes(joined));
}

// Register shipment + checkpoints
// const registerShipment = async (req, res) => {
//   try {
//     const { manufacturerUUID, destinationPartyUUID, shipmentItems, checkpoints } = req.body;

//     if (!checkpoints || !Array.isArray(checkpoints) || checkpoints.length === 0) {
//       return res.status(400).json({ message: "At least one checkpoint is required" });
//     }

//     const fakeShipment = { manufacturerUUID, destinationPartyUUID, shipmentItems };
//     const dbHash = computeShipmentHash(fakeShipment, checkpoints);

//     const tx = await contract.registerShipment(dbHash);
//     const receipt = await tx.wait();

//     const event = receipt.logs
//       .map(log => { try { return contract.interface.parseLog(log); } catch { return null; } })
//       .find(parsed => parsed && parsed.name === "ShipmentRegistered");

//     if (!event) throw new Error("No ShipmentRegistered event found");

//     const blockchainShipmentId = event.args.shipmentId.toString();

//     // Save shipment
//     const savedShipment = await Shipment.createShipment({
//       shipment_id: blockchainShipmentId,
//       manufacturerUUID,
//       destinationPartyUUID,
//       shipmentItems,
//       shipment_hash: dbHash,
//       tx_hash: receipt.hash,
//       created_by: wallet.address,
//     });

//     // Save checkpoints
//     for (const cp of checkpoints) {
//       await HandoverCheckpoint.addCheckpoint({
//         shipment_id: blockchainShipmentId,
//         ...cp
//       });
//     }

//     const savedCheckpoints = await HandoverCheckpoint.getByShipment(blockchainShipmentId);

//     res.status(201).json({ ...savedShipment, checkpoints: savedCheckpoints, blockchainTx: receipt.hash });
//   } catch (err) {
//     console.error("❌ Error registering shipment:", err.message);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// Register shipment + checkpoints with validation
const registerShipment = async (req, res) => {
  try {
    const {
      manufacturerUUID,
      destinationPartyUUID,
      shipmentItems,
      checkpoints,
    } = req.body;

    // 1️⃣ Basic validations
    if (!manufacturerUUID || !destinationPartyUUID) {
      return res
        .status(400)
        .json({
          message: "manufacturerUUID and destinationPartyUUID are required",
        });
    }

    if (!Array.isArray(shipmentItems) || shipmentItems.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one shipment item is required" });
    }

    if (!Array.isArray(checkpoints) || checkpoints.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one checkpoint is required" });
    }

    // 2️⃣ Validate checkpoint structure
    const requiredFields = [
      "start_checkpoint_id",
      "end_checkpoint_id",
      "estimated_arrival_date",
      "time_tolerance",
      "expected_ship_date",
      "required_action",
    ];

    for (const [i, cp] of checkpoints.entries()) {
      for (const f of requiredFields) {
        if (!cp[f]) {
          return res
            .status(400)
            .json({
              message: `checkpoints[${i}] missing required field: ${f}`,
            });
        }
      }
    }

    // 3️⃣ Validate checkpoint IDs exist in DB
    for (const [i, cp] of checkpoints.entries()) {
      const startExists = await pool.query(
        `SELECT 1 FROM checkpoint_registry WHERE checkpoint_id=$1`,
        [cp.start_checkpoint_id]
      );
      const endExists = await pool.query(
        `SELECT 1 FROM checkpoint_registry WHERE checkpoint_id=$1`,
        [cp.end_checkpoint_id]
      );

      if (startExists.rows.length === 0) {
        return res
          .status(400)
          .json({
            message: `checkpoints[${i}].start_checkpoint_id does not exist`,
          });
      }
      if (endExists.rows.length === 0) {
        return res
          .status(400)
          .json({
            message: `checkpoints[${i}].end_checkpoint_id does not exist`,
          });
      }
    }

    // 4️⃣ Compute shipment hash (safe now)
    const dbHash = computeShipmentHash(
      { manufacturerUUID, destinationPartyUUID, shipmentItems },
      checkpoints
    );

    // 5️⃣ Save to blockchain
    const tx = await contract.registerShipment(dbHash);
    const receipt = await tx.wait();

    const event = receipt.logs
      .map((log) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "ShipmentRegistered");

    if (!event) throw new Error("No ShipmentRegistered event found");

    const blockchainShipmentId = event.args.shipmentId.toString();

    // 6️⃣ Save shipment in DB
    const savedShipment = await Shipment.createShipment({
      shipment_id: blockchainShipmentId,
      manufacturerUUID,
      destinationPartyUUID,
      shipmentItems,
      shipment_hash: dbHash,
      tx_hash: receipt.hash,
      created_by: wallet.address,
    });

    // 7️⃣ Save checkpoints in DB
    for (const cp of checkpoints) {
      await HandoverCheckpoint.addCheckpoint({
        shipment_id: blockchainShipmentId,
        ...cp,
      });
    }

    // 8️⃣ Return enriched response
    const savedCheckpoints = await HandoverCheckpoint.getByShipment(
      blockchainShipmentId
    );

    res.status(201).json({
      ...savedShipment,
      handover_checkpoints: savedCheckpoints,
      blockchainTx: receipt.hash,
    });
  } catch (err) {
    console.error("❌ Error registering shipment:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Get shipment with checkpoints
const getShipment = async (req, res) => {
  try {
    const { shipment_id } = req.params;
    const shipment = await Shipment.getShipmentById(shipment_id);
    console.log("DEBUG fetched shipment:", shipment);
    if (!shipment)
      return res.status(404).json({ message: "Shipment not found" });

    const checkpoints = await HandoverCheckpoint.getByShipment(shipment_id);
    const dbHash = computeShipmentHash(shipment, checkpoints);

    const bc = await contract.getShipment(shipment_id);
    const blockchainHash = bc.hash;

    res.json({
      ...shipment,
      checkpoints,
      dbHash,
      blockchainHash,
      integrity: dbHash === blockchainHash ? "valid" : "tampered",
    });
  } catch (err) {
    console.error("❌ Error fetching shipment:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Update shipment + checkpoints with validation
const updateShipment = async (req, res) => {
  try {
    const { shipment_id } = req.params;
    const {
      manufacturerUUID,
      destinationPartyUUID,
      shipmentItems,
      checkpoints,
    } = req.body;

    // 1️⃣ Fetch existing shipment
    const existing = await Shipment.getShipmentById(shipment_id);
    if (!existing) {
      return res
        .status(404)
        .json({ message: `Shipment ${shipment_id} not found` });
    }

    // 2️⃣ Basic validations
    if (!manufacturerUUID || !destinationPartyUUID) {
      return res
        .status(400)
        .json({
          message: "manufacturerUUID and destinationPartyUUID are required",
        });
    }

    if (!Array.isArray(shipmentItems) || shipmentItems.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one shipment item is required" });
    }

    if (!Array.isArray(checkpoints) || checkpoints.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one checkpoint is required" });
    }

    // 3️⃣ Validate checkpoint structure
    const requiredFields = [
      "start_checkpoint_id",
      "end_checkpoint_id",
      "estimated_arrival_date",
      "time_tolerance",
      "expected_ship_date",
      "required_action",
    ];

    for (const [i, cp] of checkpoints.entries()) {
      for (const f of requiredFields) {
        if (!cp[f]) {
          return res
            .status(400)
            .json({
              message: `checkpoints[${i}] missing required field: ${f}`,
            });
        }
      }
    }

    // 4️⃣ Validate checkpoint IDs exist in DB
    for (const [i, cp] of checkpoints.entries()) {
      const startExists = await pool.query(
        `SELECT 1 FROM checkpoint_registry WHERE checkpoint_id=$1`,
        [cp.start_checkpoint_id]
      );
      const endExists = await pool.query(
        `SELECT 1 FROM checkpoint_registry WHERE checkpoint_id=$1`,
        [cp.end_checkpoint_id]
      );

      if (startExists.rows.length === 0) {
        return res
          .status(400)
          .json({
            message: `checkpoints[${i}].start_checkpoint_id does not exist`,
          });
      }
      if (endExists.rows.length === 0) {
        return res
          .status(400)
          .json({
            message: `checkpoints[${i}].end_checkpoint_id does not exist`,
          });
      }
    }

    // 5️⃣ Compute new hash
    const newDbHash = computeShipmentHash(
      { manufacturerUUID, destinationPartyUUID, shipmentItems },
      checkpoints
    );

    // 6️⃣ Update blockchain
    const tx = await contract.updateShipment(shipment_id, newDbHash);
    const receipt = await tx.wait();

    // 7️⃣ Update shipment in DB
    const updatedShipment = await Shipment.updateShipment(shipment_id, {
      manufacturerUUID,
      destinationPartyUUID,
      shipmentItems,
      shipment_hash: newDbHash,
      tx_hash: receipt.hash,
      updated_by: wallet.address,
    });

    // 8️⃣ Refresh checkpoints in DB (delete + insert new)
    await HandoverCheckpoint.deleteByShipment(shipment_id);
    for (const cp of checkpoints) {
      await HandoverCheckpoint.addCheckpoint({
        shipment_id,
        ...cp,
      });
    }

    const savedCheckpoints = await HandoverCheckpoint.getByShipment(
      shipment_id
    );

    // 9️⃣ Response
    res.status(200).json({
      ...updatedShipment,
      handover_checkpoints: savedCheckpoints,
      blockchainTx: receipt.hash,
    });
  } catch (err) {
    console.error("❌ Error updating shipment:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Get all shipments with checkpoints + integrity check
const getAllShipments = async (req, res) => {
  try {
    const shipments = await Shipment.getAllShipments();

    const result = await Promise.all(
      shipments.map(async (shp) => {
        // 1️⃣ Get checkpoints for this shipment
        const checkpoints = await HandoverCheckpoint.getByShipment(
          shp.shipment_id
        );

        // 2️⃣ Normalize shipment for hashing
        const normalized = {
          manufacturerUUID: shp.manufacturer_uuid,
          destinationPartyUUID: shp.destination_party_uuid,
          shipmentItems:
            typeof shp.shipment_items === "string"
              ? JSON.parse(shp.shipment_items)
              : shp.shipment_items,
        };

        // 3️⃣ Compute DB hash (with checkpoints)
        const dbHash = computeShipmentHash(normalized, checkpoints);

        // 4️⃣ Fetch blockchain hash + check integrity
        let blockchainHash = null;
        let integrity = "unknown";
        try {
          const bc = await contract.getShipment(shp.shipment_id);
          blockchainHash = bc.hash;
          integrity = dbHash === blockchainHash ? "valid" : "tampered";
        } catch (err) {
          integrity = "not_on_chain";
        }

        return {
          ...shp,
          checkpoints,
          dbHash,
          blockchainHash,
          integrity,
        };
      })
    );

    res.json(result);
  } catch (err) {
    console.error("❌ Error fetching all shipments:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  registerShipment,
  getShipment,
  updateShipment,
  getAllShipments,
};
