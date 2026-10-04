import { Product } from "../models/product.model.js";

// Helper to determine if an ID is a valid MongoDB ObjectId
function isObjectId(id) {
    return /^[0-9a-fA-F]{24}$/.test(id);
}

// 1. GET /product-api/products - Get all products
export async function getAllProducts(req, res) {
    try {
        const products = await Product.find().sort({ productId: 1 });
        res.status(200).json({
            success: true,
            count: products.length,
            products
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch products",
            error: error.message
        });
    }
}

// Active Server-Sent Events (SSE) subscribers
let sseClients = [];

// Broadcast an event to all connected SSE browser clients
export function broadcastScan(eventData) {
    if (sseClients.length === 0) return;
    const payload = `data: ${JSON.stringify(eventData)}\n\n`;
    sseClients.forEach((client) => {
        try {
            client.res.write(payload);
        } catch (err) {
            // will be cleaned up on close
        }
    });
}

// Real-time Server-Sent Events (SSE) live scan stream
export function liveScanStream(req, res) {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*"
    });

    const clientId = Date.now() + "-" + Math.random().toString(36).substr(2, 9);
    const newClient = { id: clientId, res };
    sseClients.push(newClient);

    // Initial handshake message
    res.write(`data: ${JSON.stringify({ type: "CONNECTED", message: "Live RFID Scan Stream Active", clients: sseClients.length })}\n\n`);

    // Keep-alive heartbeat every 20s
    const heartbeat = setInterval(() => {
        try {
            res.write(": keep-alive\n\n");
        } catch (e) {
            clearInterval(heartbeat);
        }
    }, 20000);

    req.on("close", () => {
        clearInterval(heartbeat);
        sseClients = sseClients.filter((c) => c.id !== clientId);
    });
}

// 2. GET /product-api/products/rfid/:rfid - Lookup single product by RFID tag
export async function getProductByRfid(req, res) {
    try {
        const { rfid } = req.params;
        if (!rfid) {
            return res.status(400).json({
                success: false,
                message: "RFID tag parameter is required"
            });
        }

        const cleanRfid = rfid.trim().toUpperCase();
        const managerRfid = (process.env.MANAGER_RFID || "RFID-ADMIN").trim().toUpperCase();

        // 1. Check if tag matches Manager 2FA Master Badge
        if (cleanRfid === managerRfid) {
            broadcastScan({
                type: "MANAGER_KEYCARD_SCANNED",
                rfid: cleanRfid,
                timestamp: new Date().toISOString()
            });

            return res.status(200).json({
                success: true,
                message: "Manager Keycard recognized",
                isManager: true,
                rfid: cleanRfid
            });
        }

        // 2. Query MongoDB for Product (case-insensitive regex for robustness)
        const product = await Product.findOne({
            rfid: { $regex: new RegExp(`^${cleanRfid}$`, "i") }
        });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: `Product with RFID '${rfid}' not found`
            });
        }

        // 3. Broadcast hardware scan event to all connected browser windows
        broadcastScan({
            type: "PRODUCT_SCANNED",
            product,
            timestamp: new Date().toISOString()
        });

        res.status(200).json({
            success: true,
            product
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching product by RFID",
            error: error.message
        });
    }
}

// 3. GET /product-api/products/:id - Get single product by productId or _id
export async function getProductById(req, res) {
    try {
        const { id } = req.params;
        let query;

        if (isObjectId(id)) {
            query = { $or: [{ _id: id }, { productId: id }] };
        } else {
            query = { productId: id };
        }

        const product = await Product.findOne(query);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: `Product '${id}' not found`
            });
        }

        res.status(200).json({
            success: true,
            product
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching product",
            error: error.message
        });
    }
}

// 4. POST /product-api/products - Create a new product
export async function createProduct(req, res) {
    try {
        const { productId, name, price, rfid, shelf, stock, totalSold, discount } = req.body;

        if (!productId || !name || price === undefined || !rfid || !shelf) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: productId, name, price, rfid, and shelf are required"
            });
        }

        const existing = await Product.findOne({
            $or: [{ productId: productId.trim() }, { rfid: rfid.trim() }]
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                message: existing.productId === productId.trim()
                    ? `Product with productId '${productId}' already exists`
                    : `Product with RFID '${rfid}' already exists`
            });
        }

        const product = new Product({
            productId: productId.trim(),
            name: name.trim(),
            price: Number(price),
            rfid: rfid.trim(),
            shelf: shelf.trim(),
            stock: stock !== undefined ? Number(stock) : 0,
            totalSold: totalSold !== undefined ? Number(totalSold) : 0,
            discount: discount !== undefined ? Number(discount) : 0
        });

        const savedProduct = await product.save();

        res.status(201).json({
            success: true,
            message: "Product added successfully",
            product: savedProduct
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: "Failed to create product",
            error: error.message
        });
    }
}

