// Smart Cart - Store Manager Portal & Analytics (Step 7)
const AUTH_API = "http://localhost:5000/product-api/products/manager/auth";
const ANALYTICS_API = "http://localhost:5000/product-api/products/manager/analytics";
const RESTOCK_BASE = "http://localhost:5000/product-api/products";
const SESSION_KEY = "smartcart_manager_session";

// State
let inventoryData = [];
let analyticsSummary = {};
let managerFeedbackTimer = null;

// DOM Elements - 2FA Security Gate
const authContainer = document.querySelector("#manager-auth-container");
const authForm = document.querySelector("#manager-auth-form");
const authRfidInput = document.querySelector("#auth-rfid-input");
const scanManagerTagBtn = document.querySelector("#scan-manager-tag-btn");
const managerScanStatus = document.querySelector("#manager-scan-status");
const authPinInput = document.querySelector("#auth-pin-input");
const fillDemoCredsBtn = document.querySelector("#fill-demo-creds-btn");
const authFeedback = document.querySelector("#auth-feedback");
const authSubmitBtn = document.querySelector("#auth-submit-btn");

// DOM Elements - Manager Dashboard
const dashboardContainer = document.querySelector("#manager-dashboard-container");
const sessionManagerBadge = document.querySelector("#session-manager-badge");
const refreshDashboardBtn = document.querySelector("#refresh-dashboard-btn");
const logoutBtn = document.querySelector("#logout-btn");
const managerFeedback = document.querySelector("#manager-feedback");

// DOM Elements - KPI Metrics
const kpiTotalProducts = document.querySelector("#kpi-total-products");
const kpiTotalSold = document.querySelector("#kpi-total-sold");
const kpiTotalRevenue = document.querySelector("#kpi-total-revenue");
const kpiLowStockCount = document.querySelector("#kpi-low-stock-count");
const kpiCardAlerts = document.querySelector("#kpi-card-alerts");

// DOM Elements - Analytics Sections
const topSellingContainer = document.querySelector("#top-selling-container");
const restockAlertsContainer = document.querySelector("#restock-alerts-container");
const inventorySearchInput = document.querySelector("#inventory-search-input");
const inventoryTableBody = document.querySelector("#inventory-table-body");

// DOM Elements - Restock Modal
const restockModal = document.querySelector("#restock-modal");
const restockForm = document.querySelector("#restock-form");
const restockProductId = document.querySelector("#restock-product-id");
const restockDisplayName = document.querySelector("#restock-display-name");
const restockDisplayMeta = document.querySelector("#restock-display-meta");
const restockAmountInput = document.querySelector("#restock-amount-input");
const cancelRestockBtn = document.querySelector("#cancel-restock-btn");
const restockPresetBtns = document.querySelectorAll(".restock-preset-btn");

// DOM Elements - Discount Management Modal
const discountModal = document.querySelector("#discount-modal");
const discountForm = document.querySelector("#discount-form");
const discountProductId = document.querySelector("#discount-product-id");
const discountBasePrice = document.querySelector("#discount-base-price");
const discountDisplayName = document.querySelector("#discount-display-name");
const discountDisplayMeta = document.querySelector("#discount-display-meta");
const discountPercentInput = document.querySelector("#discount-percent-input");
const previewOrigPrice = document.querySelector("#preview-orig-price");
const previewSavings = document.querySelector("#preview-savings");
const previewEffectivePrice = document.querySelector("#preview-effective-price");
const cancelDiscountBtn = document.querySelector("#cancel-discount-btn");
const discountPresetBtns = document.querySelectorAll(".discount-preset-btn");

// Currency Formatter
function formatCurrency(amount) {
	return `\u20B9${Number(amount || 0).toFixed(2)}`;
}

// Show Manager Feedback Toast
function showManagerFeedback(message, type = "success") {
	if (managerFeedbackTimer) {
		clearTimeout(managerFeedbackTimer);
	}

	if (managerFeedback) {
		managerFeedback.textContent = message;
		managerFeedback.className = `feedback-banner feedback-${type}`;
		managerFeedback.hidden = false;

		managerFeedbackTimer = setTimeout(() => {
			managerFeedback.hidden = true;
		}, 5000);
	}
}

