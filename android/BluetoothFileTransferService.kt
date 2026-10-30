package com.proxilink.offline

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothServerSocket
import android.bluetooth.BluetoothSocket
import android.util.Log
import java.io.*
import java.util.UUID
import kotlin.concurrent.thread

/**
 * BluetoothFileTransferService
 * Provides Classic Bluetooth (RFCOMM) serial stream transfer for Android devices.
 * Overcomes Web Bluetooth browser restrictions to allow high-capacity binary transfers.
 */
class BluetoothFileTransferService {

    private val TAG = "ProxiLink_BTClassic"
    
    // Standard SPP (Serial Port Profile) UUID for RFCOMM serial connectivity
    private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private val bluetoothAdapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()

    var onProgressUpdate: ((bytesSent: Long, totalBytes: Long) -> Unit)? = null
    var onFileReceived: ((savedFile: File) -> Unit)? = null
    var onError: ((message: String) -> Unit)? = null

    /**
     * Listen for incoming RFCOMM connection from peer device.
     */
    fun startListeningServer(saveDirectory: File) {
        thread(start = true, name = "BT-RFCOMM-Server") {
            var serverSocket: BluetoothServerSocket? = null
            var socket: BluetoothSocket? = null

            try {
                serverSocket = bluetoothAdapter?.listenUsingRfcommWithServiceRecord("ProxiLink_RFCOMM", SPP_UUID)
                Log.d(TAG, "RFCOMM server waiting for incoming Bluetooth connection...")
                socket = serverSocket?.accept()

                if (socket != null) {
                    val dis = DataInputStream(BufferedInputStream(socket.inputStream))
                    val fileName = dis.readUTF()
                    val fileSize = dis.readLong()

                    val outputFile = File(saveDirectory, fileName)
                    val fos = FileOutputStream(outputFile)
                    val buffer = ByteArray(16 * 1024)
                    var bytesRead: Int
                    var totalRead: Long = 0

                    while (totalRead < fileSize && dis.read(buffer).also { bytesRead = it } != -1) {
                        fos.write(buffer, 0, bytesRead)
                        totalRead += bytesRead
                        onProgressUpdate?.invoke(totalRead, fileSize)
                    }

                    fos.flush()
                    fos.close()
                    onFileReceived?.invoke(outputFile)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Bluetooth RFCOMM receive error: ${e.message}", e)
                onError?.invoke("BT receive error: ${e.message}")
            } finally {
                try { socket?.close() } catch {}
                try { serverSocket?.close() } catch {}
            }
        }
    }

    /**
     * Connect to remote Bluetooth device and stream file over RFCOMM socket.
     */
    fun sendFile(device: BluetoothDevice, file: File) {
        thread(start = true, name = "BT-RFCOMM-Sender") {
            var socket: BluetoothSocket? = null
            try {
                // Cancel discovery prior to connecting for optimal connection speed
                bluetoothAdapter?.cancelDiscovery()

                socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
                socket.connect()
                Log.d(TAG, "RFCOMM socket connected to ${device.name ?: device.address}")

                val dos = DataOutputStream(BufferedOutputStream(socket.outputStream))
                dos.writeUTF(file.name)
                dos.writeLong(file.length())

                val fis = FileInputStream(file)
                val buffer = ByteArray(16 * 1024)
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
                Log.d(TAG, "Bluetooth file transfer complete: ${file.name}")
            } catch (e: Exception) {
                Log.e(TAG, "Bluetooth send error: ${e.message}", e)
                onError?.invoke("BT send error: ${e.message}")
            } finally {
                try { socket?.close() } catch {}
            }
        }
    }
}
