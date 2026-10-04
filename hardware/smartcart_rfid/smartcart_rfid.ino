/*
 * ==============================================================================
 * Smart Cart System - ESP32 + MFRC522 RFID Hardware Integration
 * IoT Course Based Project (CBP) - Automated Supermarket System
 * ==============================================================================
 *
 * Microcontroller: ESP32 DevKit V1 (30-pin / 36-pin)
 * RFID Module:     RC522 (13.56 MHz SPI Reader)
 * Protocol:        SPI (Hardware SPI) + HTTP REST over Wi-Fi
 * Backend Route:   GET http://<SERVER_IP>:5000/product-api/products/rfid/<UID>
 *
 * WIRING PINOUT (RC522 -> ESP32):
 * -------------------------------------------------------------
 * RC522 Pin    | ESP32 Pin    | Notes
 * -------------------------------------------------------------
 * VCC (3.3V)   | 3V3          | CAUTION: Do NOT connect to 5V!
 * RST          | GPIO 22      | Reset line
 * GND          | GND          | Ground reference
 * MISO         | GPIO 19      | SPI Master-In Slave-Out
 * MOSI         | GPIO 23      | SPI Master-Out Slave-In
 * SCK          | GPIO 18      | SPI Clock
 * SDA (SS)     | GPIO 5       | SPI Slave Select (Chip Select)
 * -------------------------------------------------------------
 * OPTIONAL PERIPHERALS:
 * Built-in LED | GPIO 2       | Blinks on scan & Wi-Fi status
 * Buzzer (+)   | GPIO 4       | Beeps on successful tag scan
 * Buzzer (-)   | GND          | Ground
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>

// ==============================================================================
// 1. NETWORK & BACKEND CONFIGURATION (EDIT BEFORE UPLOAD)
// ==============================================================================
// Set your Wi-Fi credentials (must be 2.4 GHz Wi-Fi network)
const char* ssid     = "moto60";
const char* password = "seri@2123";

// Replace with your laptop/server local IPv4 address (run 'ipconfig' on Windows)
// Example: "http://192.168.1.15:5000/product-api/products/rfid/"
const char* serverUrl = "http://10.23.41.239:5000/product-api/products/rfid/";

// ==============================================================================
// 2. HARDWARE PIN DEFINITIONS
// ==============================================================================
#define SS_PIN        5     // SDA / Chip Select
#define RST_PIN       22    // Reset
#define SCK_PIN       18    // SPI Clock
#define MISO_PIN      19    // SPI MISO
#define MOSI_PIN      23    // SPI MOSI

#define STATUS_LED    2     // Built-in Blue LED on most ESP32 boards
#define BUZZER_PIN    4     // Optional active buzzer (set to -1 if not connected)

// Debounce interval: Prevent rapid duplicate reads if card is held on the coil
const unsigned long SCAN_DEBOUNCE_MS = 2500;

// Hardware RFID object
MFRC522 rfid(SS_PIN, RST_PIN);

// Debounce tracking
String lastScannedUID = "";
unsigned long lastScanTime = 0;

// ==============================================================================
// HELPER: Play Short Beep on Buzzer
// ==============================================================================
void triggerBeep(int durationMs = 120, int count = 1) {
  if (BUZZER_PIN < 0) return;
  
  for (int i = 0; i < count; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(durationMs);
    digitalWrite(BUZZER_PIN, LOW);
    if (count > 1) delay(80);
  }
}

// ==============================================================================
// HELPER: Connect to Wi-Fi with auto-retry
// ==============================================================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.println();
  Serial.print("[Wi-Fi] Connecting to network: ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    digitalWrite(STATUS_LED, !digitalRead(STATUS_LED)); // Toggle LED while connecting
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(STATUS_LED, HIGH); // Solid ON when connected
    Serial.println();
    Serial.println("[Wi-Fi] Connected successfully!");
    Serial.print("[Wi-Fi] ESP32 Assigned IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("[Wi-Fi] Signal Strength (RSSI): ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    triggerBeep(80, 2); // Two quick beeps on Wi-Fi connection
  } else {
    digitalWrite(STATUS_LED, LOW);
    Serial.println();
    Serial.println("[Wi-Fi] Connection failed! Will retry in main loop.");
  }
}

// ==============================================================================
// SETUP FUNCTION
// ==============================================================================
void setup() {
  // Initialize Serial Monitor
  Serial.begin(115200);
  while (!Serial && millis() < 2000); // Wait for Serial Monitor on USB CDC
  
  delay(500);
  Serial.println("\n\n========================================================");
  Serial.println("  SMART CART SYSTEM - ESP32 IOT RFID CONTROLLER");
  Serial.println("========================================================");

  // Initialize status pins
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, LOW);

  if (BUZZER_PIN >= 0) {
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);
  }

  // Connect to Wi-Fi
  connectWiFi();

    // Initialize SPI bus (standard ESP32 SPI)
  SPI.begin();
  pinMode(SS_PIN, OUTPUT);
  digitalWrite(SS_PIN, HIGH);
  pinMode(RST_PIN, OUTPUT);
  digitalWrite(RST_PIN, HIGH);
  delay(50);

  // Initialize MFRC522 RFID reader
  rfid.PCD_Init();
  delay(100);

  // Verify RC522 communication
  byte version = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.print("[RC522] Firmware Version: 0x");
  Serial.println(version, HEX);

  if (version == 0x00 || version == 0xFF) {
    Serial.println("[RC522] WARNING: RC522 Reader NOT detected!");
    Serial.println("[RC522] Please check 3.3V power, GND, and SPI wiring (SDA=5, RST=22, SCK=18, MOSI=23, MISO=19).");
  } else {
    Serial.println("[RC522] Reader initialized and ready.");
    Serial.println("[READY] Present an RFID tag to the cart antenna...");
  }
  Serial.println("========================================================\n");
}

// ==============================================================================
// MAIN LOOP
// ==============================================================================
void loop() {
  // 1. Maintain Wi-Fi connectivity
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    delay(1000);
    return;
  }

  // 2. Check if a new RFID card is presented
  if (!rfid.PICC_IsNewCardPresent()) {
    delay(50);
    return;
  }

  // 3. Select and read serial from the card
  if (!rfid.PICC_ReadCardSerial()) {
    delay(50);
    return;
  }

  // 4. Format UID to Clean Hex String (e.g., "A3B4C2D1")
  String tagUID = "";
  String prettyUID = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    byte b = rfid.uid.uidByte[i];
    if (b < 0x10) {
      tagUID += "0";
      prettyUID += "0";
    }
    tagUID += String(b, HEX);
    prettyUID += String(b, HEX);
    if (i < rfid.uid.size - 1) {
      prettyUID += " ";
    }
  }
  tagUID.toUpperCase();
  prettyUID.toUpperCase();

  // 5. Debounce check: Prevent duplicate scans if same tag is held
  unsigned long now = millis();
  if (tagUID == lastScannedUID && (now - lastScanTime) < SCAN_DEBOUNCE_MS) {
    // Tag is still held on reader; ignore duplicate trigger
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    return;
  }

  lastScannedUID = tagUID;
  lastScanTime = now;

  // Flash LED & Beep
  digitalWrite(STATUS_LED, LOW);
  triggerBeep(120, 1);
  digitalWrite(STATUS_LED, HIGH);

  Serial.println("--------------------------------------------------------");
  Serial.print("[SCAN] Tag Detected! UID: ");
  Serial.print(tagUID);
  Serial.print(" (Bytes: ");
  Serial.print(prettyUID);
  Serial.println(")");

  // 6. Send HTTP GET request to Smart Cart Backend
  HTTPClient http;
  String fullRequestUrl = String(serverUrl) + tagUID;

  Serial.print("[HTTP] Dispatching GET: ");
  Serial.println(fullRequestUrl);

  http.begin(fullRequestUrl);
  http.setTimeout(5000); // 5 second timeout

  int httpResponseCode = http.GET();

  if (httpResponseCode > 0) {
    Serial.print("[HTTP] Server Response Code: ");
    Serial.println(httpResponseCode);

    String payload = http.getString();
    Serial.print("[HTTP] Response Payload: ");
    Serial.println(payload);

    if (httpResponseCode == 200) {
      Serial.println("[SUCCESS] Item recognized and added to digital cart!");
      triggerBeep(60, 2); // 2 short happy beeps
    } else if (httpResponseCode == 404) {
      Serial.println("[NOTICE] Tag not registered in database catalog.");
      Serial.println("         Run 'npm run update-tags' in backend to map this UID.");
      triggerBeep(300, 1); // 1 long warning beep
    } else {
      Serial.println("[WARNING] Server returned non-200 status.");
    }
  } else {
    Serial.print("[HTTP ERROR] Request failed: ");
    Serial.println(http.errorToString(httpResponseCode).c_str());
    Serial.println("             Ensure backend server is running on port 5000 and PC firewall allows incoming connections.");
  }

  http.end();

  // 7. Halt PICC card to save power & end crypto session
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  Serial.println("--------------------------------------------------------\n");
}