// =========================================================
// 1. 2-FACTOR AUTHENTICATION (2FA) GATE
// =========================================================

function checkSession() {
	const sessionRaw = sessionStorage.getItem(SESSION_KEY);
	if (sessionRaw) {
		try {
			const session = JSON.parse(sessionRaw);
			if (session && session.token === "manager-session-valid") {
				showDashboard(session);
				return;
			}
		} catch (e) {
			sessionStorage.removeItem(SESSION_KEY);
		}
	}
	showAuthGate();
}

function showAuthGate() {
	if (authContainer) authContainer.hidden = false;
	if (dashboardContainer) dashboardContainer.hidden = true;
	if (managerScanStatus) managerScanStatus.hidden = true;
	if (authRfidInput) authRfidInput.focus();
}

function showDashboard(session) {
	if (authContainer) authContainer.hidden = true;
	if (dashboardContainer) dashboardContainer.hidden = false;
	if (sessionManagerBadge && session) {
		sessionManagerBadge.textContent = `Manager: ${session.badge || "RFID-ADMIN"}`;
	}
	loadDashboardAnalytics();
}

// Handle 2FA Submission
if (authForm) {
	authForm.addEventListener("submit", async (e) => {
		e.preventDefault();

		const rfid = (authRfidInput.value || "").trim();
		const pin = (authPinInput.value || "").trim();

		if (!rfid || !pin) {
			showAuthError("Please provide both Manager RFID Keycard and Security PIN.");
			return;
		}

		authSubmitBtn.disabled = true;
		authSubmitBtn.innerHTML = '<span aria-hidden="true">&#9203;</span> Verifying Credentials...';
		hideAuthError();

		try {
			const response = await fetch(AUTH_API, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ rfid, pin })
			});

			const data = await response.json();

			if (!response.ok || !data.success) {
				showAuthError(data.message || "Invalid Manager RFID Keycard or Security PIN.");
				if (authPinInput) {
					authPinInput.value = "";
					authPinInput.focus();
				}
				return;
			}

			// Store valid session
			const sessionData = {
				token: data.token,
				badge: data.manager ? data.manager.badgeId : "RFID-ADMIN",
				time: data.manager ? data.manager.authorizedAt : new Date().toISOString()
			};
			sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));

			showDashboard(sessionData);
			showManagerFeedback(`\u2705 Welcome, Store Manager! 2FA verification verified via ${sessionData.badge}.`, "success");
		} catch (error) {
			showAuthError(`Server connection failure: ${error.message}. Is backend running on port 5000?`);
		} finally {
			authSubmitBtn.disabled = false;
			authSubmitBtn.innerHTML = '<span aria-hidden="true">&#128275;</span> Unlock Manager Dashboard';
		}
	});
}

function showAuthError(msg) {
	if (authFeedback) {
		authFeedback.textContent = msg;
		authFeedback.hidden = false;
	}
}

function hideAuthError() {
	if (authFeedback) {
		authFeedback.hidden = true;
	}
}

// Scan Manager Keycard (Factor 1 Action & Sensor Simulation)
function triggerKeycardScanSimulation(customTag = null) {
	const currentVal = authRfidInput ? authRfidInput.value.trim() : "";
	const tagToScan = customTag || (currentVal.length > 0 ? currentVal : "RFID-ADMIN");

	if (authRfidInput) {
		authRfidInput.value = tagToScan;
	}

	if (managerScanStatus) {
		managerScanStatus.innerHTML = `<strong>&#128246; Keycard Detected:</strong> Manager Master Badge (<code>${tagToScan}</code>) Read Successfully!`;
		managerScanStatus.className = "field-scan-status scan-status-success";
		managerScanStatus.hidden = false;
	}

	hideAuthError();

	// Automatically move focus to Factor 2 Security PIN
	if (authPinInput) {
		authPinInput.focus();
		authPinInput.select();
	}
}

