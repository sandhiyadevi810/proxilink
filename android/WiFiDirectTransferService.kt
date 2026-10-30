package com.proxilink.offline

import android.content.Context
import android.net.wifi.p2p.*
import android.os.Looper
import android.util.Log
import java.io.*
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

/**
 * WiFiDirectTransferService
 * Handles high-speed Wi-Fi Direct (P2P) peer discovery, socket binding,
 * and binary file stream transmission without an external Wi-Fi router.
 */
class WiFiDirectTransferService(private val context: Context) {

    private val TAG = "ProxiLink_WiFiDirect"
    private val PORT = 8888
    private val manager: WifiP2pManager? = context.getSystemService(Context.WIFI_P2P_SERVICE) as? WifiP2pManager
    private val channel: WifiP2pManager.Channel? = manager?.initialize(context, Looper.getMainLooper(), null)

    var onProgressUpdate: ((bytesSent: Long, totalBytes: Long) -> Unit)? = null
    var onFileReceived: ((savedFile: File) -> Unit)? = null
    var onError: ((message: String) -> Unit)? = null

    /**
     * Start discovering nearby Wi-Fi Direct enabled devices.
     */
    fun discoverPeers(onPeersFound: (List<WifiP2pDevice>) -> Unit) {
        manager?.discoverPeers(channel, object : WifiP2pManager.ActionListener {
            override fun onSuccess() {
                Log.d(TAG, "Wi-Fi Direct peer discovery initiated.")
                manager.requestPeers(channel) { peerList ->
                    onPeersFound(peerList.deviceList.toList())
                }
            }

            override fun onFailure(reasonCode: Int) {
                Log.e(TAG, "Peer discovery failed. Reason: $reasonCode")
                onError?.invoke("Peer discovery failed: code $reasonCode")
            }
        })
    }

    /**
     * Connect to a target Wi-Fi Direct peer.
     */
    fun connectToDevice(device: WifiP2pDevice, onConnected: (WifiP2pInfo) -> Unit) {
        val config = WifiP2pConfig().apply {
            deviceAddress = device.deviceAddress
        }

        manager?.connect(channel, config, object : WifiP2pManager.ActionListener {
            override fun onSuccess() {
                Log.d(TAG, "Connecting to ${device.deviceName}...")
                manager.requestConnectionInfo(channel) { info ->
                    onConnected(info)
                }
            }

            override fun onFailure(reason: Int) {
                onError?.invoke("Connection failed: $reason")
            }
        })
    }

    /**
     * Server socket: listen for incoming files from sender peer.
     */
    fun startReceivingServer(saveDirectory: File) {
        thread(start = true, name = "WiFiDirect-Receiver") {
            try {
                val serverSocket = ServerSocket(PORT)
                Log.d(TAG, "Server socket open on port $PORT. Waiting for incoming connection...")
                val client = serverSocket.accept()

                val dis = DataInputStream(BufferedInputStream(client.getInputStream()))
                val fileName = dis.readUTF()
                val fileSize = dis.readLong()

                val outputFile = File(saveDirectory, fileName)
                val fos = FileOutputStream(outputFile)
                val buffer = ByteArray(64 * 1024)
                var bytesRead: Int
                var totalRead: Long = 0

                while (totalRead < fileSize && dis.read(buffer).also { bytesRead = it } != -1) {
                    fos.write(buffer, 0, bytesRead)
                    totalRead += bytesRead
                    onProgressUpdate?.invoke(totalRead, fileSize)
                }

                fos.flush()
                fos.close()
                serverSocket.close()

                Log.d(TAG, "File received successfully: ${outputFile.absolutePath}")
                onFileReceived?.invoke(outputFile)

            } catch (e: Exception) {
                Log.e(TAG, "Receiving error: ${e.message}", e)
                onError?.invoke("Receiving error: ${e.message}")
            }
        }
    }

    /**
     * Client socket: send binary file to target group owner IP.
     */
    fun sendFile(hostAddress: String, file: File) {
        thread(start = true, name = "WiFiDirect-Sender") {
            try {
                val socket = Socket()
                socket.bind(null)
                socket.connect(InetSocketAddress(hostAddress, PORT), 10000)

                val dos = DataOutputStream(BufferedOutputStream(socket.getOutputStream()))
                dos.writeUTF(file.name)
                dos.writeLong(file.length())

                val fis = FileInputStream(file)
                val buffer = ByteArray(64 * 1024)
                var bytesRead: Int
                var totalSent: Long = 0
                val totalLength = file.length()

                while (fis.read(buffer).also { bytesRead = it } != -1) {
                    dos.write(buffer, 0, bytesRead)
                    totalSent += bytesRead
                    onProgressUpdate?.invoke(totalSent, totalLength)
                }

                dos.flush()
                dos.close()
                fis.close()
                socket.close()

                Log.d(TAG, "File sent successfully: ${file.name}")
            } catch (e: Exception) {
                Log.e(TAG, "Send error: ${e.message}", e)
                onError?.invoke("Send error: ${e.message}")
            }
        }
    }
}
