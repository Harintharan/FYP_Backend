import dotenv from "dotenv";
import { ethers } from "ethers";
import ShipmentRegistryArtifact from "../../blockchain/artifacts/contracts/ShipmentRegistry.sol/ShipmentRegistry.json" with { type: "json" };
import {
  createShipment,
  updateShipment as updateShipmentRecord,
  getShipmentById,
  getAllShipments as getAllShipmentRecords,
} from "../models/ShipmentRegistryModel.js";
import {
  addCheckpoint,
  getByShipment,
  deleteByShipment,
} from "../models/ShipmentHandoverCheckpointModel.js";
import { query } from "../db.js";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.CHAIN_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_OTHER, provider);
const contractABI = ShipmentRegistryArtifact.abi;
const contract = new ethers.Contract(
  process.env.CONTRACT_ADDRESS_SHIPMENT,
  contractABI,
  wallet
);

function computeShipmentHash(shipment, checkpoints) {
  const manufacturer = shipment.manufacturer_uuid || shipment.manufacturerUUID;
  const destination =
    shipment.destination_party_uuid || shipment.destinationPartyUUID;

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
    .map((item) => `${item.product_uuid},${item.quantity}`)
    .join("|");

  const joined = [manufacturer, destination, checkpointsStr, itemsStr].join(
    "|"
  );

  return ethers.keccak256(ethers.toUtf8Bytes(joined));
}

async function assertCheckpointExists(checkpointId) {
  const { rows } = await query(
    `SELECT 1 FROM checkpoint_registry WHERE checkpoint_id = $1`,
    [checkpointId]
  );
  return rows.length > 0;
}

