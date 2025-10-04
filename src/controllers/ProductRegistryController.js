import { ethers } from "ethers";
import ProductRegistryArtifact from "../../blockchain/artifacts/contracts/ProductRegistry.sol/ProductRegistry.json" with { type: "json" };
import {
  createProduct,
  updateProduct as updateProductRecord,
  getProductById,
  getAllProducts as getAllProductRecords,
} from "../models/ProductRegistryModel.js";
import { encrypt, decrypt } from "../utils/encryptionHelper.js";
import { chain, operatorWallet, contracts } from "../config.js";
import { backupRecord } from "../services/pinataBackupService.js";

const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
const wallet = new ethers.Wallet(operatorWallet.privateKey, provider);
const contractABI = ProductRegistryArtifact.abi;
const contract = new ethers.Contract(
  contracts.productRegistry,
  contractABI,
  wallet
);

function normalizeDate(dateVal) {
  if (!dateVal) return "";
  return String(dateVal);
}

function normalizeProductInput(p) {
  const safe = (value) => (value === null || value === undefined ? "" : value);

  return {
    product_uuid: safe(p.product_uuid || p.productUUID),
    product_name: safe(p.product_name || p.productName),
    product_category: safe(p.product_category || p.productCategory),
    batch_lot_id: safe(p.batch_lot_id || p.batchLotId),
    required_storage_temp: safe(p.required_storage_temp || p.requiredStorageTemp),
    transport_route_plan_id: safe(
      p.transport_route_plan_id || p.transportRoutePlanId
    ),
    handling_instructions: safe(p.handling_instructions || p.handlingInstructions),
    expiry_date: safe(p.expiry_date || p.expiryDate),
    sensor_device_uuid: safe(p.sensor_device_uuid || p.sensorDeviceUUID),
    microprocessor_mac: safe(p.microprocessor_mac || p.microprocessorMac),
    sensor_types: safe(p.sensor_types || p.sensorTypes),
    qr_id: safe(p.qr_id || p.qrId),
    wifi_ssid: safe(p.wifi_ssid || p.wifiSSID),
    wifi_password: safe(p.wifi_password || p.wifiPassword),
    manufacturer_uuid: safe(p.manufacturer_uuid || p.manufacturerUUID),
    origin_facility_addr: safe(p.origin_facility_addr || p.originFacilityAddr),
    status: safe(p.status),
  };
}

function safeDecryptMaybe(value) {
  if (!value) return "";
  try {
    if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
      return decrypt(value);
    }
    return value;
  } catch (err) {
    console.warn("⚠️ safeDecryptMaybe failed, using raw value:", value);
    return value;
  }
}

function computeProductHash(product) {
  const norm = normalizeProductInput(product);

  const joined = [
    norm.product_uuid,
    norm.product_name,
    norm.product_category,
    norm.batch_lot_id,
    norm.required_storage_temp,
    norm.transport_route_plan_id,
    norm.handling_instructions,
    normalizeDate(norm.expiry_date),
    norm.sensor_device_uuid,
    norm.microprocessor_mac,
    norm.sensor_types,
    norm.qr_id,
    norm.wifi_ssid,
    safeDecryptMaybe(norm.wifi_password),
    norm.manufacturer_uuid,
    norm.origin_facility_addr,
    String(norm.status),
  ].join("|");

  console.log("🟦 Hashing string:", joined);

  return ethers.keccak256(ethers.toUtf8Bytes(joined));
}

