// const { ethers } = require("ethers");
// const Product = require("../models/ProductRegistryModel");
// require("dotenv").config();

// const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
// const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_OTHER, provider);
// const contractABI = require("../blockchain/artifacts/contracts/ProductRegistry.sol/ProductRegistry.json").abi;
// const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS_PRODUCT, contractABI, wallet);

// // Create product
// const registerProduct = async (req, res) => {
//   try {
//     const data = req.body;
//     const expiryTimestamp = Math.floor(new Date(data.expiryDate).getTime() / 1000);

//     const tx = await contract.registerProduct({
//       productUUID: data.productUUID,
//       productName: data.productName,
//       productCategory: data.productCategory,
//       batchLotId: data.batchLotId,
//       requiredStorageTemp: data.requiredStorageTemp,
//       transportRoutePlanId: data.transportRoutePlanId,
//       handlingInstructions: data.handlingInstructions,
//       expiryDate: expiryTimestamp,
//       sensorDeviceUUID: data.sensorDeviceUUID,
//       microprocessorMac: data.microprocessorMac,
//       sensorTypes: data.sensorTypes,
//       qrId: data.qrId,
//       wifiSSID: data.wifiSSID,
//       wifiPassword: data.wifiPassword,
//       manufacturerUUID: data.manufacturerUUID,
//       originFacilityAddr: data.originFacilityAddr,
//       status: data.status
//     });

//     const receipt = await tx.wait();

//     const event = receipt.logs.map(log => {
//       try { return contract.interface.parseLog(log); } catch { return null; }
//     }).find(parsed => parsed && parsed.name === "ProductRegistered");

//     if (!event) throw new Error("No ProductRegistered event found");

//     const blockchainProductId = event.args.productId.toString();
//     const blockchainHash = event.args.hash;

//     const savedProduct = await Product.createProduct({
//       product_id: blockchainProductId,
//       ...data,
//       expiryDate: data.expiryDate,
//       product_hash: blockchainHash,
//       tx_hash: receipt.hash,
//       created_by: wallet.address,
//     });

//     res.status(201).json({ ...savedProduct, blockchainTx: receipt.hash });
//   } catch (err) {
//     console.error("❌ Error registering product:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// // Update product
// const updateProduct = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const data = req.body;
//     const expiryTimestamp = Math.floor(new Date(data.expiryDate).getTime() / 1000);

//     const tx = await contract.updateProduct(id, {
//       ...data,
//       expiryDate: expiryTimestamp
//     });
//     const receipt = await tx.wait();

//     const event = receipt.logs.map(log => {
//       try { return contract.interface.parseLog(log); } catch { return null; }
//     }).find(parsed => parsed && parsed.name === "ProductUpdated");

//     if (!event) throw new Error("No ProductUpdated event found");

//     const newHash = event.args.newHash;

//     const updatedProduct = await Product.updateProduct(id, {
//       ...data,
//       product_hash: newHash,
//       tx_hash: receipt.hash,
//       updated_by: wallet.address,
//     });

//     res.json({ ...updatedProduct, blockchainTx: receipt.hash });
//   } catch (err) {
//     console.error("❌ Error updating product:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// // Get one
// const getProduct = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const product = await Product.getProductById(id);
//     if (!product) return res.status(404).json({ message: "Not found" });
//     res.json(product);
//   } catch (err) {
//     res.status(500).json({ message: "Server error" });
//   }
// };

// // Get all
// const getAllProducts = async (req, res) => {
//   try {
//     const products = await Product.getAllProducts();
//     res.json(products);
//   } catch (err) {
//     res.status(500).json({ message: "Server error" });
//   }
// };

// module.exports = { registerProduct, updateProduct, getProduct, getAllProducts };
const { ethers } = require("ethers");
const Product = require("../models/ProductRegistryModel");
const { decrypt, encrypt } = require("../utils/encryptionHelper");
require("dotenv").config();


const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_OTHER, provider);
const contractABI = require("../blockchain/artifacts/contracts/ProductRegistry.sol/ProductRegistry.json").abi;
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS_PRODUCT, contractABI, wallet);

//
// 🔹 Helpers
//
function normalizeDate(dateVal) {
  if (!dateVal) return "";
  return String(dateVal);  // ✅ don't convert with new Date(), just keep as-is
}

function normalizeProductInput(p) {
  const safe = (v) => (v === null || v === undefined ? "" : v);

  return {
    product_uuid: safe(p.product_uuid || p.productUUID),
    product_name: safe(p.product_name || p.productName),
    product_category: safe(p.product_category || p.productCategory),
    batch_lot_id: safe(p.batch_lot_id || p.batchLotId),
    required_storage_temp: safe(p.required_storage_temp || p.requiredStorageTemp),
    transport_route_plan_id: safe(p.transport_route_plan_id || p.transportRoutePlanId),
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
    // If it's valid hex, attempt decrypt
    if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
      return decrypt(value);
    }
    // Otherwise assume it’s already plain text
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
    safeDecryptMaybe(norm.wifi_password), // ✅ decrypt before hashing
    norm.manufacturer_uuid,
    norm.origin_facility_addr,
    String(norm.status), // force to string
  ].join("|");

  console.log("🟦 Hashing string:", joined);

  return ethers.keccak256(ethers.toUtf8Bytes(joined));
}

//
// 🔹 Register Product
//
const registerProduct = async (req, res) => {
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

    if (!event) throw new Error("No ProductRegistered event found");

    const blockchainProductId = event.args.productId.toString();
    const blockchainHash = event.args.hash;

     console.log("🔐 Saving encrypted wifi_password:", encrypt(data.wifi_password || data.wifiPassword));

    const savedProduct = await Product.createProduct({
      ...data,
      product_id: blockchainProductId,
      
      product_hash: blockchainHash,
      tx_hash: receipt.hash,
      created_by: wallet.address,

      wifi_password: encrypt(data.wifi_password || data.wifiPassword),  // ✅ handle both
    });


    res.status(201).json({ ...savedProduct, blockchainTx: receipt.hash });
  } catch (err) {
    console.error("❌ Error registering product:", err);
    res.status(500).json({ message: "Server error" });
  }
};

//
// 🔹 Update Product
//
const updateProduct = async (req, res) => {
  try {
    const { product_id } = req.params;
    const data = req.body;

    const newDbHash = computeProductHash(data);

    const tx = await contract.updateProduct(product_id, newDbHash);
    const receipt = await tx.wait();

    console.log("🔐 Saving encrypted wifi_password:", encrypt(data.wifi_password || data.wifiPassword));


    const updatedProduct = await Product.updateProduct(product_id, {
      ...data,
      
      product_hash: newDbHash,
      tx_hash: receipt.hash,
      updated_by: wallet.address,
      wifi_password: encrypt(data.wifi_password || data.wifiPassword),  // ✅ same fix
    });


    res.status(200).json({ ...updatedProduct, blockchainTx: receipt.hash });
  } catch (err) {
    console.error("❌ Error updating product:", err);
    res.status(500).json({ message: "Server error" });
  }
};

//
// 🔹 Get Single Product
//
const getProduct = async (req, res) => {
  try {
    const { product_id } = req.params;
    const product = await Product.getProductById(product_id);
    if (!product) return res.status(404).json({ message: "Product not found" });

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
};

//
// 🔹 Get All Products
//
const getAllProducts = async (req, res) => {
  try {
    const products = await Product.getAllProducts();

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
};

module.exports = { registerProduct, updateProduct, getProduct, getAllProducts };


