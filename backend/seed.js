import mongoose from "mongoose";
import dotenv from "dotenv";
import { Product } from "./models/product.model.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/iotcbp";

const sampleProducts = [
    {
        productId: "P001",
        name: "Milk",
        price: 50,
        rfid: "RFID001",
        shelf: "A1",
        stock: 25,
        totalSold: 0
    },
    {
        productId: "P002",
        name: "Bread",
        price: 40,
        rfid: "RFID002",
        shelf: "A2",
        stock: 30,
        totalSold: 0
    },
    {
        productId: "P003",
        name: "Butter",
        price: 60,
        rfid: "RFID003",
        shelf: "A3",
        stock: 15,
        totalSold: 0
    },
    {
        productId: "P004",
        name: "Rice",
        price: 120,
        rfid: "RFID004",
        shelf: "B1",
        stock: 20,
        totalSold: 0
    },
    {
        productId: "P005",
        name: "Biscuits",
        price: 30,
        rfid: "RFID005",
        shelf: "B2",
        stock: 40,
        totalSold: 0,
        discount: 10
    },
    {
        productId: "P006",
        name: "Cooking Oil",
        price: 180,
        rfid: "RFID006",
        shelf: "B3",
        stock: 12,
        totalSold: 0,
        discount: 5
    },
    {
        productId: "P007",
        name: "Cereal",
        price: 150,
        rfid: "RFID007",
        shelf: "C1",
        stock: 10,
        totalSold: 0,
        discount: 20
    },
    {
        productId: "P008",
        name: "Soap",
        price: 45,
        rfid: "RFID008",
        shelf: "C2",
        stock: 50,
        totalSold: 0,
        discount: 0
    }
];

async function seedDatabase() {
    try {
        console.log(`Connecting to MongoDB at ${MONGO_URI}...`);
        await mongoose.connect(MONGO_URI);
        console.log(`Connected to database '${mongoose.connection.name}'.`);

        console.log("Clearing existing products...");
        await Product.deleteMany({});

        console.log(`Inserting ${sampleProducts.length} sample products...`);
        const inserted = await Product.insertMany(sampleProducts);
        console.log(`Successfully seeded ${inserted.length} products into '${mongoose.connection.name}':`);
        inserted.forEach((p) => {
            console.log(` - [${p.productId}] ${p.name} (RFID: ${p.rfid}) - ₹${p.price} | Shelf: ${p.shelf} | Stock: ${p.stock}`);
        });

        await mongoose.connection.close();
        console.log("Database connection closed. Seed completed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Seeding failed:", error.message);
        process.exit(1);
    }
}

seedDatabase();
