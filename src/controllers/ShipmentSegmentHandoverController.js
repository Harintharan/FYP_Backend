import dotenv from "dotenv";
import { ethers } from "ethers";
import ShipmentSegmentHandoverArtifact from "../../blockchain/artifacts/contracts/ShipmentSegmentHandover.sol/ShipmentSegmentHandover.json" with { type: "json" };
import {
  createHandover,
  updateHandover as updateHandoverRecord,
  getHandoverById,
  getAllHandovers as getAllHandoverRecords,
} from "../models/ShipmentSegmentHandoverModel.js";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.CHAIN_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_OTHER, provider);
const contractABI = ShipmentSegmentHandoverArtifact.abi;
const contract = new ethers.Contract(
  process.env.CONTRACT_ADDRESS_SHIPMENT_SEGMENT_HANDOVER,
  contractABI,
  wallet
);

function normalizeNumber(num, decimals = 6) {
  if (num === null || num === undefined || num === "") return "";
  return parseFloat(num).toFixed(decimals);
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
    normalizeNumber(data.gps_lat),
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
  for (const field of required) {
    if (!data[field]) {
      return `Missing required field: ${field}`;
    }
  }
  return null;
}

export async function registerHandover(req, res) {
  try {
    const data = { ...req.body };
    console.log("📥 Incoming register payload:", data);

    if (!data.handover_timestamp) {
      data.handover_timestamp = new Date().toISOString();
    }

    if (data.handover_gps) {
      data.gps_lat = data.handover_gps.lat ?? null;
      data.gps_lon = data.handover_gps.lon ?? null;
    }

    const errMsg = validateHandoverPayload(data);
    if (errMsg) {
      return res.status(400).json({ message: errMsg });
    }

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

    const saved = await createHandover({
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
}

export async function updateHandover(req, res) {
  try {
    const { handover_id } = req.params;
    const data = { ...req.body };
    console.log("📥 Incoming update payload:", data);

    const existing = await getHandoverById(handover_id);
    if (!existing) {
      return res.status(404).json({ message: "Handover not found" });
    }

    if (data.handover_gps) {
      data.gps_lat = data.handover_gps.lat ?? null;
      data.gps_lon = data.handover_gps.lon ?? null;
    }

    if (!data.handover_timestamp) {
      data.handover_timestamp = existing.handover_timestamp;
    }

    const errMsg = validateHandoverPayload(data);
    if (errMsg) {
      return res.status(400).json({ message: errMsg });
    }

    const newDbHash = computeHandoverHash(data);

    const tx = await contract.updateHandover(handover_id, newDbHash);
    const receipt = await tx.wait();
    console.log("📤 Blockchain update tx hash:", receipt.hash);

    const updated = await updateHandoverRecord(handover_id, {
      ...data,
      handover_hash: newDbHash,
      tx_hash: receipt.hash,
      updated_by: wallet.address,
      gps_lat: normalizeNumber(data.gps_lat),
      gps_lon: normalizeNumber(data.gps_lon),
    });

    res.json({ ...updated, blockchainTx: receipt.hash });
  } catch (err) {
    console.error("❌ Error updating handover:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}

export async function getAllHandovers(_req, res) {
  try {
    const handovers = await getAllHandoverRecords();
    const result = await Promise.all(
      handovers.map(async (handover) => {
        const dbHash = computeHandoverHash(handover);
        let blockchainHash = null;
        let integrity = "unknown";
        try {
          const onchainHandover = await contract.getHandover(
            handover.handover_id
          );
          blockchainHash = onchainHandover.hash;
          integrity = dbHash === blockchainHash ? "valid" : "tampered";
        } catch {
          integrity = "not_on_chain";
        }
        return { ...handover, dbHash, blockchainHash, integrity };
      })
    );
    res.json(result);
  } catch (err) {
    console.error("❌ Error fetching all handovers:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}

export async function getHandover(req, res) {
  try {
    const { handover_id } = req.params;

    const handover = await getHandoverById(handover_id);
    if (!handover) {
      return res.status(404).json({ message: "Handover not found" });
    }

    const dbHash = computeHandoverHash({
      ...handover,
      handover_timestamp: new Date(handover.handover_timestamp).toISOString(),
    });

    let blockchainHash = null;
    let integrity = "unknown";
    try {
      const onchainHandover = await contract.getHandover(handover_id);
      blockchainHash = onchainHandover.hash;
      integrity = dbHash === blockchainHash ? "valid" : "tampered";
    } catch {
      integrity = "not_on_chain";
    }

    res.json({ ...handover, dbHash, blockchainHash, integrity });
  } catch (err) {
    console.error("❌ Error fetching handover:", err.message);
    res.status(500).json({ message: "Server error" });
  }
}