if (scanManagerTagBtn) {
	scanManagerTagBtn.addEventListener("click", () => {
		triggerKeycardScanSimulation();
	});
}

// Auto-detect swipe on physical/USB RFID scanner swipe or Enter key in RFID field
if (authRfidInput) {
	authRfidInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			const val = authRfidInput.value.trim();
			triggerKeycardScanSimulation(val.length > 0 ? val : "RFID-ADMIN");
		}
	});
}

// Demo Helper: Auto-fill configured manager credentials
if (fillDemoCredsBtn) {
	fillDemoCredsBtn.addEventListener("click", () => {
		triggerKeycardScanSimulation("RFID-ADMIN");
		if (authPinInput) authPinInput.value = "1234";
		hideAuthError();
		if (authSubmitBtn) authSubmitBtn.focus();
	});
}

// Logout Handler
if (logoutBtn) {
	logoutBtn.addEventListener("click", () => {
		sessionStorage.removeItem(SESSION_KEY);
		if (authForm) authForm.reset();
		if (managerScanStatus) managerScanStatus.hidden = true;
		hideAuthError();
		showAuthGate();
	});
}

// Refresh Data Button
if (refreshDashboardBtn) {
	refreshDashboardBtn.addEventListener("click", () => {
		loadDashboardAnalytics(true);
	});
}

// =========================================================
// 2. DASHBOARD DATA & REAL-TIME ANALYTICS
// =========================================================

async function loadDashboardAnalytics(isUserRefresh = false) {
	try {
		if (refreshDashboardBtn) {
			refreshDashboardBtn.disabled = true;
			refreshDashboardBtn.textContent = "\u23F3 Loading...";
		}

		const response = await fetch(ANALYTICS_API);
		if (!response.ok) {
			throw new Error(`Analytics API returned status ${response.status}`);
		}

		const data = await response.json();
		if (!data.success) {
			throw new Error(data.message || "Failed to parse analytics");
		}

		analyticsSummary = data.analytics || {};
		inventoryData = Array.isArray(data.products) ? data.products : [];

		// 1. Render KPI Metric Cards
		renderKpis(analyticsSummary);

		// 2. Render Fast-Moving Products
		renderTopSelling(analyticsSummary.topSelling || []);

		// 3. Render Restock Alerts
		renderRestockAlerts(analyticsSummary.restockAlerts || []);

		// 4. Render Full Inventory Table
		renderInventoryTable();

		if (isUserRefresh) {
			showManagerFeedback("\u2705 Dashboard metrics refreshed successfully from MongoDB.", "success");
		}
	} catch (error) {
		showManagerFeedback(`\u26A0\uFE0F Error loading analytics: ${error.message}`, "error");
	} finally {
		if (refreshDashboardBtn) {
			refreshDashboardBtn.disabled = false;
			refreshDashboardBtn.innerHTML = "&#128259; Refresh Data";
		}
	}
}

function renderKpis(analytics) {
	if (kpiTotalProducts) kpiTotalProducts.textContent = analytics.totalProducts || 0;
	if (kpiTotalSold) kpiTotalSold.textContent = analytics.totalItemsSold || 0;
	if (kpiTotalRevenue) kpiTotalRevenue.textContent = formatCurrency(analytics.totalRevenue || 0);

	const lowCount = analytics.lowStockCount || 0;
	if (kpiLowStockCount) kpiLowStockCount.textContent = lowCount;

	if (kpiCardAlerts) {
		if (lowCount > 0) {
			kpiCardAlerts.classList.add("kpi-alert-active");
		} else {
			kpiCardAlerts.classList.remove("kpi-alert-active");
		}
	}
}

