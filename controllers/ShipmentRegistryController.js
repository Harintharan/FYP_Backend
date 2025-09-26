const { ethers } = require("ethers");
const Shipment = require("../models/ShipmentRegistryModel");
require("dotenv").config();

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_OTHER, provider);
const contractABI = require("../blockchain/artifacts/contracts/ShipmentRegistry.sol/ShipmentRegistry.json").abi;
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS_SHIPMENT, contractABI, wallet);

function normalizeArray(arr, keys) {
  if (!Array.isArray(arr)) return "";
  return arr
    .map((obj) => keys.map((k) => obj[k] ?? "").join(","))
    .join("|");
}

// Compute hash
// function computeShipmentHash(shipment) {
//   const checkpoints = (shipment.handoverCheckpoints || [])
//     .map(cp => [
//       cp.start_point, cp.end_point, cp.estimated_arrival_date,
//       cp.time_tolerance, cp.expected_ship_date, cp.required_action
//     ].join(","))
//     .join(";");

//   const items = (shipment.shipmentItems || [])
//     .map(it => `${it.product_uuid}:${it.quantity}`)
//     .join(";");

//   const joined = [
//     shipment.manufacturerUUID || shipment.manufacturer_uuid,
//     shipment.destinationPartyUUID || shipment.destination_party_uuid,
//     checkpoints,
//     items
//   ].join("|");

//   console.log("🟦 Shipment Hashing:", joined);
//   return ethers.keccak256(ethers.toUtf8Bytes(joined));
// }



function computeShipmentHash(shipment) {
  // Always normalize property names
  const manufacturer = shipment.manufacturer_uuid || shipment.manufacturerUUID;
  const destination = shipment.destination_party_uuid || shipment.destinationPartyUUID;

  // Ensure JSON strings are parsed
  const handover = typeof shipment.handover_checkpoints === "string"
    ? JSON.parse(shipment.handover_checkpoints)
    : shipment.handoverCheckpoints || shipment.handover_checkpoints || [];

  const items = typeof shipment.shipment_items === "string"
    ? JSON.parse(shipment.shipment_items)
    : shipment.shipmentItems || shipment.shipment_items || [];

  const joined = [
    manufacturer,
    destination,
    normalizeArray(handover, [
      "start_point",
      "end_point",
      "estimated_arrival_date",
      "time_tolerance",
      "expected_ship_date",
      "required_action"
    ]),
    normalizeArray(items, ["product_uuid", "quantity"])
  ].join("|");

  return ethers.keccak256(ethers.toUtf8Bytes(joined));
}