// 5. PUT /product-api/products/:id - Update product by productId or _id
export async function updateProduct(req, res) {
    try {
        const { id } = req.params;
        let query;

        if (isObjectId(id)) {
            query = { $or: [{ _id: id }, { productId: id }] };
        } else {
            query = { productId: id };
        }

        if (req.body.discount !== undefined) {
            const disc = Number(req.body.discount);
            if (isNaN(disc) || disc < 0 || disc > 100) {
                return res.status(400).json({
                    success: false,
                    message: "Discount must be between 0% and 100%"
                });
            }
            req.body.discount = disc;
        }

        const updatedProduct = await Product.findOneAndUpdate(
            query,
            { $set: req.body },
            { returnDocument: "after", runValidators: true }
        );

        if (!updatedProduct) {
            return res.status(404).json({
                success: false,
                message: `Product '${id}' not found`
            });
        }

        res.status(200).json({
            success: true,
            message: "Product updated successfully",
            product: updatedProduct
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: "Failed to update product",
            error: error.message
        });
    }
}

// 6. DELETE /product-api/products/:id - Delete product by productId or _id
export async function deleteProduct(req, res) {
    try {
        const { id } = req.params;
        let query;

        if (isObjectId(id)) {
            query = { $or: [{ _id: id }, { productId: id }] };
        } else {
            query = { productId: id };
        }

        const deletedProduct = await Product.findOneAndDelete(query);

        if (!deletedProduct) {
            return res.status(404).json({
                success: false,
                message: `Product '${id}' not found`
            });
        }

        res.status(200).json({
            success: true,
            message: "Product deleted successfully",
            product: deletedProduct
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to delete product",
            error: error.message
        });
    }
}

