package mw.yourcompany.smartinventory;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
	@Override
	public void onCreate(android.os.Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		registerPlugin(PrinterPlugin.class);
		getBridge().getWebView().addJavascriptInterface(new AndroidPrinterBridge(this), "AndroidPrinter");
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
			requestPermissions(new String[]{
				Manifest.permission.BLUETOOTH_CONNECT,
				Manifest.permission.BLUETOOTH_SCAN
			}, 4101);
		} else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
			requestPermissions(new String[]{
				Manifest.permission.ACCESS_FINE_LOCATION
			}, 4102);
		}
	}
}
