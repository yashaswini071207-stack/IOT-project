import express from "express";
import {
    getAllProducts,
    getProductByRfid,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    checkoutProducts,
    managerAuth,
    getManagerAnalytics,
    restockProduct,
    updateProductDiscount,
    liveScanStream
} from "../controllers/product.controller.js";

export const productRouter = express.Router();

// Real-time Server-Sent Events (SSE) stream for ESP32 hardware scans
productRouter.get("/live-scans", liveScanStream);

// 1. GET /product-api/products - List all products
productRouter.get("/", getAllProducts);

// 2. POST /product-api/products - Add a new product
productRouter.post("/", createProduct);

// 3. POST /product-api/products/checkout - Process cart checkout and update inventory
productRouter.post("/checkout", checkoutProducts);

// 4. POST /product-api/products/manager/auth - 2FA Manager Authentication
productRouter.post("/manager/auth", managerAuth);

// 5. GET /product-api/products/manager/analytics - Real-time MongoDB Store Analytics (BEFORE /:id)
productRouter.get("/manager/analytics", getManagerAnalytics);

// 6. PUT /product-api/products/:id/restock - Restock Inventory
productRouter.put("/:id/restock", restockProduct);

// 7. PUT /product-api/products/:id/discount - Update promotional discount
productRouter.put("/:id/discount", updateProductDiscount);

// 7. GET /product-api/products/rfid/:rfid - RFID lookup (placed before /:id)
productRouter.get("/rfid/:rfid", getProductByRfid);

// 4. GET /product-api/products/:id - Single product lookup (by productId or _id)
productRouter.get("/:id", getProductById);

// 5. PUT /product-api/products/:id - Update product
productRouter.put("/:id", updateProduct);

// 6. DELETE /product-api/products/:id - Delete product
productRouter.delete("/:id", deleteProduct);

export default productRouter;