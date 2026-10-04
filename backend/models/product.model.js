import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
    {
        productId: {
            type: String,
            required: [true, "Product ID is required"],
            unique: true,
            trim: true
        },
        name: {
            type: String,
            required: [true, "Product name is required"],
            trim: true
        },
        price: {
            type: Number,
            required: [true, "Price is required"],
            min: [0, "Price cannot be negative"]
        },
        rfid: {
            type: String,
            required: [true, "RFID tag is required"],
            unique: true,
            trim: true
        },
        shelf: {
            type: String,
            required: [true, "Shelf location is required"],
            trim: true
        },
        stock: {
            type: Number,
            required: [true, "Stock count is required"],
            default: 0,
            min: [0, "Stock cannot be negative"]
        },
        totalSold: {
            type: Number,
            default: 0,
            min: [0, "Total sold cannot be negative"]
        },
        discount: {
            type: Number,
            default: 0,
            min: [0, "Discount cannot be negative"],
            max: [100, "Discount cannot exceed 100%"]
        }
    },
    {
        timestamps: true
    }
);

export const Product = mongoose.model("Product", productSchema);
export default Product;