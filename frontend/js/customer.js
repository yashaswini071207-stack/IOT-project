// Smart Cart - Customer Interface, Strict IoT Scanning & Automatic Billing
const API_BASE = "http://localhost:5000/product-api/products";

// Application State
let cart = [];
let availableProducts = [];
let feedbackTimer = null;

// DOM Element References - Scanner (Strict IoT Single Entry)
const scannerForm = document.querySelector("#scanner-form");
const rfidInput = document.querySelector("#rfidInput") || document.querySelector("#rfid-input");
const scanButton = document.querySelector("#scanBtn") || document.querySelector("#scan-button");
const scanFeedback = document.querySelector("#scanFeedback") || document.querySelector("#scan-feedback");

// DOM References - Indoor Map & Route
const mapSearchInput = document.querySelector("#map-search-input");
const clearMapSearchBtn = document.querySelector("#clear-map-search-btn");
const mapRouteCallout = document.querySelector("#map-route-callout");
const calloutProductName = document.querySelector("#callout-product-name");
const calloutMeta = document.querySelector("#callout-meta");
const calloutStatusBadge = document.querySelector("#callout-status-badge") || document.querySelector("#callout-tag-badge");
const calloutStepShelf = document.querySelector("#callout-step-shelf");

// DOM References - Cart
const emptyCartView = document.querySelector("#empty-cart-view");
const cartTableWrapper = document.querySelector("#cart-table-wrapper");
const cartTableBody = document.querySelector("#cart-table-body");
const headerBadgeCount = document.querySelector("#badge-count");
const clearCartBtn = document.querySelector("#clear-cart-btn");

// DOM References - Bill Summary
const billUniqueItems = document.querySelector("#bill-unique-items");
const billTotalUnits = document.querySelector("#bill-total-units");
const billSubtotal = document.querySelector("#bill-subtotal");
const billDiscountTotal = document.querySelector("#bill-discount-total");
const billTax = document.querySelector("#bill-tax");
const billGrandTotal = document.querySelector("#bill-grand-total");
const billSavingsNote = document.querySelector("#bill-savings-note");
const checkoutBtn = document.querySelector("#checkout-btn");
const checkoutFeedback = document.querySelector("#checkout-feedback");

// DOM References - Interactive Dynamic UPI Payment Modal
const paymentModal = document.querySelector("#payment-modal");
const paymentModalAmount = document.querySelector("#payment-modal-amount");
const paymentModalSavings = document.querySelector("#payment-modal-savings");
const upiQrImage = document.querySelector("#upi-qr-image");
const confirmPaymentBtn = document.querySelector("#confirm-payment-btn");
const cancelPaymentBtn = document.querySelector("#cancel-payment-btn");

// DOM References - Digital Receipt Modal (Step 6)
const receiptModal = document.querySelector("#receipt-modal");
const receiptOrderId = document.querySelector("#receipt-order-id");
const receiptTimestamp = document.querySelector("#receipt-timestamp");
const receiptItemsBody = document.querySelector("#receipt-items-body");
const receiptSubtotal = document.querySelector("#receipt-subtotal");
const receiptSavings = document.querySelector("#receipt-savings");
const receiptGrandTotal = document.querySelector("#receipt-grand-total");
const printReceiptBtn = document.querySelector("#print-receipt-btn");
const closeReceiptBtn = document.querySelector("#close-receipt-btn");

// Format Currency in INR
function formatCurrency(amount) {
	return `\u20B9${Number(amount || 0).toFixed(2)}`;
}

// Show accessible feedback banner
function showFeedback(message, type = "info") {
	if (feedbackTimer) {
		clearTimeout(feedbackTimer);
	}

	if (scanFeedback) {
		scanFeedback.textContent = message;
		scanFeedback.className = `feedback-banner feedback-${type}`;
		scanFeedback.hidden = false;

		feedbackTimer = setTimeout(() => {
			scanFeedback.hidden = true;
		}, 4000);
	}
}

// Load products from backend for Indoor Map navigation & store catalog
async function loadAvailableProducts() {
	try {
		const response = await fetch(API_BASE);
		if (!response.ok) {
			throw new Error(`Failed to load products (status ${response.status})`);
		}

		const data = await response.json();
		if (data.success && Array.isArray(data.products)) {
			availableProducts = data.products;
			updateMapShelfStockBadges();
			initMapInteractions();
		}
	} catch (error) {
		console.warn("Could not load products for map navigation:", error.message);
	}
}