// Fast-Moving Products Ranking
function renderTopSelling(topSelling) {
	if (!topSellingContainer) return;

	if (topSelling.length === 0) {
		topSellingContainer.innerHTML = `
			<div class="empty-state-card">
				<div class="empty-state-icon">&#128722;</div>
				<p><strong>No sales recorded yet.</strong></p>
				<p class="empty-state-sub">Completed customer checkouts will dynamically rank here by highest quantity sold.</p>
			</div>
		`;
		return;
	}

	topSellingContainer.replaceChildren();

	topSelling.forEach((item, index) => {
		const card = document.createElement("div");
		card.className = "ranked-item";

		const rankNum = index + 1;
		const medal = rankNum === 1 ? "&#129351;" : rankNum === 2 ? "&#129352;" : rankNum === 3 ? "&#129353;" : `#${rankNum}`;

		card.innerHTML = `
			<div class="rank-badge">${medal}</div>
			<div class="rank-details">
				<strong class="item-name">${item.name}</strong>
				<span class="item-meta">Shelf ${item.shelf} &bull; ${item.productId} &bull; Price ${formatCurrency(item.price)}</span>
			</div>
			<div class="rank-stats">
				<strong class="rank-sold">${item.totalSold} sold</strong>
				<span class="rank-revenue">${formatCurrency(item.revenueGenerated)} rev</span>
			</div>
		`;

		topSellingContainer.appendChild(card);
	});
}

// Restock Needed Warnings
function renderRestockAlerts(alerts) {
	if (!restockAlertsContainer) return;

	if (alerts.length === 0) {
		restockAlertsContainer.innerHTML = `
			<div class="empty-state-card healthy-state">
				<div class="empty-state-icon">&#9989;</div>
				<p><strong>All inventory levels are healthy!</strong></p>
				<p class="empty-state-sub">Every product in MongoDB currently has more than 5 units in stock.</p>
			</div>
		`;
		return;
	}

	restockAlertsContainer.replaceChildren();

	alerts.forEach((alert) => {
		const card = document.createElement("div");
		const isOut = alert.stock === 0;
		card.className = `alert-item ${isOut ? "alert-critical" : "alert-warning"}`;

		card.innerHTML = `
			<div class="alert-icon" aria-hidden="true">${isOut ? "&#9940;" : "&#9888;&#65039;"}</div>
			<div class="alert-info">
				<div class="alert-header-row">
					<strong class="alert-name">${alert.name}</strong>
					<span class="urgency-pill ${isOut ? "urgency-critical" : "urgency-warning"}">
						${isOut ? "SOLD OUT" : "LOW STOCK"}
					</span>
				</div>
				<span class="alert-meta">
					Shelf ${alert.shelf} &bull; ID: ${alert.productId} &bull; 
					<strong class="stock-count-alert">${alert.stock} units remaining</strong>
				</span>
			</div>
			<div class="alert-actions">
				<button type="button" class="button button-sm button-primary quick-restock-btn" data-id="${alert.productId}" data-name="${alert.name}" data-stock="${alert.stock}" data-shelf="${alert.shelf}">
					+ Restock
				</button>
			</div>
		`;

		const restockBtn = card.querySelector(".quick-restock-btn");
		if (restockBtn) {
			restockBtn.addEventListener("click", () => {
				openRestockModal(alert.productId, alert.name, alert.shelf, alert.stock);
			});
		}

		restockAlertsContainer.appendChild(card);
	});
}

// =========================================================
// 3. FULL INVENTORY & STOCK TABLE
// =========================================================

