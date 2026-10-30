# ProxiLink – Native Android Wireless Communication Module

## Architecture Overview
Web browsers have inherent sandbox limitations that prevent access to:
1. **Wi-Fi Direct (Wi-Fi P2P / 802.11z)**: Requires low-level OS radio control via `android.net.wifi.p2p.WifiP2pManager`.
2. **Bluetooth Classic RFCOMM / OBEX**: Web Bluetooth only supports Bluetooth Low Energy (BLE) GATT client mode with ~512 byte MTUs. High-speed file sharing requires classic Bluetooth sockets via `BluetoothSocket` and `BluetoothServerSocket` with the standard Serial Port Profile (SPP) UUID.

To support true zero-network ad-hoc wireless communication between mobile devices, ProxiLink provides these native Android services that can either run standalone or integrate into a WebView hybrid app via JavaScript interface bridge (`@JavascriptInterface`).

---

## Required Android Permissions (`AndroidManifest.xml`)

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.proxilink.offline">

    <!-- Wi-Fi Direct Permissions -->
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    <uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES" 
                     android:usesPermissionFlags="neverForLocation" />

    <!-- Bluetooth Classic & BLE Permissions (Android 12+) -->
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" 
                     android:usesPermissionFlags="neverForLocation" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />

    <!-- Storage Access for File Transfer -->
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" 
                     android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
</manifest>
```

---

## Android Source Files Included in this Folder
1. `WiFiDirectTransferService.kt`: Peer discovery, group creation, TCP server/client socket stream for files up to 500 MB.
2. `WiFiDirectBroadcastReceiver.kt`: System broadcast receiver for P2P state changes, peer discovery events, and connection status.
3. `BluetoothFileTransferService.kt`: Classic Bluetooth RFCOMM server/client socket transfer with stream chunking.
4. `BluetoothOBEXTransferService.kt`: Native Bluetooth OBEX / OPP (Object Push Profile) file transfer engine.

