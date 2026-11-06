package mw.yourcompany.smartinventory;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.pm.PackageManager;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(name = "Printer")
public class PrinterPlugin extends Plugin {
    private static final int REQUEST_BLUETOOTH_PERMISSIONS = 4101;
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private BluetoothSocket socket;
    private OutputStream outputStream;

    @PluginMethod
    public void listPairedPrinters(PluginCall call) {
        if (!ensureBluetoothPermission(call)) return;

        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            call.reject("Bluetooth is not available on this device.");
            return;
        }

        JSArray printers = new JSArray();
        Set<BluetoothDevice> bondedDevices = adapter.getBondedDevices();
        for (BluetoothDevice device : bondedDevices) {
            JSObject printer = new JSObject();
            printer.put("name", device.getName() == null ? "Bluetooth printer" : device.getName());
            printer.put("address", device.getAddress());
            printers.put(printer);
        }

        JSObject result = new JSObject();
        result.put("printers", printers);
        call.resolve(result);
    }

    @PluginMethod
    public void connect(PluginCall call) {
        if (!ensureBluetoothPermission(call)) return;

        String address = call.getString("address", "");
        if (address.isEmpty()) {
            call.reject("A Bluetooth printer address is required.");
            return;
        }

        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            call.reject("Bluetooth is not available on this device.");
            return;
        }

        getActivity().runOnUiThread(() -> new Thread(() -> {
            try {
                closeConnection();
                BluetoothDevice device = adapter.getRemoteDevice(address);
                BluetoothSocket newSocket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                adapter.cancelDiscovery();
                newSocket.connect();
                socket = newSocket;
                outputStream = newSocket.getOutputStream();
                call.resolve();
            } catch (Exception error) {
                closeConnection();
                call.reject("Could not connect to printer: " + error.getMessage());
            }
        }).start());
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        closeConnection();
        call.resolve();
    }

    @PluginMethod
    public void printText(PluginCall call) {
        String text = call.getString("text", "");
        if (text.isEmpty()) {
            call.reject("Text to print is required.");
            return;
        }
        if (outputStream == null) {
            call.reject("No printer is connected.");
            return;
        }

        new Thread(() -> {
            try {
                outputStream.write(new byte[]{0x1B, 0x40});
                outputStream.write(text.getBytes(StandardCharsets.UTF_8));
                outputStream.write(new byte[]{0x0A, 0x0A, 0x0A});
                outputStream.flush();
                call.resolve();
            } catch (IOException error) {
                closeConnection();
                call.reject("Could not print receipt: " + error.getMessage());
            }
        }).start();
    }

    private boolean ensureBluetoothPermission(PluginCall call) {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.S) return true;
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT)
            == PackageManager.PERMISSION_GRANTED) {
            return true;
        }
        ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.BLUETOOTH_CONNECT}, REQUEST_BLUETOOTH_PERMISSIONS);
        call.reject("Bluetooth permission is required. Try again after granting permission.");
        return false;
    }

    private synchronized void closeConnection() {
        try {
            if (outputStream != null) outputStream.close();
        } catch (IOException ignored) {
            // Connection is being closed.
        }
        try {
            if (socket != null) socket.close();
        } catch (IOException ignored) {
            // Connection is being closed.
        }
        outputStream = null;
        socket = null;
    }
}