function renderInventoryTable() {
	if (!inventoryTableBody) return;

	const filter = (inventorySearchInput ? inventorySearchInput.value : "").trim().toLowerCase();

	const filtered = inventoryData.filter((p) => {
		if (!filter) return true;
		return (
			p.name.toLowerCase().includes(filter) ||
			p.productId.toLowerCase().includes(filter) ||
			p.shelf.toLowerCase().includes(filter) ||
			(p.rfid && p.rfid.toLowerCase().includes(filter))
		);
	});

	if (filtered.length === 0) {
		inventoryTableBody.innerHTML = `
			<tr>
				<td colspan="8" class="table-empty-notice">
					No matching products found in store inventory.
				</td>
			</tr>
		`;
		return;
	}

	inventoryTableBody.replaceChildren();

	filtered.forEach((product) => {
		const tr = document.createElement("tr");

		// Health status
		let statusHtml = '<span class="status-pill status-healthy">\u2713 In Stock</span>';
		if (product.stock === 0) {
			statusHtml = '<span class="status-pill status-out">\u2717 Out of Stock</span>';
		} else if (product.stock <= 5) {
			statusHtml = '<span class="status-pill status-low">\u26A0 Low Stock</span>';
		}

		// Pricing & discount
		const discount = product.discount || 0;
		const origPrice = product.price;
		const effectivePrice = origPrice * (1 - discount / 100);
		let pricingHtml = "";
		if (discount > 0) {
			pricingHtml = `
				<div class="price-container">
					<del class="orig-price">${formatCurrency(origPrice)}</del>
					<span class="discount-badge">${discount}% OFF</span>
					<strong class="effective-price">${formatCurrency(effectivePrice)}</strong>
				</div>
			`;
		} else {
			pricingHtml = `
				<div class="price-container">
					<strong class="effective-price">${formatCurrency(origPrice)}</strong>
					<span class="discount-badge-none" style="font-size: 0.7rem; color: #64748b;">No Offer (0%)</span>
				</div>
			`;
		}

		tr.innerHTML = `
			<td><code>${product.productId}</code></td>
			<td>
				<strong>${product.name}</strong><br>
				<span class="manager-rfid-tag">Tag: <code>${product.rfid}</code></span>
			</td>
			<td class="center-col"><span class="shelf-pill">${product.shelf}</span></td>
			<td class="right-col">
				${pricingHtml}
			</td>
			<td class="center-col">
				<strong class="stock-number ${product.stock <= 5 ? "stock-warn" : ""}">${product.stock}</strong>
			</td>
			<td class="center-col">
				<strong>${product.totalSold || 0}</strong>
			</td>
			<td class="center-col">${statusHtml}</td>
			<td class="center-col">
				<div class="row-actions">
					<button type="button" class="button button-sm button-outline open-discount-btn" data-id="${product.productId}" title="Update promotional discount">
						&#127991; Discount
					</button>
					<button type="button" class="button button-sm button-outline instant-add-btn" data-id="${product.productId}" title="Instantly add +10 units">
						+10
					</button>
					<button type="button" class="button button-sm button-primary open-modal-btn" data-id="${product.productId}" title="Custom restock">
						Restock
					</button>
				</div>
			</td>
		`;

		// Open discount modal button
		const discountBtn = tr.querySelector(".open-discount-btn");
		if (discountBtn) {
			discountBtn.addEventListener("click", () => {
				openDiscountModal(product.productId, product.name, product.shelf, product.price, product.discount || 0);
			});
		}

		// Quick +10 button
		const instantBtn = tr.querySelector(".instant-add-btn");
		if (instantBtn) {
			instantBtn.addEventListener("click", () => {
				executeRestock(product.productId, 10, product.name);
			});
		}

		// Open custom restock modal button
		const openModalBtn = tr.querySelector(".open-modal-btn");
		if (openModalBtn) {
			openModalBtn.addEventListener("click", () => {
				openRestockModal(product.productId, product.name, product.shelf, product.stock);
			});
		}

		inventoryTableBody.appendChild(tr);
	});
}

// Search Filter Listener
if (inventorySearchInput) {
	inventorySearchInput.addEventListener("input", () => {
		renderInventoryTable();
	});
}

// =========================================================
// 4. RESTOCK OPERATIONS & MODAL HANDLER
// =========================================================

function openRestockModal(productId, productName, shelf, currentStock) {
	if (!restockModal) return;

	if (restockProductId) restockProductId.value = productId;
	if (restockDisplayName) restockDisplayName.textContent = productName;
	if (restockDisplayMeta) {
		restockDisplayMeta.textContent = `Product ID: ${productId} \u2022 Shelf: ${shelf} \u2022 Current Stock: ${currentStock} units`;
	}
	if (restockAmountInput) {
		restockAmountInput.value = "10";
		restockAmountInput.focus();
	}

	restockModal.hidden = false;
}

function closeRestockModal() {
	if (restockModal) restockModal.hidden = true;
	if (restockForm) restockForm.reset();
}