// Dynamically reflect MongoDB inventory stock onto store map shelves
function updateMapShelfStockBadges() {
	availableProducts.forEach((product) => {
		const shelfNode = document.querySelector(`#shelf-${product.shelf.toUpperCase()}`);
		if (shelfNode) {
			let stockPill = shelfNode.querySelector(".shelf-stock-pill");
			if (!stockPill) {
				stockPill = document.createElement("span");
				const shelfInfo = shelfNode.querySelector(".shelf-info");
				if (shelfInfo) shelfInfo.appendChild(stockPill);
			}

			if (product.stock <= 0) {
				shelfNode.classList.add("shelf-out-of-stock");
				stockPill.className = "shelf-stock-pill stock-out";
				stockPill.textContent = "Sold Out";
				shelfNode.setAttribute("title", `Shelf ${product.shelf}: ${product.name} (Out of Stock)`);
			} else {
				shelfNode.classList.remove("shelf-out-of-stock");
				stockPill.className = "shelf-stock-pill stock-in";
				stockPill.textContent = `${product.stock} in stock`;
				shelfNode.setAttribute("title", `Shelf ${product.shelf}: ${product.name} (${product.stock} in stock)`);
			}
		}
	});
}

// =========================================================
// STRICT IoT SCANNING: ONLY WAY ITEMS ENTER THE CART
// =========================================================
async function handleScan(rfidTag) {
	const tag = (rfidTag || "").trim();
	if (!tag) {
		showFeedback("Please scan or enter an item tag.", "error");
		if (rfidInput) rfidInput.focus();
		return;
	}

	if (scanButton) scanButton.disabled = true;
	showFeedback("Reading item tag at cart scanner...", "info");

	try {
		const url = `${API_BASE}/rfid/${encodeURIComponent(tag)}`;
		const response = await fetch(url);

		if (!response.ok) {
			if (response.status === 404) {
				showFeedback(`❌ Item tag "${tag}" not recognized by supermarket inventory.`, "error");
			} else {
				showFeedback(`⚠️ Cart scanner read failed with status ${response.status}`, "error");
			}
			if (rfidInput) {
				rfidInput.select();
				rfidInput.focus();
			}
			return;
		}

		const data = await response.json();
		if (!data.success || !data.product) {
			showFeedback("❌ Product not found for scanned tag.", "error");
			if (rfidInput) {
				rfidInput.select();
				rfidInput.focus();
			}
			return;
		}

		const product = data.product;

		// Step 6: Out-of-Stock Validation
		if (product.stock <= 0) {
			showFeedback(`❌ Out of Stock! "${product.name}" is sold out.`, "error");
			if (rfidInput) {
				rfidInput.select();
				rfidInput.focus();
			}
			return;
		}

		// Step 6: Max available stock check
		const existingItem = cart.find((item) => item.product.productId === product.productId);
		if (existingItem && existingItem.quantity >= product.stock) {
			showFeedback(`⚠️ Max available stock (${product.stock} units) already added to cart.`, "error");
			if (rfidInput) {
				rfidInput.select();
				rfidInput.focus();
			}
			return;
		}

		addToCart(product);

		// Automatically highlight the scanned item's shelf on the indoor map
		highlightShelfOnMap(product.shelf, product, 5);

		// Clear and focus input for next scan
		if (rfidInput) {
			rfidInput.value = "";
			rfidInput.focus();
		}
	} catch (error) {
		showFeedback(`⚠️ Cart scanner connection error: ${error.message}. Is backend running?`, "error");
		if (rfidInput) rfidInput.focus();
	} finally {
		if (scanButton) scanButton.disabled = false;
	}
}