// Register
const registerShipment = async (req, res) => {
  try {
    const data = req.body;
    const dbHash = computeShipmentHash(data);

    const tx = await contract.registerShipment(dbHash);
    const receipt = await tx.wait();

    const event = receipt.logs
      .map(log => { try { return contract.interface.parseLog(log); } catch { return null; } })
      .find(parsed => parsed && parsed.name === "ShipmentRegistered");

    if (!event) throw new Error("No ShipmentRegistered event found");

    const blockchainShipmentId = event.args.shipmentId.toString();
    const blockchainHash = event.args.hash;

    const saved = await Shipment.createShipment({
      shipment_id: blockchainShipmentId,
      ...data,
      shipment_hash: blockchainHash,
      tx_hash: receipt.hash,
      created_by: wallet.address,
    });

    res.status(201).json({ ...saved, blockchainTx: receipt.hash });
  } catch (err) {
    console.error("❌ Error registering shipment:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Update
const updateShipment = async (req, res) => {
  try {
    const { shipment_id } = req.params;
    const data = req.body;

    // 1️⃣ Validate top-level required fields
    if (!data.manufacturerUUID || !data.destinationPartyUUID) {
      return res.status(400).json({
        message: "manufacturerUUID and destinationPartyUUID are required"
      });
    }

    // 2️⃣ Validate handoverCheckpoints array
    if (!Array.isArray(data.handoverCheckpoints) || data.handoverCheckpoints.length === 0) {
      return res.status(400).json({ message: "handoverCheckpoints must be a non-empty array" });
    }

    for (const [i, cp] of data.handoverCheckpoints.entries()) {
      const requiredFields = [
        "start_point",
        "end_point",
        "estimated_arrival_date",
        "time_tolerance",
        "expected_ship_date",
        "required_action"
      ];
      for (const f of requiredFields) {
        if (!cp[f]) {
          return res.status(400).json({
            message: `handoverCheckpoints[${i}] is missing required field: ${f}`
          });
        }
      }
    }

    // 3️⃣ Validate shipmentItems array
    if (!Array.isArray(data.shipmentItems) || data.shipmentItems.length === 0) {
      return res.status(400).json({ message: "shipmentItems must be a non-empty array" });
    }

    for (const [i, item] of data.shipmentItems.entries()) {
      if (!item.product_uuid || typeof item.quantity !== "number") {
        return res.status(400).json({
          message: `shipmentItems[${i}] must include product_uuid (string) and quantity (number)`
        });
      }
    }

    // 4️⃣ Fetch existing shipment
    const existingShipment = await Shipment.getShipmentById(shipment_id);
    if (!existingShipment) {
      return res.status(404).json({ message: `Shipment ${shipment_id} not found` });
    }

    // 3️⃣ Normalize before hashing
    const newDbHash = computeShipmentHash({
      manufacturerUUID: data.manufacturerUUID,
      destinationPartyUUID: data.destinationPartyUUID,
      handoverCheckpoints: data.handoverCheckpoints,
      shipmentItems: data.shipmentItems
    });

    // 5️⃣ Recompute new hash
  //  const newDbHash = computeShipmentHash(data);

    // 6️⃣ Blockchain update
    const tx = await contract.updateShipment(shipment_id, newDbHash);
    const receipt = await tx.wait();

    // 7️⃣ Update DB
    const updated = await Shipment.updateShipment(shipment_id, {
      manufacturerUUID: data.manufacturerUUID,
      destinationPartyUUID: data.destinationPartyUUID,
      handoverCheckpoints: data.handoverCheckpoints,
      shipmentItems: data.shipmentItems,
      shipment_hash: newDbHash,
      tx_hash: receipt.hash,
      updated_by: wallet.address
    });

    res.status(200).json({ ...updated, blockchainTx: receipt.hash });
  } catch (err) {
    console.error("❌ Error updating shipment:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};




// Get One
const getShipment = async (req, res) => {
  try {
    const { shipment_id } = req.params;
    const shipment = await Shipment.getShipmentById(shipment_id);
    if (!shipment) return res.status(404).json({ message: "Shipment not found" });

    // Normalize + parse arrays
    const dbHash = computeShipmentHash(shipment);

    const blockchainShipment = await contract.getShipment(shipment_id);
    const blockchainHash = blockchainShipment.hash;

    console.log("DB Hash:", dbHash);
    console.log("Blockchain Hash:", blockchainHash);

    const integrity = dbHash === blockchainHash ? "valid" : "tampered";

    res.json({ ...shipment, dbHash, blockchainHash, integrity });
  } catch (err) {
    console.error("❌ Error fetching shipment:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};


// Get All
const getAllShipments = async (req, res) => {
  try {
    const shipments = await Shipment.getAllShipments();

    const result = await Promise.all(
      shipments.map(async (shp) => {
        // ✅ Parse DB JSON strings into arrays before hashing
        const normalized = {
          manufacturerUUID: shp.manufacturer_uuid,
          destinationPartyUUID: shp.destination_party_uuid,
          handoverCheckpoints:
            typeof shp.handover_checkpoints === "string"
              ? JSON.parse(shp.handover_checkpoints)
              : shp.handover_checkpoints,
          shipmentItems:
            typeof shp.shipment_items === "string"
              ? JSON.parse(shp.shipment_items)
              : shp.shipment_items,
        };

        const dbHash = computeShipmentHash(normalized);

        let blockchainHash = null;
        let integrity = "unknown";
        try {
          const bc = await contract.getShipment(shp.shipment_id);
          blockchainHash = bc.hash;
          integrity = dbHash === blockchainHash ? "valid" : "tampered";
        } catch {
          integrity = "not_on_chain";
        }

        return { ...shp, dbHash, blockchainHash, integrity };
      })
    );

    res.json(result);
  } catch (err) {
    console.error("❌ Error fetching shipments:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};



// GET /shipments/product/:uuid
// GET /shipments/product/:uuid
const getShipmentsByProduct = async (req, res) => {
  try {
    const { uuid } = req.params;
    const shipments = await Shipment.searchByProductUUID(uuid);

    // Recompute hashes for validation
    const result = await Promise.all(
      shipments.map(async (shp) => {
        const dbHash = computeShipmentHash(shp);
        let blockchainHash = null;
        let integrity = "unknown";
        try {
          const bc = await contract.getShipment(shp.shipment_id);
          blockchainHash = bc.hash;
          integrity = dbHash === blockchainHash ? "valid" : "tampered";
        } catch {
          integrity = "not_on_chain";
        }
        return { ...shp, dbHash, blockchainHash, integrity };
      })
    );

    res.json(result);
  } catch (err) {
    console.error("❌ Error searching by product UUID:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};




module.exports = { registerShipment, updateShipment, getShipment, getAllShipments,getShipmentsByProduct };
