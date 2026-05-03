import ExpoModulesCore
import CoreBluetooth

private let kServiceUUID = CBUUID(string: "F000DE10-0000-4000-8000-00805F9B34FB")!
private let kCharUUID = CBUUID(string: "F000DE11-0000-4000-8000-00805F9B34FB")!

private final class DeckdPeripheralHost: NSObject, CBPeripheralManagerDelegate {
  var peripheral: CBPeripheralManager?
  var mutableService: CBMutableService?
  var dataCharacteristic: CBMutableCharacteristic?
  var pendingAdvertiseData: [String: Any]?
  var startCompletion: ((Error?) -> Void)?
  var onWrite: ((Data) -> Void)?
  var pendingNotifyData: Data?
  var subscribedCentrals: [CBCentral] = []

  func ensureManager() {
    if peripheral == nil {
      peripheral = CBPeripheralManager(delegate: self, queue: .main)
    }
  }

  func buildService() -> CBMutableService {
    let props: CBCharacteristicProperties = [.read, .write, .notify]
    let perms: CBAttributePermissions = [.readable, .writeable]
    let ch = CBMutableCharacteristic(
      type: kCharUUID,
      properties: props,
      value: nil,
      permissions: perms
    )
    dataCharacteristic = ch
    let svc = CBMutableService(type: kServiceUUID, primary: true)
    svc.characteristics = [ch]
    return svc
  }

  func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
    if peripheral.state == .poweredOn, pendingAdvertiseData != nil, startCompletion != nil {
      mutableService = buildService()
      peripheral.removeAllServices()
      peripheral.add(mutableService!)
    }
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
    guard let completion = startCompletion else { return }
    if let error = error {
      startCompletion = nil
      pendingAdvertiseData = nil
      completion(error)
      return
    }
    guard let data = pendingAdvertiseData else {
      return
    }
    peripheral.startAdvertising(data)
    startCompletion = nil
    pendingAdvertiseData = nil
    completion(nil)
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
    for request in requests {
      guard request.characteristic.uuid == kCharUUID else {
        peripheral.respond(to: request, withResult: .attributeNotFound)
        continue
      }
      if let value = request.value, !value.isEmpty {
        onWrite?(value)
      }
      peripheral.respond(to: request, withResult: .success)
    }
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didSubscribeTo characteristic: CBCharacteristic) {
    if characteristic.uuid == kCharUUID {
      if !subscribedCentrals.contains(where: { $0.identifier == central.identifier }) {
        subscribedCentrals.append(central)
      }
    }
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didUnsubscribeFrom characteristic: CBCharacteristic) {
    subscribedCentrals.removeAll { $0.identifier == central.identifier }
  }

  func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
    if let data = pendingNotifyData {
      pendingNotifyData = nil
      _ = pushNotify(data)
    }
  }

  /// Returns false if queue full — caller should retry after `peripheralManagerIsReady`.
  func pushNotify(_ data: Data) -> Bool {
    guard let pm = peripheral, let ch = dataCharacteristic else { return false }
    if subscribedCentrals.isEmpty { return true }
    let ok = pm.updateValue(data, for: ch, onSubscribedCentrals: nil)
    if !ok {
      pendingNotifyData = data
    }
    return ok
  }

  func startAdvertising(localName: String, completion: @escaping (Error?) -> Void) {
    ensureManager()
    guard let pm = peripheral else {
      completion(NSError(domain: "DeckdBle", code: 1, userInfo: [NSLocalizedDescriptionKey: "No peripheral manager"]))
      return
    }
    let data: [String: Any] = [
      CBAdvertisementDataLocalNameKey: localName,
      CBAdvertisementDataServiceUUIDsKey: [kServiceUUID]
    ]
    pendingAdvertiseData = data
    startCompletion = completion

    switch pm.state {
    case .poweredOn:
      mutableService = buildService()
      pm.removeAllServices()
      pm.add(mutableService!)
    case .poweredOff, .resetting, .unauthorized, .unsupported:
      startCompletion = nil
      pendingAdvertiseData = nil
      completion(NSError(domain: "DeckdBle", code: 2, userInfo: [NSLocalizedDescriptionKey: "Bluetooth not available"]))
    default:
      break
    }
  }

  func stopAdvertising() {
    peripheral?.stopAdvertising()
    peripheral?.removeAllServices()
    mutableService = nil
    dataCharacteristic = nil
    pendingAdvertiseData = nil
    startCompletion = nil
    subscribedCentrals = []
    pendingNotifyData = nil
  }

  var advertising: Bool {
    peripheral?.isAdvertising ?? false
  }
}

public class DeckdBleModule: Module {
  private let host = DeckdPeripheralHost()

  public func definition() -> ModuleDefinition {
    Name("DeckdBle")

    Events("onPeripheralWrite")

    Constant("SERVICE_UUID") { "F000DE10-0000-4000-8000-00805F9B34FB" }
    Constant("CHARACTERISTIC_UUID") { "F000DE11-0000-4000-8000-00805F9B34FB" }

    AsyncFunction("startAdvertising") { (localName: String, promise: Promise) in
      self.host.onWrite = { [weak self] data in
        self?.sendEvent(
          "onPeripheralWrite",
          [
            "base64": data.base64EncodedString()
          ]
        )
      }
      self.host.startAdvertising(localName: localName) { err in
        if let err = err {
          promise.reject("E_BLE_ADV", err.localizedDescription, err)
        } else {
          promise.resolve(localName)
        }
      }
    }

    AsyncFunction("stopAdvertising") { (promise: Promise) in
      self.host.onWrite = nil
      self.host.stopAdvertising()
      promise.resolve(nil)
    }

    AsyncFunction("notifySubscribers") { (base64: String, promise: Promise) in
      guard let data = Data(base64Encoded: base64) else {
        promise.reject("E_BLE_NOTIFY", "Invalid base64", nil)
        return
      }
      let ok = self.host.pushNotify(data)
      promise.resolve(ok)
    }

    Function("isAdvertising") { () -> Bool in
      self.host.advertising
    }
  }
}
