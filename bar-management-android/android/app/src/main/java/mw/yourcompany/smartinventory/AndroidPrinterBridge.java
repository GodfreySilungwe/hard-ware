package mw.yourcompany.smartinventory;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import androidx.core.content.ContextCompat;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class AndroidPrinterBridge {
    private static final long SCAN_TIMEOUT_MS = 15000;
    private static final int DEFAULT_BLE_PAYLOAD_SIZE = 20;
    private static final int MAX_BLE_PAYLOAD_SIZE = 182;
    private static final int REQUESTED_MTU = MAX_BLE_PAYLOAD_SIZE + 3;
    private static final long NO_RESPONSE_WRITE_INTERVAL_MS = 20;
    private static final long PRINTER_DRAIN_DELAY_MS = 750;
    private static final int PRINTER_WIDTH_DOTS = 384;
    private final Activity activity;
    private final Context context;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Map<String, BleCandidate> discoveredDevices = new LinkedHashMap<>();
    private BluetoothLeScanner scanner;
    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic writeCharacteristic;
    private int blePayloadSize = DEFAULT_BLE_PAYLOAD_SIZE;
    private int pendingChunkLength;
    private boolean writeWithResponse;
    private byte[] printData;
    private int printOffset;
    private boolean printInProgress;
    private final Runnable scanTimeout = this::showDeviceChooser;

    public AndroidPrinterBridge(Context context) {
        this.activity = (Activity) context;
        this.context = context.getApplicationContext();
    }

    @JavascriptInterface
    public String printText(String text) {
        if (!hasBluetoothPermissions()) {
            return "error: Bluetooth permission is required";
        }

        if (text == null || text.trim().isEmpty()) {
            return "error: Receipt text is empty";
        }

        BluetoothManager manager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
        if (adapter == null) {
            return "error: Bluetooth is not available on this device";
        }
        if (!adapter.isEnabled()) {
            return "error: Turn on Bluetooth, then try again";
        }

        byte[] receipt = text.getBytes(StandardCharsets.UTF_8);
        byte[] textData = new byte[receipt.length + 5];
        textData[0] = 0x1B;
        textData[1] = 0x40;
        System.arraycopy(receipt, 0, textData, 2, receipt.length);
        textData[receipt.length + 2] = 0x0A;
        textData[receipt.length + 3] = 0x0A;
        textData[receipt.length + 4] = 0x0A;
        return queuePrint(adapter, textData);
    }

    @JavascriptInterface
    public String printImage(String encodedPng) {
        if (!hasBluetoothPermissions()) {
            return "error: Bluetooth permission is required";
        }
        if (encodedPng == null || encodedPng.isEmpty() || encodedPng.length() > 12 * 1024 * 1024) {
            return "error: Receipt image is empty or too large";
        }

        BluetoothManager manager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
        if (adapter == null) return "error: Bluetooth is not available on this device";
        if (!adapter.isEnabled()) return "error: Turn on Bluetooth, then try again";

        Bitmap source = null;
        try {
            byte[] pngBytes = Base64.decode(encodedPng, Base64.DEFAULT);
            source = BitmapFactory.decodeByteArray(pngBytes, 0, pngBytes.length);
            if (source == null) return "error: Could not decode receipt image";
            return queuePrint(adapter, createEscPosRaster(source));
        } catch (IllegalArgumentException error) {
            return "error: Could not decode receipt image";
        } catch (IllegalStateException error) {
            return "error: " + error.getMessage();
        } finally {
            if (source != null && !source.isRecycled()) source.recycle();
        }
    }

    private String queuePrint(BluetoothAdapter adapter, byte[] payload) {
        synchronized (this) {
            if (printInProgress) return "error: A printer operation is already in progress";
            printInProgress = true;
        }
        printData = payload;
        printOffset = 0;
        pendingChunkLength = 0;
        mainHandler.post(() -> startBleScan(adapter));
        return "printed";
    }

    private byte[] createEscPosRaster(Bitmap source) {
        int height = Math.max(1, Math.round((float) source.getHeight() * PRINTER_WIDTH_DOTS / source.getWidth()));
        if (height > 0xFFFF) throw new IllegalStateException("Receipt image is too tall to print");

        Bitmap scaled = Bitmap.createScaledBitmap(source, PRINTER_WIDTH_DOTS, height, true);
        int bytesPerRow = (PRINTER_WIDTH_DOTS + 7) / 8;
        byte[] raster = new byte[8 + (bytesPerRow * height) + 5];
        raster[0] = 0x1D;
        raster[1] = 0x76;
        raster[2] = 0x30;
        raster[3] = 0x00;
        raster[4] = (byte) (bytesPerRow & 0xFF);
        raster[5] = (byte) ((bytesPerRow >> 8) & 0xFF);
        raster[6] = (byte) (height & 0xFF);
        raster[7] = (byte) ((height >> 8) & 0xFF);

        int[] pixels = new int[PRINTER_WIDTH_DOTS];
        for (int row = 0; row < height; row++) {
            scaled.getPixels(pixels, 0, PRINTER_WIDTH_DOTS, 0, row, PRINTER_WIDTH_DOTS, 1);
            for (int column = 0; column < PRINTER_WIDTH_DOTS; column++) {
                int pixel = pixels[column];
                int luminance = (Color.red(pixel) * 299 + Color.green(pixel) * 587 + Color.blue(pixel) * 114) / 1000;
                if (luminance < 180) {
                    int byteIndex = 8 + row * bytesPerRow + (column / 8);
                    raster[byteIndex] |= (byte) (0x80 >> (column % 8));
                }
            }
        }

        int feedOffset = raster.length - 5;
        raster[feedOffset] = 0x1B;
        raster[feedOffset + 1] = 0x64;
        raster[feedOffset + 2] = 0x03;
        raster[feedOffset + 3] = 0x0A;
        raster[feedOffset + 4] = 0x0A;
        if (scaled != source) scaled.recycle();
        return raster;
    }

    private boolean hasBluetoothPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN)
                    == PackageManager.PERMISSION_GRANTED
                && ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT)
                    == PackageManager.PERMISSION_GRANTED;
        }
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M
            || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void startBleScan(BluetoothAdapter adapter) {
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            finishPrint("BLE scanning is unavailable. Check that Bluetooth is turned on.");
            return;
        }

        try {
            discoveredDevices.clear();
            scanner.startScan(null, new ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build(), scanCallback);
            mainHandler.postDelayed(scanTimeout, SCAN_TIMEOUT_MS);
            showToast("Scanning for nearby Bluetooth LE devices...");
        } catch (SecurityException error) {
            finishPrint("Bluetooth scan permission is missing. Allow Nearby devices and try again.");
        }
    }

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            BluetoothDevice device = result.getDevice();
            String name = result.getScanRecord() == null ? null : result.getScanRecord().getDeviceName();
            if (name == null || name.trim().isEmpty()) name = device.getName();
            final String deviceName = name;
            mainHandler.post(() -> discoveredDevices.put(
                device.getAddress(),
                new BleCandidate(device, deviceName, result.getRssi())
            ));
        }

        @Override
        public void onScanFailed(int errorCode) {
            finishPrint("BLE printer scan failed (" + errorCode + ").");
        }
    };

    private void showDeviceChooser() {
        stopScan();
        if (discoveredDevices.isEmpty()) {
            finishPrint("No Bluetooth LE devices found. Make sure the printer is on and nearby.");
            return;
        }

        List<BleCandidate> candidates = new ArrayList<>(discoveredDevices.values());
        candidates.sort(Comparator.comparingInt((BleCandidate candidate) -> candidate.rssi).reversed());
        String[] labels = new String[candidates.size()];
        for (int index = 0; index < candidates.size(); index++) {
            BleCandidate candidate = candidates.get(index);
            String name = candidate.name == null || candidate.name.trim().isEmpty()
                ? "Unnamed BLE device" : candidate.name.trim();
            labels[index] = name + "  |  " + candidate.device.getAddress()
                + "  |  " + candidate.rssi + " dBm";
        }

        if (activity.isFinishing() || activity.isDestroyed()) {
            finishPrint("Could not show the Bluetooth device list.");
            return;
        }

        new AlertDialog.Builder(activity)
            .setTitle("Choose a printer")
            .setItems(labels, (dialog, selectedIndex) -> connectTo(candidates.get(selectedIndex)))
            .setNegativeButton("Cancel", (dialog, which) -> finishPrint("Printing cancelled."))
            .setOnCancelListener(dialog -> finishPrint("Printing cancelled."))
            .show();
    }

    private void connectTo(BleCandidate candidate) {
        try {
            showToast("Connecting to " + (candidate.name == null ? "Bluetooth device" : candidate.name) + "...");
            gatt = candidate.device.connectGatt(activity, false, gattCallback, BluetoothDevice.TRANSPORT_LE);
            if (gatt == null) finishPrint("Could not connect to the selected Bluetooth LE device.");
        } catch (SecurityException error) {
            finishPrint("Bluetooth connect permission is missing. Allow Nearby devices and try again.");
        }
    }

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt currentGatt, int status, int newState) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                finishPrint("Could not connect to the printer (BLE error " + status + ").");
            } else if (newState == BluetoothGatt.STATE_CONNECTED) {
                boolean mtuRequestStarted = false;
                try {
                    mtuRequestStarted = currentGatt.requestMtu(REQUESTED_MTU);
                } catch (SecurityException error) {
                    finishPrint("Bluetooth connect permission is missing.");
                }
                if (!mtuRequestStarted && printInProgress && !currentGatt.discoverServices()) {
                    finishPrint("Could not inspect the printer's BLE services.");
                }
            } else if (newState == BluetoothGatt.STATE_DISCONNECTED && printInProgress) {
                finishPrint("The printer disconnected before printing completed.");
            }
        }

        @Override
        public void onMtuChanged(BluetoothGatt currentGatt, int mtu, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                blePayloadSize = Math.max(DEFAULT_BLE_PAYLOAD_SIZE,
                    Math.min(mtu - 3, MAX_BLE_PAYLOAD_SIZE));
            }
            if (printInProgress && !currentGatt.discoverServices()) {
                finishPrint("Could not inspect the printer's BLE services.");
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt currentGatt, int status) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                finishPrint("Could not read the printer's BLE services.");
                return;
            }

            writeCharacteristic = findWritableCharacteristic(currentGatt);
            if (writeCharacteristic == null) {
                finishPrint("The MPT-II BLE profile has no writable print characteristic.");
                return;
            }
            writeWithResponse = (writeCharacteristic.getProperties()
                & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0;
            writeNextChunk();
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt currentGatt,
                BluetoothGattCharacteristic characteristic, int status) {
            if (!writeWithResponse || printData == null || characteristic != writeCharacteristic) return;
            if (status != BluetoothGatt.GATT_SUCCESS) {
                finishPrint("The printer rejected receipt data (BLE error " + status + ").");
                return;
            }
            printOffset += pendingChunkLength;
            pendingChunkLength = 0;
            if (printOffset >= printData.length) {
                mainHandler.postDelayed(() -> finishPrint("Receipt sent to printer."), PRINTER_DRAIN_DELAY_MS);
            } else {
                writeNextChunk();
            }
        }
    };

    private BluetoothGattCharacteristic findWritableCharacteristic(BluetoothGatt currentGatt) {
        for (BluetoothGattService service : currentGatt.getServices()) {
            for (BluetoothGattCharacteristic characteristic : service.getCharacteristics()) {
                if ((characteristic.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0) return characteristic;
            }
        }
        for (BluetoothGattService service : currentGatt.getServices()) {
            for (BluetoothGattCharacteristic characteristic : service.getCharacteristics()) {
                if ((characteristic.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) {
                    return characteristic;
                }
            }
        }
        return null;
    }

    private void writeNextChunk() {
        if (gatt == null || writeCharacteristic == null || printData == null) {
            finishPrint("Printer connection was lost.");
            return;
        }

        int length = Math.min(blePayloadSize, printData.length - printOffset);
        byte[] chunk = new byte[length];
        System.arraycopy(printData, printOffset, chunk, 0, length);
        int properties = writeCharacteristic.getProperties();
        int writeType = (properties & BluetoothGattCharacteristic.PROPERTY_WRITE)
            != 0 ? BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            : BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE;

        boolean started;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            started = gatt.writeCharacteristic(writeCharacteristic, chunk, writeType)
                == BluetoothGatt.GATT_SUCCESS;
        } else {
            writeCharacteristic.setWriteType(writeType);
            writeCharacteristic.setValue(chunk);
            started = gatt.writeCharacteristic(writeCharacteristic);
        }
        if (!started) finishPrint("Could not send receipt data to the printer.");
        else if (!writeWithResponse) {
            printOffset += length;
            long delay = printOffset >= printData.length ? PRINTER_DRAIN_DELAY_MS : NO_RESPONSE_WRITE_INTERVAL_MS;
            if (printOffset >= printData.length) {
                mainHandler.postDelayed(() -> finishPrint("Receipt sent to printer."), delay);
            } else {
                mainHandler.postDelayed(this::writeNextChunk, delay);
            }
        } else {
            pendingChunkLength = length;
        }
    }

    private void stopScan() {
        mainHandler.removeCallbacks(scanTimeout);
        if (scanner != null) {
            try {
                scanner.stopScan(scanCallback);
            } catch (SecurityException ignored) {
                // Scan is already stopped or permission was revoked.
            }
            scanner = null;
        }
    }

    private void finishPrint(String message) {
        mainHandler.post(() -> {
            if (!printInProgress) return;
            stopScan();
            if (gatt != null) {
                gatt.disconnect();
                gatt.close();
                gatt = null;
            }
            writeCharacteristic = null;
            pendingChunkLength = 0;
            writeWithResponse = false;
            blePayloadSize = DEFAULT_BLE_PAYLOAD_SIZE;
            printData = null;
            printInProgress = false;
            showToast(message);
        });
    }

    private void showToast(String message) {
        mainHandler.post(() -> Toast.makeText(context, message, Toast.LENGTH_LONG).show());
    }

    private static final class BleCandidate {
        private final BluetoothDevice device;
        private final String name;
        private final int rssi;

        private BleCandidate(BluetoothDevice device, String name, int rssi) {
            this.device = device;
            this.name = name;
            this.rssi = rssi;
        }
    }
}