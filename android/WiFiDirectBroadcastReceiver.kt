package com.proxilink.offline

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.NetworkInfo
import android.net.wifi.p2p.WifiP2pDevice
import android.net.wifi.p2p.WifiP2pManager
import android.util.Log

/**
 * WiFiDirectBroadcastReceiver
 * Listens to system Wi-Fi P2P broadcast intents:
 * 1. WIFI_P2P_STATE_CHANGED_ACTION (Wi-Fi P2P enabled/disabled)
 * 2. WIFI_P2P_PEERS_CHANGED_ACTION (Discovered peers list changed)
 * 3. WIFI_P2P_CONNECTION_CHANGED_ACTION (Connection status changed)
 * 4. WIFI_P2P_THIS_DEVICE_CHANGED_ACTION (Local device details changed)
 */
class WiFiDirectBroadcastReceiver(
    private val manager: WifiP2pManager,
    private val channel: WifiP2pManager.Channel,
    private val listener: WiFiDirectEventsListener
) : BroadcastReceiver() {

    private val TAG = "ProxiLink_WiFiDirectBR"

    interface WiFiDirectEventsListener {
        fun onP2pStateChanged(enabled: Boolean)
        fun onPeersAvailable(peers: List<WifiP2pDevice>)
        fun onConnectionChanged(connected: Boolean)
        fun onThisDeviceChanged(device: WifiP2pDevice)
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION -> {
                val state = intent.getIntExtra(WifiP2pManager.EXTRA_WIFI_STATE, -1)
                val isP2pEnabled = state == WifiP2pManager.WIFI_P2P_STATE_ENABLED
                Log.d(TAG, "Wi-Fi P2P State Changed: Enabled = $isP2pEnabled")
                listener.onP2pStateChanged(isP2pEnabled)
            }

            WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION -> {
                Log.d(TAG, "Wi-Fi P2P Peers Changed. Requesting updated peer list...")
                manager.requestPeers(channel) { peerList ->
                    listener.onPeersAvailable(peerList.deviceList.toList())
                }
            }

            WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION -> {
                val networkInfo = intent.getParcelableExtra<NetworkInfo>(WifiP2pManager.EXTRA_NETWORK_INFO)
                val isConnected = networkInfo?.isConnected == true
                Log.d(TAG, "Wi-Fi P2P Connection State: Connected = $isConnected")
                listener.onConnectionChanged(isConnected)
            }

            WifiP2pManager.WIFI_P2P_THIS_DEVICE_CHANGED_ACTION -> {
                val device = intent.getParcelableExtra<WifiP2pDevice>(WifiP2pManager.EXTRA_DEVICE)
                if (device != null) {
                    Log.d(TAG, "Local Wi-Fi P2P Device: ${device.deviceName} (${device.deviceAddress})")
                    listener.onThisDeviceChanged(device)
                }
            }
        }
    }
}