// Add or increment item in client cart
function addToCart(product) {
	const existingIndex = cart.findIndex((item) => item.product.productId === product.productId);

	let currentQty = 1;
	if (existingIndex > -1) {
		const item = cart[existingIndex];
		if (item.quantity >= product.stock) {
			showFeedback(`⚠️ Max available stock (${product.stock} units) already added to cart.`, "error");
			return;
		}
		item.quantity += 1;
		item.product = product;
		currentQty = item.quantity;
		const discountInfo = product.discount > 0 ? ` (${product.discount}% OFF applied)` : "";
		showFeedback(`\u2705 Incremented "${product.name}" (Qty: ${currentQty}/${product.stock})${discountInfo} \u2022 Shelf ${product.shelf}`, "success");
	} else {
		if (product.stock <= 0) {
			showFeedback(`❌ Out of Stock! "${product.name}" is sold out.`, "error");
			return;
		}
		cart.push({
			product: product,
			quantity: 1
		});
		const discountInfo = product.discount > 0 ? ` (${product.discount}% OFF)` : "";
		showFeedback(`\u2705 Scanned "${product.name}" into cart (Stock: ${product.stock})${discountInfo} \u2022 Shelf ${product.shelf}`, "success");
	}

	renderCart(product.productId);
}

// Update item quantity (+ / -)
function updateItemQuantity(productId, delta) {
	const index = cart.findIndex((item) => item.product.productId === productId);
	if (index === -1) return;

	if (delta > 0) {
		const item = cart[index];
		const availableStock = item.product.stock !== undefined ? item.product.stock : Infinity;
		if (item.quantity + delta > availableStock) {
			showFeedback(`⚠️ Cannot add more. Only ${availableStock} units left in stock.`, "error");
			return;
		}
	}

	cart[index].quantity += delta;
	if (cart[index].quantity <= 0) {
		const removedName = cart[index].product.name;
		cart.splice(index, 1);
		showFeedback(`Removed "${removedName}" from cart.`, "info");
	}

	renderCart();
}

// Remove item from cart
function removeItemFromCart(productId) {
	const index = cart.findIndex((item) => item.product.productId === productId);
	if (index > -1) {
		const removedName = cart[index].product.name;
		cart.splice(index, 1);
		showFeedback(`Removed "${removedName}" from cart.`, "info");
		renderCart();
	}
}

// Clear Entire Cart
clearCartBtn.addEventListener("click", () => {
	if (cart.length === 0) return;
	if (confirm("Are you sure you want to empty your shopping cart?")) {
		cart = [];
		showFeedback("Shopping cart cleared.", "info");
		renderCart();
	}
});

// =========================================================
// CENTRALIZED AUTOMATIC BILLING & DISCOUNT LOGIC
// =========================================================
function updateBillSummary() {
	let totalUnits = 0;
	let totalGrossSubtotal = 0;
	let totalDiscountSavings = 0;
	let totalNetPayable = 0;

	cart.forEach((item) => {
		const originalPrice = Number(item.product.price);
		const discountPercent = Number(item.product.discount || 0);

		// Per unit discount & effective price
		const unitDiscount = (originalPrice * discountPercent) / 100;
		const effectivePrice = originalPrice - unitDiscount;

		// Line metrics
		const lineGross = originalPrice * item.quantity;
		const lineSavings = unitDiscount * item.quantity;
		const lineNet = effectivePrice * item.quantity;

		item.originalPrice = originalPrice;
		item.discountPercent = discountPercent;
		item.unitDiscount = unitDiscount;
		item.effectivePrice = effectivePrice;
		item.lineGross = lineGross;
		item.lineSavings = lineSavings;
		item.lineNet = lineNet;

		totalUnits += item.quantity;
		totalGrossSubtotal += lineGross;
		totalDiscountSavings += lineSavings;
		totalNetPayable += lineNet;
	});

	const uniqueCount = cart.length;

	// 1. Update Header Badge
	if (headerBadgeCount) {
		headerBadgeCount.textContent = totalUnits;
	}

	// 2. Update Bill Summary DOM
	if (billUniqueItems) {
		billUniqueItems.textContent = `${uniqueCount} product${uniqueCount === 1 ? "" : "s"}`;
	}
	if (billTotalUnits) {
		billTotalUnits.textContent = `${totalUnits} item${totalUnits === 1 ? "" : "s"}`;
	}
	if (billSubtotal) {
		billSubtotal.textContent = formatCurrency(totalGrossSubtotal);
	}
	if (billDiscountTotal) {
		if (totalDiscountSavings > 0) {
			billDiscountTotal.textContent = `\u2212 ${formatCurrency(totalDiscountSavings)}`;
			billDiscountTotal.className = "bill-value discount-value discount-active";
		} else {
			billDiscountTotal.textContent = formatCurrency(0);
			billDiscountTotal.className = "bill-value discount-value";
		}
	}
	if (billTax) {
		billTax.innerHTML = `${formatCurrency(0)} <span class="tax-tag">(Inclusive of GST)</span>`;
	}
	if (billGrandTotal) {
		billGrandTotal.textContent = formatCurrency(totalNetPayable);
	}
	if (billSavingsNote) {
		if (totalDiscountSavings > 0) {
			billSavingsNote.textContent = `\u2713 You are saving ${formatCurrency(totalDiscountSavings)} with store offers on this order!`;
			billSavingsNote.classList.add("savings-highlight");
		} else {
			billSavingsNote.textContent = "\u2713 Inclusive of all applicable store taxes";
			billSavingsNote.classList.remove("savings-highlight");
		}
	}

	// 3. Actions Availability
	if (checkoutBtn) {
		checkoutBtn.disabled = totalUnits === 0;
	}
	if (clearCartBtn) {
		clearCartBtn.hidden = uniqueCount === 0;
	}

	return {
		uniqueCount,
		totalUnits,
		totalGrossSubtotal,
		totalDiscountSavings,
		totalNetPayable
	};
}

