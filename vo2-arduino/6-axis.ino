#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>

#include <BLEDevice.h>
#include <BLE2902.h>
#include <BLEServer.h>
#include <BLEUtils.h>

#define DEVICE_NAME         "GISELA BLE"
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

Adafruit_MPU6050 mpu;

const uint32_t SAMPLE_PERIOD_MS = 20;   // 50 per second
uint32_t lastSampleMs = 0;

struct __attribute__((packed)) ImuPacket {
  uint32_t t_ms;
  float ax, ay, az;
  float gx, gy, gz;
};

BLECharacteristic *pCharacteristic;
volatile bool deviceConnected = false;

class MyServerCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) override {
    deviceConnected = true;
    Serial.println("BLE client connected.");
  }
  void onDisconnect(BLEServer* pServer) override {
    deviceConnected = false;
    Serial.println("BLE client disconnected. Restart advertising...");
    BLEDevice::startAdvertising();
  }
};

void setup() {
  Serial.begin(115200);
  delay(100);

  Wire.begin(9, 10);   // SDA=9, SCL=10 

  if (!mpu.begin()) {
    Serial.println("Failed to find MPU6050 chip");
    while (1) delay(10);
  }

  mpu.setAccelerometerRange(MPU6050_RANGE_16_G);
  mpu.setGyroRange(MPU6050_RANGE_250_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  Serial.println("Starting BLE!");

  BLEDevice::init(DEVICE_NAME);
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ
  );

  pCharacteristic->addDescriptor(new BLE2902());
  pCharacteristic->setValue("Init");

  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  BLEDevice::startAdvertising();
}

void loop() {
  uint32_t now = millis();
  if (now - lastSampleMs < SAMPLE_PERIOD_MS) {
    delay(1);
    return;
  }
  lastSampleMs += SAMPLE_PERIOD_MS;

  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  ImuPacket pkt;
  pkt.t_ms = now;
  pkt.ax = a.acceleration.x;
  pkt.ay = a.acceleration.y;
  pkt.az = a.acceleration.z;
  pkt.gx = g.gyro.x;
  pkt.gy = g.gyro.y;
  pkt.gz = g.gyro.z;

  // Debug print 
  Serial.printf("%lu,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f\n",
                pkt.t_ms, pkt.ax, pkt.ay, pkt.az, pkt.gx, pkt.gy, pkt.gz);

  // Notify only when connected
  if (deviceConnected) {
    pCharacteristic->setValue((uint8_t*)&pkt, sizeof(pkt)); // 28 bytes
    pCharacteristic->notify();
  }
}