// 7. POST /product-api/products/checkout - Process checkout & atomically update stock/totalSold
export async function checkoutProducts(req, res) {
    try {
        const { items } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Cart items are required for checkout"
            });
        }

        // 1. Validate all items and requested quantities against current database stock
        const validatedItems = [];
        for (const item of items) {
            const { productId, quantity } = item;
            const parsedQty = parseInt(quantity, 10);

            if (!productId || isNaN(parsedQty) || parsedQty <= 0) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid product ID or quantity for item: ${JSON.stringify(item)}`
                });
            }

            const product = await Product.findOne({ productId: String(productId).trim() });
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: `Product '${productId}' not found in inventory`
                });
            }

            if (product.stock < parsedQty) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${product.name}. Only ${product.stock} available.`
                });
            }

            validatedItems.push({ product, quantity: parsedQty });
        }

        // 2. Perform atomic stock deductions and totalSold increments
        const updatedProducts = [];
        for (const { product, quantity } of validatedItems) {
            const updated = await Product.findOneAndUpdate(
                { productId: product.productId, stock: { $gte: quantity } },
                { $inc: { stock: -quantity, totalSold: quantity } },
                { returnDocument: "after", runValidators: true }
            );

            if (!updated) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${product.name}. Checkout aborted.`
                });
            }
            updatedProducts.push(updated);
        }

        const orderId = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const timestamp = new Date().toISOString();

        res.status(200).json({
            success: true,
            message: "Checkout completed successfully",
            orderId,
            timestamp,
            updatedProducts
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to process checkout",
            error: error.message
        });
    }
}

// 8. POST /product-api/products/manager/auth - 2FA Manager Authorization (RFID + PIN)
export async function managerAuth(req, res) {
    try {
        const { rfid, pin } = req.body;
        const validRfid = process.env.MANAGER_RFID || "RFID-ADMIN";
        const validPin = process.env.MANAGER_PIN || "1234";

        if (!rfid || !pin) {
            return res.status(400).json({
                success: false,
                message: "Both Manager RFID Keycard and Security PIN are required"
            });
        }

        if (rfid.trim() === validRfid && String(pin).trim() === validPin) {
            return res.status(200).json({
                success: true,
                message: "Manager authorized successfully",
                token: "manager-session-valid",
                manager: {
                    badgeId: validRfid,
                    role: "Store Manager",
                    authorizedAt: new Date().toISOString()
                }
            });
        }

        return res.status(401).json({
            success: false,
            message: "Invalid Manager RFID Keycard or Security PIN"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Authentication error",
            error: error.message
        });
    }
}

// 9. GET /product-api/products/manager/analytics - MongoDB Real-Time Analytics & KPI Calculations
export async function getManagerAnalytics(req, res) {
    try {
        const products = await Product.find().sort({ productId: 1 });

        const totalProducts = products.length;
        let totalItemsSold = 0;
        let totalRevenue = 0;
        let lowStockCount = 0;

        products.forEach((product) => {
            const sold = product.totalSold || 0;
            totalItemsSold += sold;

            // Calculate revenue using effective price (after product discount)
            const discount = product.discount || 0;
            const effectivePrice = product.price * (1 - discount / 100);
            totalRevenue += effectivePrice * sold;

            if (product.stock <= 5) {
                lowStockCount += 1;
            }
        });

        // Fast-Moving / Top Selling Products (sorted by totalSold descending)
        const topSelling = [...products]
            .filter((p) => (p.totalSold || 0) > 0)
            .sort((a, b) => (b.totalSold || 0) - (a.totalSold || 0))
            .slice(0, 5)
            .map((p) => {
                const effectivePrice = p.price * (1 - (p.discount || 0) / 100);
                return {
                    productId: p.productId,
                    name: p.name,
                    shelf: p.shelf,
                    price: p.price,
                    discount: p.discount,
                    stock: p.stock,
                    totalSold: p.totalSold || 0,
                    revenueGenerated: Number((effectivePrice * (p.totalSold || 0)).toFixed(2))
                };
            });

        // Restock Warnings (stock <= 5, sorted lowest stock first)
        const restockAlerts = [...products]
            .filter((p) => p.stock <= 5)
            .sort((a, b) => a.stock - b.stock)
            .map((p) => ({
                productId: p.productId,
                name: p.name,
                shelf: p.shelf,
                stock: p.stock,
                totalSold: p.totalSold || 0,
                price: p.price,
                urgency: p.stock === 0 ? "CRITICAL (OUT OF STOCK)" : "LOW STOCK WARNING"
            }));

        res.status(200).json({
            success: true,
            analytics: {
                totalProducts,
                totalItemsSold,
                totalRevenue: Number(totalRevenue.toFixed(2)),
                lowStockCount,
                topSelling,
                restockAlerts
            },
            products
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to generate analytics",
            error: error.message
        });
    }
}

// 10. PUT /product-api/products/:id/restock - Restock Inventory in MongoDB
export async function restockProduct(req, res) {
    try {
        const { id } = req.params;
        const { amount } = req.body;
        const restockQty = amount !== undefined ? parseInt(amount, 10) : 10;

        if (isNaN(restockQty) || restockQty <= 0) {
            return res.status(400).json({
                success: false,
                message: "Restock amount must be a positive integer"
            });
        }

        let query;
        if (isObjectId(id)) {
            query = { $or: [{ _id: id }, { productId: id }] };
        } else {
            query = { productId: id };
        }

        const updatedProduct = await Product.findOneAndUpdate(
            query,
            { $inc: { stock: restockQty } },
            { returnDocument: "after", runValidators: true }
        );

        if (!updatedProduct) {
            return res.status(404).json({
                success: false,
                message: `Product '${id}' not found`
            });
        }

        res.status(200).json({
            success: true,
            message: `Successfully restocked +${restockQty} units for ${updatedProduct.name}`,
            product: updatedProduct
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to restock product",
            error: error.message
        });
    }
}

// 11. PUT /product-api/products/:id/discount - Update promotional discount
export async function updateProductDiscount(req, res) {
    try {
        const { id } = req.params;
        const { discount } = req.body;
        const parsedDiscount = Number(discount);

        if (discount === undefined || isNaN(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100) {
            return res.status(400).json({
                success: false,
                message: "Discount must be between 0% and 100%"
            });
        }

        let query;
        if (isObjectId(id)) {
            query = { $or: [{ _id: id }, { productId: id }] };
        } else {
            query = { productId: id };
        }

        const updatedProduct = await Product.findOneAndUpdate(
            query,
            { $set: { discount: parsedDiscount } },
            { returnDocument: "after", runValidators: true }
        );

        if (!updatedProduct) {
            return res.status(404).json({
                success: false,
                message: `Product '${id}' not found`
            });
        }

        res.status(200).json({
            success: true,
            message: `Updated discount for ${updatedProduct.name} to ${parsedDiscount}%`,
            product: updatedProduct
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to update discount",
            error: error.message
        });
    }
}