// Render Cart Table & Trigger Automatic Billing Update
function renderCart(highlightedProductId = null) {
	const { uniqueCount } = updateBillSummary();

	if (uniqueCount === 0) {
		emptyCartView.hidden = false;
		cartTableWrapper.hidden = true;
		cartTableBody.replaceChildren();
		return;
	}

	emptyCartView.hidden = true;
	cartTableWrapper.hidden = false;
	cartTableBody.replaceChildren();

	cart.forEach((item) => {
		const tr = document.createElement("tr");
		tr.className = "cart-row";

		if (item.product.productId === highlightedProductId) {
			tr.classList.add("row-highlight");
		}

		// 1. Product Name & Product ID + Stock
		const tdProduct = document.createElement("td");
		tdProduct.className = "cell-product";
		const stockNotice = item.product.stock !== undefined ? ` &bull; Stock: ${item.product.stock}` : "";
		tdProduct.innerHTML = `
			<strong class="item-name">${item.product.name}</strong>
			<span class="item-meta">Product ID: ${item.product.productId}${stockNotice}</span>
		`;

		// 2. Shelf Location
		const tdShelf = document.createElement("td");
		tdShelf.className = "center-col";
		tdShelf.innerHTML = `<span class="shelf-pill">${item.product.shelf}</span>`;

		// 3. Unit Price & Discount Tag
		const tdPrice = document.createElement("td");
		tdPrice.className = "right-col price-col";
		if (item.discountPercent > 0) {
			tdPrice.innerHTML = `
				<div class="price-container">
					<del class="orig-price">${formatCurrency(item.originalPrice)}</del>
					<span class="discount-badge">${item.discountPercent}% OFF</span>
					<strong class="effective-price">${formatCurrency(item.effectivePrice)}</strong>
				</div>
			`;
		} else {
			tdPrice.innerHTML = `<strong class="effective-price">${formatCurrency(item.originalPrice)}</strong>`;
		}

		// 4. Interactive Quantity Controls [ - ] [ Qty ] [ + ]
		const tdQty = document.createElement("td");
		tdQty.className = "center-col";
		const qtyContainer = document.createElement("div");
		qtyContainer.className = "qty-controls";

		const decBtn = document.createElement("button");
		decBtn.type = "button";
		decBtn.className = "qty-btn dec-btn";
		decBtn.innerHTML = "&minus;";
		decBtn.title = "Decrease quantity";
		decBtn.setAttribute("aria-label", `Decrease quantity for ${item.product.name}`);
		decBtn.addEventListener("click", () => updateItemQuantity(item.product.productId, -1));

		const qtySpan = document.createElement("span");
		qtySpan.className = "qty-number";
		qtySpan.textContent = item.quantity;

		const incBtn = document.createElement("button");
		incBtn.type = "button";
		incBtn.className = "qty-btn inc-btn";
		incBtn.innerHTML = "&plus;";
		incBtn.title = "Increase quantity";
		incBtn.setAttribute("aria-label", `Increase quantity for ${item.product.name}`);
		if (item.product.stock !== undefined && item.quantity >= item.product.stock) {
			incBtn.disabled = true;
			incBtn.title = `Max available stock reached (${item.product.stock} units)`;
		}
		incBtn.addEventListener("click", () => updateItemQuantity(item.product.productId, 1));

		qtyContainer.append(decBtn, qtySpan, incBtn);
		tdQty.appendChild(qtyContainer);

		// 5. Line Net Subtotal
		const tdSubtotal = document.createElement("td");
		tdSubtotal.className = "right-col subtotal-col";
		if (item.lineSavings > 0) {
			tdSubtotal.innerHTML = `
				<strong class="subtotal-amount">${formatCurrency(item.lineNet)}</strong>
				<span class="savings-text">Saved ${formatCurrency(item.lineSavings)}</span>
			`;
		} else {
			tdSubtotal.innerHTML = `<strong class="subtotal-amount">${formatCurrency(item.lineNet)}</strong>`;
		}

		// 6. Delete Action [ 🗑️ ]
		const tdAction = document.createElement("td");
		tdAction.className = "center-col";
		const delBtn = document.createElement("button");
		delBtn.type = "button";
		delBtn.className = "del-btn";
		delBtn.innerHTML = "&#128465;";
		delBtn.title = `Remove ${item.product.name} from cart`;
		delBtn.setAttribute("aria-label", `Remove ${item.product.name} from cart`);
		delBtn.addEventListener("click", () => removeItemFromCart(item.product.productId));
		tdAction.appendChild(delBtn);

		tr.append(tdProduct, tdShelf, tdPrice, tdQty, tdSubtotal, tdAction);
		cartTableBody.appendChild(tr);
	});
}

