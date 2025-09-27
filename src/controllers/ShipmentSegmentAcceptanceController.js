import dotenv from "dotenv";
import { ethers } from "ethers";
import ShipmentSegmentAcceptanceArtifact from "../../blockchain/artifacts/contracts/ShipmentSegmentAcceptance.sol/ShipmentSegmentAcceptance.json" with { type: "json" };
import {
  createSegmentAcceptance,
  updateSegmentAcceptance as updateSegmentAcceptanceRecord,
  getSegmentAcceptanceById,
  getAllSegmentAcceptances as getAllSegmentAcceptanceRecords,
} from "../models/ShipmentSegmentAcceptanceModel.js";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.CHAIN_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_OTHER, provider);
const contractABI = ShipmentSegmentAcceptanceArtifact.abi;
const contract = new ethers.Contract(
  process.env.CONTRACT_ADDRESS_SHIPMENT_SEGMENT_ACCEPTANCE,
  contractABI,
  wallet
);

function stableStringify(obj) {
  if (Array.isArray(obj)) {
    return JSON.stringify(
      obj.map((item) => {
        const sorted = {};
        Object.keys(item)
          .sort()
          .forEach((key) => {
            sorted[key] = item[key];
          });
        return sorted;
      })
    );
  }
  if (typeof obj === "object" && obj !== null) {
    const sorted = {};
    Object.keys(obj)
      .sort()
      .forEach((key) => {
        sorted[key] = obj[key];
      });
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
    data.acceptance_timestamp || "",
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
    "assigned_party_uuid",
  ];
  for (const field of requiredTop) {
    if (!data[field]) {
      return `Missing required field: ${field}`;
    }
  }

  if (!Array.isArray(data.shipment_items) || data.shipment_items.length === 0) {
    return "shipment_items must be a non-empty array";
  }

  for (const [index, item] of data.shipment_items.entries()) {
    const requiredItemFields = [
      "product_uuid",
      "quantity",
      "container_id",
      "container_wifi_ssid",
      "container_wifi_password",
    ];
    for (const field of requiredItemFields) {
      if (!item[field]) {
        return `shipment_items[${index}] is missing required field: ${field}`;
      }
    }
  }

  return null;
}

