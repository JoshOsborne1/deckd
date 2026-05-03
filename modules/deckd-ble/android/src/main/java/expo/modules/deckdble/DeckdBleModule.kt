package expo.modules.deckdble

import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

private val SERVICE_UUID: UUID = UUID.fromString("F000DE10-0000-4000-8000-00805F9B34FB")
private val CHAR_UUID: UUID = UUID.fromString("F000DE11-0000-4000-8000-00805F9B34FB")
private val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

class DeckdBleModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No React context")

  private val mainHandler = Handler(Looper.getMainLooper())

  private var gattServer: BluetoothGattServer? = null
  private var deckdCharacteristic: BluetoothGattCharacteristic? = null
  private var advertiser: BluetoothLeAdvertiser? = null
  private var advertising = false
  private var pendingAdvertisePromise: Promise? = null
  private var pendingLocalName: String = ""

  private val connectedDevices = mutableSetOf<String>()

  private val advertiseCallback =
    object : AdvertiseCallback() {
      override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
        advertising = true
        val p = pendingAdvertisePromise
        pendingAdvertisePromise = null
        p?.resolve(pendingLocalName)
      }

      override fun onStartFailure(errorCode: Int) {
        advertising = false
        val p = pendingAdvertisePromise
        pendingAdvertisePromise = null
        p?.reject("E_BLE_ADV", "Advertise failed: $errorCode", null)
      }
    }

  private val gattCallback =
    object : BluetoothGattServerCallback() {
      override fun onConnectionStateChange(
        device: BluetoothDevice?,
        status: Int,
        newState: Int,
      ) {
        val addr = device?.address ?: return
        if (newState == BluetoothGatt.STATE_CONNECTED) {
          connectedDevices.add(addr)
        } else {
          connectedDevices.remove(addr)
        }
      }

      override fun onCharacteristicWriteRequest(
        device: BluetoothDevice?,
        requestId: Int,
        characteristic: BluetoothGattCharacteristic?,
        preparedWrite: Boolean,
        responseNeeded: Boolean,
        offset: Int,
        value: ByteArray?,
      ) {
        if (characteristic?.uuid == CHAR_UUID && value != null && value.isNotEmpty()) {
          val b64 = Base64.encodeToString(value, Base64.NO_WRAP)
          sendEvent("onPeripheralWrite", mapOf("base64" to b64))
        }
        if (responseNeeded && device != null) {
          gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
        }
      }
    }

  private fun adapter() =
    (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter

  private fun startLeAdvertiseInternal() {
    val ad = adapter()
    if (ad == null || !ad.isEnabled) {
      val p = pendingAdvertisePromise
      pendingAdvertisePromise = null
      p?.reject("E_BLE", "Bluetooth off or unavailable", null)
      return
    }
    advertiser = ad.bluetoothLeAdvertiser
    val adv = advertiser
    if (adv == null) {
      val p = pendingAdvertisePromise
      pendingAdvertisePromise = null
      p?.reject("E_BLE", "LE advertiser unavailable", null)
      return
    }

    val settings =
      AdvertiseSettings.Builder()
        .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
        .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
        .setConnectable(true)
        .build()

    val data =
      AdvertiseData.Builder()
        .setIncludeDeviceName(true)
        .addServiceUuid(ParcelUuid(SERVICE_UUID))
        .build()

    val scanResponse =
      AdvertiseData.Builder()
        .setIncludeDeviceName(false)
        .build()

    try {
      adv.startAdvertising(settings, data, scanResponse, advertiseCallback)
    } catch (e: Exception) {
      advertising = false
      val p = pendingAdvertisePromise
      pendingAdvertisePromise = null
      p?.reject("E_BLE_ADV", e.message ?: "startAdvertising threw", e)
    }
  }

  override fun definition() =
    ModuleDefinition {
      Name("DeckdBle")

      Events("onPeripheralWrite")

      Constant("SERVICE_UUID") { "F000DE10-0000-4000-8000-00805F9B34FB" }
      Constant("CHARACTERISTIC_UUID") { "F000DE11-0000-4000-8000-00805F9B34FB" }

      AsyncFunction("startAdvertising") { localName: String, promise: Promise ->
        pendingAdvertisePromise = promise
        pendingLocalName = localName

        val ad = adapter()
        if (ad == null || !ad.isEnabled) {
          pendingAdvertisePromise = null
          promise.reject("E_BLE", "Bluetooth off or unavailable", null)
          return@AsyncFunction
        }

        try {
          ad.name = localName
        } catch (_: SecurityException) {
        }

        val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        try {
          gattServer?.close()
        } catch (_: Exception) {
        }
        connectedDevices.clear()
        gattServer = bluetoothManager.openGattServer(context, gattCallback)
        if (gattServer == null) {
          pendingAdvertisePromise = null
          promise.reject("E_BLE_GATT", "openGattServer returned null", null)
          return@AsyncFunction
        }

        val ch =
          BluetoothGattCharacteristic(
            CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_READ or
              BluetoothGattCharacteristic.PROPERTY_WRITE or
              BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_READ or BluetoothGattCharacteristic.PERMISSION_WRITE,
          )
        val cccd =
          BluetoothGattDescriptor(
            CCCD_UUID,
            BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE,
          )
        ch.addDescriptor(cccd)
        deckdCharacteristic = ch

        val svc =
          BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        svc.addCharacteristic(ch)

        val ok = gattServer?.addService(svc) ?: false
        if (!ok) {
          try {
            gattServer?.close()
          } catch (_: Exception) {
          }
          gattServer = null
          deckdCharacteristic = null
          pendingAdvertisePromise = null
          promise.reject("E_BLE_GATT", "addService returned false", null)
          return@AsyncFunction
        }

        mainHandler.postDelayed(
          {
            startLeAdvertiseInternal()
          },
          80,
        )
      }

      AsyncFunction("notifySubscribers") { base64: String, promise: Promise ->
        val raw = try {
          Base64.decode(base64, Base64.DEFAULT)
        } catch (_: Exception) {
          promise.reject("E_BLE_NOTIFY", "Invalid base64", null)
          return@AsyncFunction
        }
        val ch = deckdCharacteristic
        val server = gattServer
        if (ch == null || server == null) {
          promise.resolve(false)
          return@AsyncFunction
        }
        ch.value = raw
        var any = false
        for (addr in connectedDevices) {
          val dev = adapter()?.getRemoteDevice(addr) ?: continue
          try {
            any = server.notifyCharacteristicChanged(dev, ch, false) || any
          } catch (_: Exception) {
          }
        }
        promise.resolve(any)
      }

      AsyncFunction("stopAdvertising") { promise: Promise ->
        try {
          advertiser?.stopAdvertising(advertiseCallback)
        } catch (_: Exception) {
        }
        advertiser = null
        advertising = false
        deckdCharacteristic = null
        connectedDevices.clear()
        try {
          gattServer?.close()
        } catch (_: Exception) {
        }
        gattServer = null
        promise.resolve(null)
      }

      Function("isAdvertising") {
        this@DeckdBleModule.advertising
      }
    }
}