// =========================================================
// SUPERMARKET INDOOR ROUTE MAP & NAVIGATION LOGIC
// =========================================================
let mapHighlightTimer = null;

function getAisleInfo(shelfCode) {
	const prefix = (shelfCode || "").charAt(0).toUpperCase();
	if (prefix === "A") {
		return { aisle: "Aisle A", category: "Dairy & Bakery", corridorId: "path-corridor-1" };
	} else if (prefix === "B") {
		return { aisle: "Aisle B", category: "Pantry & Snacks", corridorId: "path-corridor-1" };
	} else if (prefix === "C") {
		return { aisle: "Aisle C", category: "Breakfast & Personal Care", corridorId: "path-corridor-2" };
	}
	return { aisle: "Store Floor", category: "General Merchandise", corridorId: "path-corridor-1" };
}

function clearMapHighlight() {
	if (mapHighlightTimer) {
		clearTimeout(mapHighlightTimer);
		mapHighlightTimer = null;
	}

	document.querySelectorAll(".shelf-node").forEach((node) => {
		node.classList.remove("shelf-active");
	});
	document.querySelectorAll(".corridor-path-zone").forEach((zone) => {
		zone.classList.remove("corridor-active");
	});
	document.querySelectorAll(".map-zone").forEach((zone) => {
		zone.classList.remove("zone-active");
	});
	document.querySelectorAll(".route-step").forEach((step) => {
		step.classList.remove("step-active");
	});

	if (mapRouteCallout) {
		mapRouteCallout.hidden = true;
	}
}