export async function registerShipment(req, res) {
  try {
    const {
      manufacturerUUID,
      destinationPartyUUID,
      shipmentItems,
      checkpoints,
    } = req.body;

    if (!manufacturerUUID || !destinationPartyUUID) {
      return res.status(400).json({
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

    const requiredFields = [
      "start_checkpoint_id",
      "end_checkpoint_id",
      "estimated_arrival_date",
      "time_tolerance",
      "expected_ship_date",
      "required_action",
    ];

    for (const [index, checkpoint] of checkpoints.entries()) {
      for (const field of requiredFields) {
        if (!checkpoint[field]) {
          return res.status(400).json({
            message: `checkpoints[${index}] missing required field: ${field}`,
          });
        }
      }
    }

    for (const [index, checkpoint] of checkpoints.entries()) {
      const startExists = await assertCheckpointExists(
        checkpoint.start_checkpoint_id
      );
      const endExists = await assertCheckpointExists(
        checkpoint.end_checkpoint_id
      );

      if (!startExists) {
        return res.status(400).json({
          message: `checkpoints[${index}].start_checkpoint_id does not exist`,
        });
      }
      if (!endExists) {
        return res.status(400).json({
          message: `checkpoints[${index}].end_checkpoint_id does not exist`,
        });
      }
    }

    const dbHash = computeShipmentHash(
      { manufacturerUUID, destinationPartyUUID, shipmentItems },
      checkpoints
    );

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

    if (!event) {
      throw new Error("No ShipmentRegistered event found");
    }

    const blockchainShipmentId = event.args.shipmentId.toString();

    const savedShipment = await createShipment({
      shipment_id: blockchainShipmentId,
      manufacturerUUID,
      destinationPartyUUID,
      shipmentItems,
      shipment_hash: dbHash,
      tx_hash: receipt.hash,
      created_by: wallet.address,
    });

    for (const checkpoint of checkpoints) {
      await addCheckpoint({
        shipment_id: blockchainShipmentId,
        ...checkpoint,
      });
    }

    const savedCheckpoints = await getByShipment(blockchainShipmentId);

    res.status(201).json({
      ...savedShipment,
      handover_checkpoints: savedCheckpoints,
      blockchainTx: receipt.hash,
    });
  } catch (err) {
    console.error("❌ Error registering shipment:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}

export async function getShipment(req, res) {
  try {
    const { shipment_id } = req.params;
    const shipment = await getShipmentById(shipment_id);
    console.log("DEBUG fetched shipment:", shipment);
    if (!shipment) {
      return res.status(404).json({ message: "Shipment not found" });
    }

    const checkpoints = await getByShipment(shipment_id);
    const dbHash = computeShipmentHash(shipment, checkpoints);

    const onchainShipment = await contract.getShipment(shipment_id);
    const blockchainHash = onchainShipment.hash;

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
}

export async function updateShipment(req, res) {
  try {
    const { shipment_id } = req.params;
    const {
      manufacturerUUID,
      destinationPartyUUID,
      shipmentItems,
      checkpoints,
    } = req.body;

    const existing = await getShipmentById(shipment_id);
    if (!existing) {
      return res
        .status(404)
        .json({ message: `Shipment ${shipment_id} not found` });
    }

    if (!manufacturerUUID || !destinationPartyUUID) {
      return res.status(400).json({
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

    const requiredFields = [
      "start_checkpoint_id",
      "end_checkpoint_id",
      "estimated_arrival_date",
      "time_tolerance",
      "expected_ship_date",
      "required_action",
    ];

    for (const [index, checkpoint] of checkpoints.entries()) {
      for (const field of requiredFields) {
        if (!checkpoint[field]) {
          return res.status(400).json({
            message: `checkpoints[${index}] missing required field: ${field}`,
          });
        }
      }
    }

    for (const [index, checkpoint] of checkpoints.entries()) {
      const startExists = await assertCheckpointExists(
        checkpoint.start_checkpoint_id
      );
      const endExists = await assertCheckpointExists(
        checkpoint.end_checkpoint_id
      );

      if (!startExists) {
        return res.status(400).json({
          message: `checkpoints[${index}].start_checkpoint_id does not exist`,
        });
      }
      if (!endExists) {
        return res.status(400).json({
          message: `checkpoints[${index}].end_checkpoint_id does not exist`,
        });
      }
    }

    const newDbHash = computeShipmentHash(
      { manufacturerUUID, destinationPartyUUID, shipmentItems },
      checkpoints
    );

    const tx = await contract.updateShipment(shipment_id, newDbHash);
    const receipt = await tx.wait();

    const updatedShipment = await updateShipmentRecord(shipment_id, {
      manufacturerUUID,
      destinationPartyUUID,
      shipmentItems,
      shipment_hash: newDbHash,
      tx_hash: receipt.hash,
      updated_by: wallet.address,
    });

    await deleteByShipment(shipment_id);
    for (const checkpoint of checkpoints) {
      await addCheckpoint({
        shipment_id,
        ...checkpoint,
      });
    }

    const savedCheckpoints = await getByShipment(shipment_id);

    res.status(200).json({
      ...updatedShipment,
      handover_checkpoints: savedCheckpoints,
      blockchainTx: receipt.hash,
    });
  } catch (err) {
    console.error("❌ Error updating shipment:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}

export async function getAllShipments(_req, res) {
  try {
    const shipments = await getAllShipmentRecords();

    const result = await Promise.all(
      shipments.map(async (shipment) => {
        const checkpoints = await getByShipment(shipment.shipment_id);

        const normalizedShipment = {
          manufacturerUUID: shipment.manufacturer_uuid,
          destinationPartyUUID: shipment.destination_party_uuid,
          shipmentItems:
            typeof shipment.shipment_items === "string"
              ? JSON.parse(shipment.shipment_items)
              : shipment.shipment_items,
        };

        const dbHash = computeShipmentHash(normalizedShipment, checkpoints);

        let blockchainHash = null;
        let integrity = "unknown";
        try {
          const onchainShipment = await contract.getShipment(
            shipment.shipment_id
          );
          blockchainHash = onchainShipment.hash;
          integrity = dbHash === blockchainHash ? "valid" : "tampered";
        } catch (err) {
          integrity = "not_on_chain";
        }

        return {
          ...shipment,
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
}