if (cancelRestockBtn) {
	cancelRestockBtn.addEventListener("click", closeRestockModal);
}

// Restock presets (+5, +10, +20)
restockPresetBtns.forEach((btn) => {
	btn.addEventListener("click", () => {
		const amount = btn.dataset.amount;
		if (restockAmountInput && amount) {
			restockAmountInput.value = amount;
		}
	});
});

// Form submission for custom restock modal
if (restockForm) {
	restockForm.addEventListener("submit", async (e) => {
		e.preventDefault();

		const productId = restockProductId.value;
		const amount = parseInt(restockAmountInput.value, 10);
		const productName = restockDisplayName.textContent;

		if (!productId || isNaN(amount) || amount <= 0) {
			alert("Please enter a valid positive number of units to add.");
			return;
		}

		closeRestockModal();
		await executeRestock(productId, amount, productName);
	});
}

// Execute REST API Call to Restock
async function executeRestock(productId, amount, productName) {
	try {
		showManagerFeedback(`\u23F3 Updating MongoDB: Adding +${amount} units to "${productName}"...`, "info");

		const url = `${RESTOCK_BASE}/${encodeURIComponent(productId)}/restock`;
		const response = await fetch(url, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ amount })
		});

		const data = await response.json();

		if (!response.ok || !data.success) {
			throw new Error(data.message || "Failed to update stock");
		}

		showManagerFeedback(`\u2705 Inventory updated in MongoDB: Restocked +${amount} units for ${productName}. (New Stock: ${data.product.stock})`, "success");

		// Refresh data to keep KPIs, alerts, and inventory in sync
		await loadDashboardAnalytics();
	} catch (error) {
		showManagerFeedback(`❌ Restock failed: ${error.message}`, "error");
	}
}

// =========================================================
// 5. PROMOTIONAL DISCOUNT MANAGEMENT & MODAL
// =========================================================

function openDiscountModal(productId, productName, shelf, basePrice, currentDiscount) {
	if (!discountModal) return;

	if (discountProductId) discountProductId.value = productId;
	if (discountBasePrice) discountBasePrice.value = basePrice;
	if (discountDisplayName) discountDisplayName.textContent = productName;
	if (discountDisplayMeta) {
		discountDisplayMeta.textContent = `Product ID: ${productId} • Shelf: ${shelf} • Base Price: ${formatCurrency(basePrice)}`;
	}
	if (discountPercentInput) {
		discountPercentInput.value = currentDiscount;
	}

	updateDiscountCalculationPreview(basePrice, currentDiscount);
	discountModal.hidden = false;
	if (discountPercentInput) {
		discountPercentInput.focus();
		discountPercentInput.select();
	}
}

function closeDiscountModal() {
	if (discountModal) discountModal.hidden = true;
	if (discountForm) discountForm.reset();
}

function updateDiscountCalculationPreview(basePrice, discountPercent) {
	const price = Number(basePrice) || 0;
	const percent = Math.min(100, Math.max(0, parseFloat(discountPercent) || 0));
	const savings = price * (percent / 100);
	const effective = Math.max(0, price - savings);

	if (previewOrigPrice) previewOrigPrice.textContent = formatCurrency(price);
	if (previewSavings) previewSavings.textContent = `- ${formatCurrency(savings)} (${percent}% OFF)`;
	if (previewEffectivePrice) previewEffectivePrice.textContent = formatCurrency(effective);
}

if (cancelDiscountBtn) {
	cancelDiscountBtn.addEventListener("click", closeDiscountModal);
}

// Preset discount buttons (0%, 5%, 10%, 15%, 20%, 25%)
if (discountPresetBtns) {
	discountPresetBtns.forEach((btn) => {
		btn.addEventListener("click", () => {
			const percent = parseFloat(btn.dataset.percent);
			if (discountPercentInput && !isNaN(percent)) {
				discountPercentInput.value = percent;
				const basePrice = Number(discountBasePrice.value) || 0;
				updateDiscountCalculationPreview(basePrice, percent);
			}
		});
	});
}