function highlightShelfOnMap(shelfCode, productInfo = null, autoClearSeconds = 0) {
	if (!shelfCode) return;

	clearMapHighlight();

	const cleanShelf = shelfCode.toUpperCase().trim();
	const targetShelf = document.querySelector(`#shelf-${cleanShelf}`) || document.querySelector(`[data-shelf="${cleanShelf}"]`);
	if (!targetShelf) return;

	// 1. Highlight Shelf with pulsing glow
	targetShelf.classList.add("shelf-active");

	// 2. Highlight Walking Path & Waypoints
	const aisleInfo = getAisleInfo(cleanShelf);
	const corridor = document.getElementById(aisleInfo.corridorId);
	if (corridor) corridor.classList.add("corridor-active");

	const entrance = document.getElementById("zone-entrance");
	const walkway = document.getElementById("zone-walkway");
	const checkout = document.getElementById("zone-checkout");
	if (entrance) entrance.classList.add("zone-active");
	if (walkway) walkway.classList.add("zone-active");
	if (checkout) checkout.classList.add("zone-active");

	// 3. Highlight Step Sequence
	const stepEnt = document.getElementById("step-entrance");
	const stepCorr = document.getElementById("step-corridor");
	const stepChk = document.getElementById("step-checkout");
	if (stepEnt) stepEnt.classList.add("step-active");
	if (stepCorr) stepCorr.classList.add("step-active");
	if (calloutStepShelf) calloutStepShelf.classList.add("step-active");
	if (stepChk) stepChk.classList.add("step-active");

	// 4. Populate Callout Banner
	const product = productInfo || availableProducts.find((p) => p.shelf.toUpperCase() === cleanShelf || p.rfid === cleanShelf || p.productId === cleanShelf);

	if (mapRouteCallout) {
		if (product) {
			calloutProductName.textContent = product.name;
			const discountText = product.discount > 0 ? ` • ${product.discount}% OFF Offer!` : "";
			const stockText = product.stock > 0 ? ` • ${product.stock} in stock` : " • ⚠️ Sold Out";
			calloutMeta.textContent = `Shelf ${product.shelf} • ${aisleInfo.aisle} (${aisleInfo.category}) • ${formatCurrency(product.price)}${discountText}${stockText}`;
			if (calloutStatusBadge) {
				if (product.stock <= 0) {
					calloutStatusBadge.textContent = "Out of Stock";
					calloutStatusBadge.className = "callout-tag callout-tag-out";
				} else if (product.discount > 0) {
					calloutStatusBadge.textContent = `${product.discount}% OFF Deal (${product.stock} in stock)`;
					calloutStatusBadge.className = "callout-tag callout-tag-in";
				} else {
					calloutStatusBadge.textContent = `${product.stock} in stock`;
					calloutStatusBadge.className = "callout-tag callout-tag-in";
				}
			}
			calloutStepShelf.innerHTML = `<span class="step-num">3</span> 🛒 Shelf ${product.shelf} (${product.name})`;
		} else {
			calloutProductName.textContent = `Shelf ${cleanShelf}`;
			calloutMeta.textContent = `${aisleInfo.aisle} (${aisleInfo.category})`;
			if (calloutStatusBadge) {
				calloutStatusBadge.textContent = `Shelf ${cleanShelf}`;
				calloutStatusBadge.className = "callout-tag";
			}
			calloutStepShelf.innerHTML = `<span class="step-num">3</span> 🛒 Shelf ${cleanShelf}`;
		}
		mapRouteCallout.hidden = false;
	}

	// 5. Auto-clear timer if specified (e.g. from RFID scan)
	if (autoClearSeconds > 0) {
		mapHighlightTimer = setTimeout(() => {
			clearMapHighlight();
		}, autoClearSeconds * 1000);
	}
}

function initMapInteractions() {
	// Search Input Filter
	if (mapSearchInput) {
		mapSearchInput.addEventListener("input", (e) => {
			const query = (e.target.value || "").trim().toLowerCase();
			if (!query) {
				clearMapHighlight();
				return;
			}

			// Find match in products
			const match = availableProducts.find((p) =>
				p.name.toLowerCase().includes(query) ||
				p.shelf.toLowerCase() === query ||
				p.rfid.toLowerCase() === query
			);

			if (match) {
				highlightShelfOnMap(match.shelf, match);
			} else {
				// Check direct shelf code (e.g., A1, B2)
				const upper = query.toUpperCase();
				if (document.querySelector(`#shelf-${upper}`)) {
					highlightShelfOnMap(upper);
				}
			}
		});
	}

	// Clear Search Button
	if (clearMapSearchBtn) {
		clearMapSearchBtn.addEventListener("click", () => {
			if (mapSearchInput) mapSearchInput.value = "";
			clearMapHighlight();
			if (mapSearchInput) mapSearchInput.focus();
		});
	}

	// Quick-Locate Chips
	document.querySelectorAll(".map-locate-chip").forEach((chip) => {
		chip.addEventListener("click", () => {
			const productName = chip.dataset.product;
			const match = availableProducts.find((p) => p.name.toLowerCase() === productName.toLowerCase());
			if (match) {
				if (mapSearchInput) mapSearchInput.value = match.name;
				highlightShelfOnMap(match.shelf, match);
			}
		});
	});

	// Interactive Clicks directly on Shelves (Purely Informational, NEVER Adds to Cart!)
	document.querySelectorAll(".shelf-node").forEach((shelfNode) => {
		shelfNode.addEventListener("click", () => {
			const shelfCode = shelfNode.dataset.shelf;
			if (shelfCode) {
				const match = availableProducts.find((p) => p.shelf === shelfCode);
				if (match && mapSearchInput) {
					mapSearchInput.value = match.name;
				}
				highlightShelfOnMap(shelfCode, match);
			}
		});

		shelfNode.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				shelfNode.click();
			}
		});
	});
}

