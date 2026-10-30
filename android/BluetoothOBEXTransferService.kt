package com.proxilink.offline

import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.util.Log
import java.io.*
import java.util.UUID
import kotlin.concurrent.thread

/**
 * BluetoothOBEXTransferService
 * Implements OBEX (Object Exchange) / OPP (Object Push Profile) protocol over Bluetooth Classic.
 * 
 * Provides:
 * 1. Standard OBEX Object Push Profile UUID (00001105-0000-1000-8000-00805F9B34FB)
 * 2. OBEX CONNECT (0x80), PUT (0x02/0x82), and DISCONNECT (0x81) header packet framing
 * 3. High-throughput file transfer without Wi-Fi router dependency
 */
class BluetoothOBEXTransferService {

    private val TAG = "ProxiLink_OBEX"

    // Standard Bluetooth SIG Object Push Profile (OPP) UUID
    private val OBEX_OPP_UUID: UUID = UUID.fromString("00001105-0000-1000-8000-00805F9B34FB")

    // OBEX Opcode Constants
    private val OBEX_CONNECT: Byte = 0x80.toByte()
    private val OBEX_DISCONNECT: Byte = 0x81.toByte()
    private val OBEX_PUT_FINAL: Byte = 0x82.toByte()
    private val OBEX_PUT_CONTINUE: Byte = 0x02.toByte()

    // OBEX Header IDs
    private val OBEX_HDR_NAME: Byte = 0x01.toByte()      // Unicode null-terminated file name
    private val OBEX_HDR_LENGTH: Byte = 0xC3.toByte()    // 4-byte big-endian file length
    private val OBEX_HDR_BODY: Byte = 0x48.toByte()      // Binary body chunk
    private val OBEX_HDR_END_OF_BODY: Byte = 0x49.toByte() // Final binary body chunk

    var onProgress: ((bytesSent: Long, totalBytes: Long, percent: Int) -> Unit)? = null
    var onComplete: ((file: File) -> Unit)? = null
    var onError: ((error: String) -> Unit)? = null

    /**
     * Send file to a paired Bluetooth device using native OBEX Object Push Profile.
     */
    fun pushFile(device: BluetoothDevice, file: File) {
        thread(start = true, name = "OBEX-Push-Thread") {
            var socket: BluetoothSocket? = null
            try {
                Log.d(TAG, "Creating OBEX RFCOMM socket to: ${device.name ?: device.address}")
                socket = device.createRfcommSocketToServiceRecord(OBEX_OPP_UUID)
                socket.connect()
                Log.d(TAG, "Connected to OBEX service. Initializing OBEX CONNECT handshake...")

                val input = socket.inputStream
                val output = socket.outputStream

                // 1. Send OBEX CONNECT Request Packet
                // Packet format: [Opcode (0x80), Length (7 bytes), OBEX Version (0x10), Flags (0), Max Packet Length (0x4000)]
                val connectPacket = byteArrayOf(
                    OBEX_CONNECT,
                    0x00, 0x07, // Total length = 7 bytes
                    0x10,       // OBEX Version 1.0
                    0x00,       // Flags
                    0x40, 0x00  // Max packet length = 16384 bytes
                )
                output.write(connectPacket)
                output.flush()

                // Read CONNECT Response (Expect 0xA0 Success)
                val response = ByteArray(256)
                val respLen = input.read(response)
                if (respLen < 3 || response[0] != 0xA0.toByte()) {
                    throw IOException("OBEX CONNECT rejected by target device (Code: ${response.getOrNull(0)})")
                }
                Log.d(TAG, "OBEX Handshake Successful. Pushing file: ${file.name} (${file.length()} bytes)")

                // 2. Stream File Body with OBEX PUT Packets
                val fis = FileInputStream(file)
                val totalLength = file.length()
                var totalSent: Long = 0
                val buffer = ByteArray(8192) // 8 KB OBEX chunks
                var bytesRead: Int

                while (fis.read(buffer).also { bytesRead = it } != -1) {
                    val isLast = (totalSent + bytesRead >= totalLength)
                    val opcode = if (isLast) OBEX_PUT_FINAL else OBEX_PUT_CONTINUE

                    // Frame OBEX PUT Packet: [Opcode, 2-byte Length, Headers...]
                    val bodyHeaderId = if (isLast) OBEX_HDR_END_OF_BODY else OBEX_HDR_BODY
                    val packetLength = 3 + (3 + bytesRead)

                    val packet = ByteArray(packetLength)
                    packet[0] = opcode
                    packet[1] = ((packetLength shr 8) and 0xFF).toByte()
                    packet[2] = (packetLength and 0xFF).toByte()

                    // Header: Body / End of Body
                    packet[3] = bodyHeaderId
                    packet[4] = (((bytesRead + 3) shr 8) and 0xFF).toByte()
                    packet[5] = ((bytesRead + 3) and 0xFF).toByte()

                    System.arraycopy(buffer, 0, packet, 6, bytesRead)

                    output.write(packet)
                    output.flush()

                    // Await OBEX CONTINUE (0x90) or SUCCESS (0xA0) response
                    val ackLen = input.read(response)
                    if (ackLen > 0 && response[0] != 0x90.toByte() && response[0] != 0xA0.toByte()) {
                        throw IOException("OBEX PUT transfer interrupted by remote peer.")
                    }

                    totalSent += bytesRead
                    val percent = ((totalSent * 100) / totalLength).toInt()
                    onProgress?.invoke(totalSent, totalLength, percent)
                }

                fis.close()

                // 3. Send OBEX DISCONNECT Packet
                val disconnectPacket = byteArrayOf(OBEX_DISCONNECT, 0x00, 0x03)
                output.write(disconnectPacket)
                output.flush()

                Log.d(TAG, "OBEX file transfer completed successfully: ${file.name}")
                onComplete?.invoke(file)

            } catch (e: Exception) {
                Log.e(TAG, "OBEX transfer failed: ${e.message}", e)
                onError?.invoke("OBEX Transfer Error: ${e.message}")
            } finally {
                try { socket?.close() } catch {}
            }
        }
    }
}