// Live update price preview on typing
if (discountPercentInput) {
	discountPercentInput.addEventListener("input", (e) => {
		const basePrice = Number(discountBasePrice.value) || 0;
		updateDiscountCalculationPreview(basePrice, e.target.value);
	});
}

// Form submission for discount update
if (discountForm) {
	discountForm.addEventListener("submit", async (e) => {
		e.preventDefault();

		const productId = discountProductId.value;
		const discount = parseFloat(discountPercentInput.value);
		const productName = discountDisplayName.textContent;

		if (!productId || isNaN(discount) || discount < 0 || discount > 100) {
			alert("Please enter a valid discount percentage between 0% and 100%.");
			return;
		}

		closeDiscountModal();
		await executeDiscountUpdate(productId, discount, productName);
	});
}

// Send PUT request to update discount in MongoDB
async function executeDiscountUpdate(productId, discount, productName) {
	try {
		showManagerFeedback(`⏳ Updating MongoDB: Setting ${discount}% discount for "${productName}"...`, "info");

		const url = `${RESTOCK_BASE}/${encodeURIComponent(productId)}/discount`;
		const response = await fetch(url, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ discount })
		});

		const data = await response.json();

		if (!response.ok || !data.success) {
			throw new Error(data.message || "Failed to update discount");
		}

		showManagerFeedback(`✅ Updated ${productName} discount to ${discount}% in MongoDB!`, "success");

		// Refresh data to keep KPIs, revenue, and inventory table in sync
		await loadDashboardAnalytics();
	} catch (error) {
		showManagerFeedback(`❌ Discount update failed: ${error.message}`, "error");
	}
}

// Refresh Dashboard Data button
if (refreshDashboardBtn) {
	refreshDashboardBtn.addEventListener("click", async () => {
		showManagerFeedback("Syncing with MongoDB database...", "info");
		await loadDashboardAnalytics();
	});
}

// Logout / Lock Manager Console
if (logoutBtn) {
	logoutBtn.addEventListener("click", () => {
		sessionStorage.removeItem(SESSION_KEY);
		showAuthGate();
		if (authPinInput) authPinInput.value = "";
		if (authFeedback) authFeedback.hidden = true;
		showAuthError("🔒 Manager console locked. Please authenticate with 2FA to re-enter.");
		if (authFeedback) {
			authFeedback.className = "feedback-banner feedback-info";
		}
	});
}

// =========================================================
// 6. REAL-TIME HARDWARE SCAN STREAM (SSE from ESP32 / Server)
// =========================================================
function initManagerHardwareScanStream() {
	if (!window.EventSource) return;

	try {
		const sseUrl = `${RESTOCK_BASE}/live-scans`;
		const eventSource = new EventSource(sseUrl);

		eventSource.onopen = () => {
			console.log("📡 Manager connected to Hardware RFID Stream");
		};

		eventSource.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				if (!data || !data.type) return;

				if (data.type === "MANAGER_KEYCARD_SCANNED") {
					if (authContainer && !authContainer.hidden) {
						// Factor 1 hardware keycard detected!
						triggerKeycardScanSimulation(data.rfid);
						if (managerScanStatus) {
							managerScanStatus.innerHTML = `<strong>📡 Hardware Keycard Swiped:</strong> Keycard <code>${data.rfid}</code> read! Enter PIN to proceed.`;
							managerScanStatus.className = "field-scan-status scan-status-success";
							managerScanStatus.hidden = false;
						}
					} else {
						showManagerFeedback(`🔑 Hardware Manager Keycard detected (${data.rfid})`, "info");
					}
				} else if (data.type === "PRODUCT_SCANNED") {
					console.log("Cart hardware scan event:", data.product ? data.product.name : "");
				}
			} catch (err) {
				console.error("Error processing manager live scan:", err);
			}
		};

		eventSource.onerror = () => {
			console.warn("Manager SSE interrupted, auto-reconnecting...");
		};
	} catch (e) {
		console.error("Failed to initialize manager hardware scan stream:", e);
	}
}

// Initialization on load
checkSession();
initManagerHardwareScanStream();