// =========================================================
// UPI PAYMENT MODAL & SELF-CHECKOUT FLOW
// =========================================================

// 1. Open Interactive UPI QR Code Payment Modal
if (checkoutBtn) {
	checkoutBtn.addEventListener("click", () => {
		if (cart.length === 0) return;

		const bill = updateBillSummary();
		const netPayable = bill.totalNetPayable;
		const upiId = "smartcart@upi";
		const storeName = "SmartCart Supermarket";
		const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(storeName)}&am=${netPayable.toFixed(2)}&cu=INR&tn=SmartCart+Order`;
		const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(upiString)}`;

		if (upiQrImage) {
			upiQrImage.src = qrUrl;
		}

		if (paymentModalAmount) {
			paymentModalAmount.textContent = formatCurrency(netPayable);
		}

		if (paymentModalSavings) {
			if (bill.totalDiscountSavings > 0) {
				paymentModalSavings.textContent = `\u2713 Special Offer: You save ${formatCurrency(bill.totalDiscountSavings)} on this order!`;
				paymentModalSavings.style.color = "#15803d";
			} else {
				paymentModalSavings.textContent = "\u2713 Inclusive of all taxes & store GST";
				paymentModalSavings.style.color = "#64748b";
			}
		}

		if (paymentModal) {
			paymentModal.hidden = false;
		}
	});
}

// 2. Cancel Payment & Return to Cart
if (cancelPaymentBtn) {
	cancelPaymentBtn.addEventListener("click", () => {
		if (paymentModal) {
			paymentModal.hidden = true;
		}
	});
}

// 3. Confirm & Finalize Payment (Deducts stock from MongoDB & displays Digital Receipt)
if (confirmPaymentBtn) {
	confirmPaymentBtn.addEventListener("click", async () => {
		if (cart.length === 0) return;

		confirmPaymentBtn.disabled = true;
		confirmPaymentBtn.innerHTML = '<span aria-hidden="true">&#9203;</span> Verifying Payment with Bank...';

		try {
			const payload = {
				items: cart.map((item) => ({
					productId: item.product.productId,
					quantity: item.quantity
				}))
			};

			const response = await fetch(`${API_BASE}/checkout`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify(payload)
			});

			const data = await response.json();

			if (!response.ok || !data.success) {
				if (paymentModal) paymentModal.hidden = true;
				showFeedback(`\u274C Checkout error: ${data.message || "Unable to complete transaction"}`, "error");
				if (checkoutFeedback) {
					checkoutFeedback.className = "feedback-banner feedback-error";
					checkoutFeedback.innerHTML = `<strong>\u26A0\uFE0F Checkout Issue:</strong> ${data.message || "Failed to complete checkout."}`;
					checkoutFeedback.hidden = false;
				}
				return;
			}

			// 1. Hide Payment Modal
			if (paymentModal) {
				paymentModal.hidden = true;
			}

			// 2. Populate & Reveal Digital Receipt Modal
			if (receiptModal) {
				if (receiptOrderId) receiptOrderId.textContent = data.orderId || `ORD-${Date.now()}`;
				const orderDate = data.timestamp ? new Date(data.timestamp) : new Date();
				if (receiptTimestamp) receiptTimestamp.textContent = orderDate.toLocaleString();

				if (receiptItemsBody) {
					receiptItemsBody.replaceChildren();
					cart.forEach((cartItem) => {
						const row = document.createElement("tr");
						const effectiveUnit = cartItem.product.price * (1 - (cartItem.product.discount || 0) / 100);
						const lineSubtotal = effectiveUnit * cartItem.quantity;
						row.innerHTML = `
							<td>
								<strong>${cartItem.product.name}</strong><br>
								<small style="color: #64748b;">${cartItem.product.productId} &bull; Shelf ${cartItem.product.shelf}</small>
							</td>
							<td style="text-align: center;">${cartItem.quantity}</td>
							<td style="text-align: right;">${formatCurrency(cartItem.product.price)}</td>
							<td style="text-align: right;"><strong>${formatCurrency(lineSubtotal)}</strong></td>
						`;
						receiptItemsBody.appendChild(row);
					});
				}

				if (receiptSubtotal) receiptSubtotal.textContent = billSubtotal.textContent;
				if (receiptSavings) receiptSavings.textContent = billDiscountTotal.textContent;
				if (receiptGrandTotal) receiptGrandTotal.textContent = billGrandTotal.textContent;
				receiptModal.hidden = false;
			}

			// 3. Banner Feedback
			if (checkoutFeedback) {
				checkoutFeedback.className = "feedback-banner feedback-success";
				checkoutFeedback.innerHTML = `<strong>\u2705 Payment Verified!</strong> Order ID: <code>${data.orderId}</code>. Stock updated in MongoDB.`;
				checkoutFeedback.hidden = false;
				setTimeout(() => {
					checkoutFeedback.hidden = true;
				}, 8000);
			}

			// 4. Clear Cart & Refresh Store Catalog from Database
			cart = [];
			renderCart();
			await loadAvailableProducts();
			showFeedback(`\u2705 Payment confirmed! Order ID: ${data.orderId}`, "success");
		} catch (error) {
			if (paymentModal) paymentModal.hidden = true;
			showFeedback(`\u274C Payment verification failed: ${error.message}`, "error");
			if (checkoutFeedback) {
				checkoutFeedback.className = "feedback-banner feedback-error";
				checkoutFeedback.innerHTML = `<strong>\u26A0\uFE0F Network / Server Error:</strong> ${error.message}`;
				checkoutFeedback.hidden = false;
			}
		} finally {
			confirmPaymentBtn.disabled = false;
			confirmPaymentBtn.innerHTML = '&#10003; Confirm &amp; Complete Payment';
			if (checkoutBtn) checkoutBtn.disabled = cart.length === 0;
		}
	});
}

