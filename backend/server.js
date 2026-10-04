import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { productRouter } from "./routes/product.routes.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/iotcbp";

app.use(express.json());
app.use(cors());

// Serve static frontend directory
app.use(express.static(path.join(__dirname, "../frontend")));

app.use("/product-api/products", productRouter);

async function connectDB() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log(`MongoDB connected successfully to ${mongoose.connection.name}`);
    } catch (error) {
        console.log("MongoDB connection failed:", error.message);
    }
}

connectDB();

app.get("/", (req, res) => {
    res.json({ status: "ok", message: "Smart Cart Backend is Running!" });
});

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Server running", timestamp: new Date().toISOString() });
});

// 404 Not Found Handler for unmatched routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`
    });
});

// Global 500 Error Handler
app.use((err, req, res, next) => {
    console.error("Unhandled Server Error:", err.message);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal Server Error"
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
