#include <Wire.h>
#include "DFRobot_OxygenSensor.h"
#include <BLEDevice.h>
#include <BLE2902.h>
#include <BLEServer.h>
#include <BLEUtils.h>

#define DEVICE_NAME         "GISELA BLE"
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define Oxygen_IICAddress ADDRESS_3   // Default 0x73
#define COLLECT_NUMBER   10           // Number of samples to average

DFRobot_OxygenSensor oxygen;

BLECharacteristic *pCharacteristic;
String message = "";


class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      Serial.println("BLE client connected.");
    };

    void onDisconnect(BLEServer* pServer) {
      BLEDevice::startAdvertising();
    }
};

class MyCharacteristicCallbacks: public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) {
    message = String(characteristic->getValue().c_str());
     Serial.println("Received:\n" + message);
  pCharacteristic->setValue(message.c_str());
  }
};

void setup() {
  Serial.begin(115200);        
  delay(100); 
  Serial.println("Starting BLE!");
  Wire.begin(8, 9); // SDA=8, SCL=9
  delay(500);

  Serial.println("Initializing Oxygen Sensor...");

  if (!oxygen.begin(Oxygen_IICAddress)) {
    Serial.println("Oxygen sensor not found. Check wiring and I2C address...");
    while (1);
  }

  Serial.println("Oxygen sensor connected successfully!");

  BLEDevice::init(DEVICE_NAME);

  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE
  );
  pCharacteristic->setCallbacks(new MyCharacteristicCallbacks());
  pCharacteristic->setValue("Init");
  pCharacteristic->addDescriptor(new BLE2902());

  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  BLEDevice::startAdvertising();
}

void loop() {
  float o2 = oxygen.getOxygenData(COLLECT_NUMBER);
  pCharacteristic->setValue(std::to_string(o2).c_str());
  pCharacteristic->notify();
  Serial.print("Oxygen concentration: ");
  Serial.print(o2);
  Serial.println(" %");
  delay(1000);

}