// 4. Close Payment Modal on Backdrop Click
if (paymentModal) {
	paymentModal.addEventListener("click", (e) => {
		if (e.target === paymentModal) {
			paymentModal.hidden = true;
		}
	});
}

// Receipt Modal Controls
if (printReceiptBtn) {
	printReceiptBtn.addEventListener("click", () => {
		window.print();
	});
}

if (closeReceiptBtn) {
	closeReceiptBtn.addEventListener("click", () => {
		if (receiptModal) receiptModal.hidden = true;
		if (rfidInput) rfidInput.focus();
	});
}

// =========================================================
// REAL-TIME HARDWARE SCAN STREAM (SSE from ESP32 / Server)
// =========================================================
function initHardwareScanStream() {
	if (!window.EventSource) {
		console.warn("EventSource is not supported by this browser.");
		return;
	}

	try {
		const sseUrl = `${API_BASE}/live-scans`;
		const eventSource = new EventSource(sseUrl);

		eventSource.onopen = () => {
			console.log("📡 Connected to ESP32 Hardware RFID Live Stream");
		};

		eventSource.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				if (!data || !data.type) return;

				if (data.type === "PRODUCT_SCANNED" && data.product) {
					const prod = data.product;
					addToCart(prod);
					highlightShelfOnMap(prod.shelf, prod, 5);
					showFeedback(`📡 Cart Sensor Scanned: "${prod.name}" added to cart! (Shelf ${prod.shelf})`, "success");
					if (rfidInput) {
						rfidInput.value = "";
					}
				} else if (data.type === "MANAGER_KEYCARD_SCANNED") {
					showFeedback(`🔒 Manager Keycard swiped on hardware scanner: ${data.rfid}`, "info");
				}
			} catch (err) {
				console.error("Error processing live scan event:", err);
			}
		};

		eventSource.onerror = (err) => {
			console.warn("SSE connection interrupted, browser will auto-reconnect...");
		};
	} catch (e) {
		console.error("Failed to initialize hardware scan stream:", e);
	}
}

// Form Submit Event Handler
scannerForm.addEventListener("submit", (e) => {
	e.preventDefault();
	handleScan(rfidInput.value);
});

// Initialization
loadAvailableProducts();
renderCart();
initHardwareScanStream();
