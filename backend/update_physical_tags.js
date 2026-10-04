/**
 * ==============================================================================
 * Smart Cart System - Physical RFID Tag Configuration Utility
 * IoT Course Based Project (CBP)
 * ==============================================================================
 *
 * HOW TO USE THIS SCRIPT:
 * 1. Read your 7 physical RFID cards/fobs using the ESP32 Serial Monitor or NFC phone app.
 * 2. Paste the 7 scanned UIDs into the PHYSICAL_TAGS object below.
 * 3. Run: npm run update-tags (or: node update_physical_tags.js)
 * 4. All 6 supermarket products in MongoDB and the Manager RFID Keycard in .env
 *    will be updated instantly!
 * ==============================================================================
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Product } from "./models/product.model.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==============================================================================
// EDIT YOUR 7 PHYSICAL TAG UIDs HERE:
// (Case-insensitive; whitespace will be automatically cleaned)
// ==============================================================================
const PHYSICAL_TAGS = {
    milk:     "351C4407",       // Shelf A1 - Milk (P001)
    bread:    "A4C94D07",       // Shelf A2 - Bread (P002)
    butter:   "B3D84407",       // Shelf A3 - Butter (P003)
    rice:     "FE5D4507",       // Shelf B1 - Rice (P004)
    biscuits: "948D4B07",       // Shelf B2 - Biscuits (P005)
    oil:      "TAG_UID_6",       // Shelf B3 - Cooking Oil (P006)
    manager:  "5BA74B07"        // Staff 2FA Master Badge (MANAGER_RFID in .env)
};

// Target product mappings in MongoDB
const PRODUCT_MAPPINGS = [
    { key: "milk",     productId: "P001", defaultName: "Milk",        shelf: "A1" },
    { key: "bread",    productId: "P002", defaultName: "Bread",       shelf: "A2" },
    { key: "butter",   productId: "P003", defaultName: "Butter",      shelf: "A3" },
    { key: "rice",     productId: "P004", defaultName: "Rice",        shelf: "B1" },
    { key: "biscuits", productId: "P005", defaultName: "Biscuits",    shelf: "B2" },
    { key: "oil",      productId: "P006", defaultName: "Cooking Oil", shelf: "B3" }
];

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/iotcbp";
const ENV_PATH = path.join(__dirname, ".env");

async function updatePhysicalTags() {
    console.log("====================================================================");
    console.log("🚀 SMART CART: PHYSICAL RFID TAG MAPPING & CONFIGURATION UTILITY");
    console.log("====================================================================\n");

    // 1. Clean & Format Input Tag UIDs
    const cleanedTags = {};
    for (const [key, val] of Object.entries(PHYSICAL_TAGS)) {
        // Remove spaces, colons, dashes and convert to uppercase
        cleanedTags[key] = String(val).replace(/[\s:-]/g, "").toUpperCase().trim();
    }

    // 2. Validate Tag Uniqueness
    const tagValues = Object.values(cleanedTags);
    const uniqueValues = new Set(tagValues);
    if (uniqueValues.size !== tagValues.length) {
        console.error("❌ ERROR: Duplicate tag UIDs detected in PHYSICAL_TAGS!");
        console.error("   Each of the 7 cards/fobs must have a unique UID.");
        console.error("   Current values:", cleanedTags);
        process.exit(1);
    }

    // Check if user is still using default placeholders
    const hasPlaceholders = tagValues.some(t => t.startsWith("TAG_UID_"));
    if (hasPlaceholders) {
        console.log("⚠️  NOTICE: Placeholder tags (TAG_UID_X) detected.");
        console.log("   You can replace them with your real hex UIDs (e.g. 'A3B4C2D1') anytime.");
        console.log("   Proceeding to apply configured mappings...\n");
    }

    try {
        // 3. Connect to MongoDB
        console.log(`Connecting to MongoDB at: ${MONGO_URI}...`);
        await mongoose.connect(MONGO_URI);
        console.log(`Connected to database: '${mongoose.connection.name}'.\n`);

        console.log("Updating supermarket products in MongoDB:");
        console.log("--------------------------------------------------------------------");

        // 4. Update each product's RFID in MongoDB
        const updateResults = [];
        for (const mapping of PRODUCT_MAPPINGS) {
            const newRfid = cleanedTags[mapping.key];

            const updated = await Product.findOneAndUpdate(
                { productId: mapping.productId },
                { rfid: newRfid },
                { returnDocument: "after", runValidators: true }
            );

            if (updated) {
                console.log(`  ✅ [${updated.productId}] ${updated.name.padEnd(12)} | Shelf: ${updated.shelf} | New RFID: ${newRfid}`);
                updateResults.push(updated);
            } else {
                console.warn(`  ⚠️ Product '${mapping.productId}' not found in DB!`);
            }
        }

        // 5. Update MANAGER_RFID in backend/.env
        console.log("\n--------------------------------------------------------------------");
        console.log("Updating Manager 2FA Master Badge in .env:");
        const managerTag = cleanedTags.manager;

        if (fs.existsSync(ENV_PATH)) {
            let envContent = fs.readFileSync(ENV_PATH, "utf8");

            if (envContent.includes("MANAGER_RFID=")) {
                envContent = envContent.replace(/MANAGER_RFID=.*(\r?\n|$)/g, `MANAGER_RFID=${managerTag}$1`);
            } else {
                envContent += `\nMANAGER_RFID=${managerTag}\n`;
            }

            fs.writeFileSync(ENV_PATH, envContent, "utf8");
            console.log(`  ✅ backend/.env updated -> MANAGER_RFID=${managerTag}`);
        } else {
            // Create .env if missing
            const defaultEnv = `PORT=5000\nMONGO_URI=${MONGO_URI}\nMANAGER_RFID=${managerTag}\nMANAGER_PIN=1234\n`;
            fs.writeFileSync(ENV_PATH, defaultEnv, "utf8");
            console.log(`  ✅ backend/.env created with MANAGER_RFID=${managerTag}`);
        }

        console.log("====================================================================");
        console.log("🎉 CONFIGURATION APPLIED SUCCESSFULLY!");
        console.log("====================================================================");
        console.log("\nSUMMARY OF YOUR 7 ACTIVE HARDWARE TAGS:");
        for (const item of updateResults) {
            console.log(`  • Shelf ${item.shelf} [${item.name}]: RFID = ${item.rfid}`);
        }
        console.log(`  • Store Manager 2FA Card: RFID = ${managerTag}`);
        console.log("\nNEXT STEPS:");
        console.log("1. Swiping any of these cards on the ESP32 RC522 reader will now");
        console.log("   instantly look up the product and add it to the Customer Cart!");
        console.log("2. Swiping the Manager card on manager.html will authenticate Factor 1.");
        console.log("====================================================================\n");

    } catch (error) {
        console.error("\n❌ FAILED TO UPDATE TAGS:", error.message);
        if (error.code === 11000) {
            console.error("   MongoDB Duplicate Key Error: An RFID tag is already assigned to another item.");
        }
    } finally {
        await mongoose.disconnect();
        console.log("MongoDB connection closed.");
    }
}

updatePhysicalTags();