export async function registerSegmentAcceptance(req, res) {
  try {
    const data = { ...req.body };

    data.acceptance_timestamp = new Date().toISOString();

    const errMsg = validateAcceptancePayload(data);
    if (errMsg) {
      return res.status(400).json({ message: errMsg });
    }

    if (data.estimated_pickup_time) {
      const date = new Date(data.estimated_pickup_time);
      if (Number.isNaN(date.getTime())) {
        return res
          .status(400)
          .json({ message: "Invalid estimated_pickup_time" });
      }
      data.estimated_pickup_time = date.toISOString();
    }
    if (data.estimated_delivery_time) {
      const date = new Date(data.estimated_delivery_time);
      if (Number.isNaN(date.getTime())) {
        return res
          .status(400)
          .json({ message: "Invalid estimated_delivery_time" });
      }
      data.estimated_delivery_time = date.toISOString();
    }

    const dbHash = computeAcceptanceHash(data);

    let shipmentId;
    try {
      shipmentId = BigInt(data.shipment_id);
    } catch (error) {
      return res
        .status(400)
        .json({ message: "shipment_id must be a valid integer" });
    }

    const tx = await contract.registerSegmentAcceptance(shipmentId, dbHash);
    const receipt = await tx.wait();

    const event = receipt.logs
      .map((log) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "SegmentAccepted");

    if (!event) {
      throw new Error("No SegmentAccepted event found");
    }

    const blockchainAcceptanceId = event.args.acceptanceId.toString();

    const saved = await createSegmentAcceptance({
      ...data,
      acceptance_id: blockchainAcceptanceId,
      shipment_items: data.shipment_items,
      acceptance_hash: dbHash,
      tx_hash: receipt.hash,
      created_by: wallet.address,
    });

    res.status(201).json({ ...saved, blockchainTx: receipt.hash });
  } catch (err) {
    console.error("❌ Error registering acceptance:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}

export async function updateSegmentAcceptance(req, res) {
  try {
    const { acceptance_id } = req.params;
    const data = { ...req.body };

    const errMsg = validateAcceptancePayload(data);
    if (errMsg) {
      return res.status(400).json({ message: errMsg });
    }

    if (data.estimated_pickup_time) {
      const date = new Date(data.estimated_pickup_time);
      if (Number.isNaN(date.getTime())) {
        return res
          .status(400)
          .json({ message: "Invalid estimated_pickup_time" });
      }
      data.estimated_pickup_time = date.toISOString();
    }
    if (data.estimated_delivery_time) {
      const date = new Date(data.estimated_delivery_time);
      if (Number.isNaN(date.getTime())) {
        return res
          .status(400)
          .json({ message: "Invalid estimated_delivery_time" });
      }
      data.estimated_delivery_time = date.toISOString();
    }

    const existing = await getSegmentAcceptanceById(acceptance_id);
    if (!existing) {
      return res
        .status(404)
        .json({ message: `Acceptance ${acceptance_id} not found` });
    }

    data.acceptance_timestamp = existing.acceptance_timestamp;

    console.log("📥 Incoming update payload:", data);

    const newDbHash = computeAcceptanceHash({
      ...data,
      acceptance_timestamp: existing.acceptance_timestamp,
    });

    const tx = await contract.updateSegmentAcceptance(acceptance_id, newDbHash);
    const receipt = await tx.wait();

    console.log("📤 Blockchain update tx hash:", receipt.hash);

    const updated = await updateSegmentAcceptanceRecord(acceptance_id, {
      ...data,
      acceptance_timestamp: existing.acceptance_timestamp,
      shipment_items: data.shipment_items,
      acceptance_hash: newDbHash,
      tx_hash: receipt.hash,
      updated_by: wallet.address,
    });

    res.json({ ...updated, blockchainTx: receipt.hash });
  } catch (err) {
    console.error("❌ Error updating acceptance:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}

export async function getSegmentAcceptance(req, res) {
  try {
    const { acceptance_id } = req.params;
    const acceptance = await getSegmentAcceptanceById(acceptance_id);
    if (!acceptance) {
      return res.status(404).json({ message: "Acceptance not found" });
    }

    if (typeof acceptance.shipment_items === "string") {
      try {
        acceptance.shipment_items = JSON.parse(acceptance.shipment_items);
      } catch {
        acceptance.shipment_items = [];
      }
    }

    console.log("🔹 Raw DB record:", acceptance);

    const dbHash = computeAcceptanceHash(acceptance);

    const onchainAcceptance = await contract.getSegmentAcceptance(acceptance_id);
    const blockchainHash = onchainAcceptance.hash;

    console.log("🟢 Recomputed DB Hash:", dbHash);
    console.log("🟣 Blockchain Hash:", blockchainHash);

    const integrity = dbHash === blockchainHash ? "valid" : "tampered";

    res.json({ ...acceptance, dbHash, blockchainHash, integrity });
  } catch (err) {
    console.error("❌ Error fetching acceptance:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}

export async function getAllSegmentAcceptances(_req, res) {
  try {
    const acceptances = await getAllSegmentAcceptanceRecords();

    const results = await Promise.all(
      acceptances.map(async (acc) => {
        let items = acc.shipment_items;
        if (typeof items === "string") {
          try {
            items = JSON.parse(items);
          } catch {
            items = [];
          }
        }
        const normalized = { ...acc, shipment_items: items };

        const dbHash = computeAcceptanceHash(normalized);

        let blockchainHash = null;
        let integrity = "unknown";
        try {
          const onchainAcceptance = await contract.getSegmentAcceptance(
            acc.acceptance_id
          );
          blockchainHash = onchainAcceptance.hash;
          integrity = dbHash === blockchainHash ? "valid" : "tampered";
        } catch (err) {
          console.warn(`⚠️ Acceptance ${acc.acceptance_id} not found on chain`);
          integrity = "not_on_chain";
        }

        return { ...normalized, dbHash, blockchainHash, integrity };
      })
    );

    res.json(results);
  } catch (err) {
    console.error("❌ Error fetching all acceptances:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}
