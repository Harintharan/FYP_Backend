const { ethers } = require("ethers");
const Batch = require("../models/batchModel");
require("dotenv").config();

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_OTHER, provider);
const contractABI = require("../../blockchain/artifacts/contracts/BatchRegistry.sol/BatchRegistry.json").abi;
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS_BATCH, contractABI, wallet);
// ---- Register Batch ----
const registerBatch = async (req, res) => {
    try {
        const {
            productCategory,
            manufacturerUUID,
            facility,
            productionWindow,
            quantityProduced,
            releaseStatus,
        } = req.body;

         // Convert quantityProduced to a string to match the smart contract
        const quantityProducedStr = quantityProduced.toString();

        // 1️⃣ Call blockchain (contract auto-assigns batchId)
        const tx = await contract.registerBatch(
            productCategory,
            manufacturerUUID,
            facility,
            productionWindow,
            quantityProducedStr,
            releaseStatus
        );
        const receipt = await tx.wait();

        // 2️⃣ Extract event (batchId + hash)
        const event = receipt.logs
            .map((log) => {
                try {
                    return contract.interface.parseLog(log);
                } catch {
                    return null;
                }
            })
            .find((parsed) => parsed && parsed.name === "BatchRegistered");

        

        if (!event) {
            throw new Error("No BatchRegistered event found");
        }

        const blockchainBatchId = event.args.batchId.toString();
        const blockchainHash = event.args.hash;

        // 3️⃣ Save in DB (link DB row with blockchainBatchId)
        const savedBatch = await Batch.createBatch({
            batch_id: blockchainBatchId, // ✅ store blockchain id
            product_category: productCategory,
            manufacturer_uuid: manufacturerUUID,
            facility,
            production_window: productionWindow,
            quantity_produced: quantityProduced,
            release_status: releaseStatus,
            batch_hash: blockchainHash,
            tx_hash: receipt.hash,
            created_by: wallet.address,
        });

        res.status(201).json({ ...savedBatch, blockchainTx: receipt.hash });
    } catch (err) {
        console.error("❌ Error registering batch:", err);
        res.status(500).json({ message: "Server error" });
    }
};


// ---- Update Batch ----
const updateBatch = async (req, res) => {
    try {
        const { id } = req.params;   // DB primary key
        const batch = await Batch.getBatchById(id); // fetch DB row
        if (!batch) return res.status(404).json({ message: "Batch not found" });

        const {
            productCategory,
            manufacturerUUID,
            facility,
            productionWindow,
            quantityProduced,
            releaseStatus,
        } = req.body;

        // 1️⃣ Call blockchain update with batch.batch_id (on-chain id)
        const tx = await contract.updateBatch(
            batch.batch_id,  // use blockchain id!
            productCategory,
            manufacturerUUID,
            facility,
            productionWindow,
            quantityProduced.toString(),
            releaseStatus
        );
        const receipt = await tx.wait();

        // 2️⃣ Parse event
        const event = receipt.logs
            .map((log) => {
                try { return contract.interface.parseLog(log); } catch { return null; }
            })
            .find((parsed) => parsed && parsed.name === "BatchUpdated");

        const blockchainHash = event?.args?.newHash;

        // 3️⃣ Update DB row
        const updatedBatch = await Batch.updateBatch(id, {
            product_category: productCategory,
            manufacturer_uuid: manufacturerUUID,
            facility,
            production_window: productionWindow,
            quantity_produced: quantityProduced,
            release_status: releaseStatus,
            batch_hash: blockchainHash,
            tx_hash: receipt.hash,
            updated_by: wallet.address,
        });

        res.json({ ...updatedBatch, blockchainTx: receipt.hash });
    } catch (err) {
        console.error("❌ Error updating batch:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ---- Get Batch ----
const getBatch = async (req, res) => {
    try {
        const { id } = req.params; // DB id
        const batch = await Batch.getBatchById(id);

        if (!batch) {
            return res.status(404).json({ message: "Batch not found" });
        }

        // 1️⃣ Recompute hash locally
        const recomputed = ethers.keccak256(
            ethers.solidityPacked(
                ["string", "string", "string", "string", "string", "string"],
                [
                    batch.product_category,
                    batch.manufacturer_uuid,
                    batch.facility,
                    batch.production_window,
                    batch.quantity_produced,
                    batch.release_status,
                ]
            )
        );

        // 2️⃣ DB integrity check
        if (recomputed.toLowerCase() !== batch.batch_hash.toLowerCase()) {
            return res.status(400).json({ message: "Tampered data in DB" });
        }

        // 3️⃣ Blockchain integrity check
        const [onchainHash] = await contract.getBatch(batch.batch_id);
        console.log("On-chain hash:", onchainHash);
        console.log("Recomputed hash:", recomputed);
        if (recomputed.toLowerCase() !== onchainHash.toLowerCase()) {
            return res.status(400).json({ message: "Tampered data on-chain" });
        }

        // 4️⃣ Send response (hide DB internal id)
        const { id: dbId, ...cleanBatch } = batch;
        res.json({ ...cleanBatch, verified: true });
    } catch (err) {
        console.error("❌ Error fetching batch:", err);
        res.status(500).json({ message: "Server error" });
    }
};


module.exports = { registerBatch, updateBatch, getBatch };