export async function registerProduct(req, res) {
  try {
    const data = req.body;
    const dbHash = computeProductHash(data);

    const tx = await contract.registerProduct(dbHash);
    const receipt = await tx.wait();

    const event = receipt.logs
      .map((log) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "ProductRegistered");

    if (!event) {
      throw new Error("No ProductRegistered event found");
    }

    const blockchainProductId = event.args.productId.toString();
    const blockchainHash = event.args.hash;

    console.log(
      "🔐 Saving encrypted wifi_password:",
      encrypt(data.wifi_password || data.wifiPassword)
    );

    const encryptedWifi = encrypt(data.wifi_password || data.wifiPassword);

    const createPayload = {
      ...data,
      product_id: blockchainProductId,
      product_hash: blockchainHash,
      tx_hash: receipt.hash,
      created_by: wallet.address,
      wifi_password: encryptedWifi,
    };

    let pinataBackup;
    try {
      pinataBackup = await backupRecord("product", createPayload, {
        operation: "create",
        identifier: blockchainProductId,
      });
    } catch (backupErr) {
      console.error(
        "⚠️ Failed to back up product to Pinata:",
        backupErr
      );
    }

    const savedProduct = await createProduct({
      ...createPayload,
      pinata_cid: pinataBackup?.IpfsHash ?? null,
      pinata_pinned_at: pinataBackup?.Timestamp ?? null,
    });

    const responsePayload = { ...savedProduct, blockchainTx: receipt.hash };
    responsePayload.pinataCid = savedProduct.pinata_cid || null;
    responsePayload.pinataTimestamp = savedProduct.pinata_pinned_at || null;

    res.status(201).json(responsePayload);
  } catch (err) {
    console.error("❌ Error registering product:", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function updateProduct(req, res) {
  try {
    const { product_id } = req.params;
    const data = req.body;

    const existing = await getProductById(product_id);
    if (!existing) {
      return res.status(404).json({ message: "Product not found" });
    }

    const newDbHash = computeProductHash(data);

    const tx = await contract.updateProduct(product_id, newDbHash);
    const receipt = await tx.wait();

    console.log(
      "🔐 Saving encrypted wifi_password:",
      encrypt(data.wifi_password || data.wifiPassword)
    );

    const encryptedWifi = encrypt(data.wifi_password || data.wifiPassword);

    const updatePayload = {
      ...data,
      product_hash: newDbHash,
      tx_hash: receipt.hash,
      updated_by: wallet.address,
      wifi_password: encryptedWifi,
    };

    let pinataBackup;
    try {
      pinataBackup = await backupRecord(
        "product",
        {
          ...existing,
          ...updatePayload,
          product_id,
        },
        {
          operation: "update",
          identifier: product_id,
        }
      );
    } catch (backupErr) {
      console.error(
        "⚠️ Failed to back up product update to Pinata:",
        backupErr
      );
    }

    updatePayload.pinata_cid = pinataBackup?.IpfsHash ?? existing.pinata_cid ?? null;
    updatePayload.pinata_pinned_at =
      pinataBackup?.Timestamp ?? existing.pinata_pinned_at ?? null;

    const updatedProduct = await updateProductRecord(product_id, updatePayload);

    const responsePayload = { ...updatedProduct, blockchainTx: receipt.hash };
    responsePayload.pinataCid = updatedProduct.pinata_cid || null;
    responsePayload.pinataTimestamp = updatedProduct.pinata_pinned_at || null;

    res.status(200).json(responsePayload);
  } catch (err) {
    console.error("❌ Error updating product:", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function getProduct(req, res) {
  try {
    const { product_id } = req.params;
    const product = await getProductById(product_id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const dbHash = computeProductHash(product);
    const blockchainProduct = await contract.getProduct(product_id);
    const blockchainHash = blockchainProduct.hash;

    console.log("🔍 DB Hash:", dbHash);
    console.log("🔍 On-chain Hash:", blockchainHash);

    const integrity = dbHash === blockchainHash ? "valid" : "tampered";

    res.status(200).json({ ...product, dbHash, blockchainHash, integrity });
  } catch (err) {
    console.error("❌ Error fetching product:", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function getAllProducts(_req, res) {
  try {
    const products = await getAllProductRecords();

    const result = await Promise.all(
      products.map(async (prod) => {
        const dbHash = computeProductHash(prod);
        let blockchainHash = null;
        let integrity = "unknown";

        try {
          const blockchainProduct = await contract.getProduct(prod.product_id);
          blockchainHash = blockchainProduct.hash;
          integrity = dbHash === blockchainHash ? "valid" : "tampered";
        } catch {
          integrity = "not_on_chain";
        }

        return { ...prod, dbHash, blockchainHash, integrity };
      })
    );

    res.status(200).json(result);
  } catch (err) {
    console.error("❌ Error fetching products:", err);
    res.status(500).json({ message: "Server error" });
  }
}
