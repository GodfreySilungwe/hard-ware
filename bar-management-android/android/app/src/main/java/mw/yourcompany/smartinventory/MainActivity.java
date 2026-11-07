package mw.yourcompany.smartinventory;

import android.Manifest;
import android.os.Build;
import android.view.View;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
	@Override
	public void onCreate(android.os.Bundle savedInstanceState) {
		registerPlugin(PrinterPlugin.class);
		super.onCreate(savedInstanceState);
		WebView webView = getBridge().getWebView();
		webView.addJavascriptInterface(new AndroidPrinterBridge(this), "AndroidPrinter");
		webView.addJavascriptInterface(new AndroidTransferBridge(this, webView), "AndroidTransferBridge");
		webView.addJavascriptInterface(new AndroidCredentialBridge(this), "AndroidCredentials");
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
			webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
		}
		webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
			@Override
			public void onPageFinished(WebView view, String url) {
				super.onPageFinished(view, url);
				if (url.startsWith("https://localhost") || url.startsWith("http://localhost")) {
					view.evaluateJavascript(loadAndroidBridgeScript(), null);
				}
			}
		});
		webView.reload();
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
			requestPermissions(new String[]{
				Manifest.permission.BLUETOOTH_CONNECT,
				Manifest.permission.BLUETOOTH_SCAN
			}, 4101);
		} else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
			requestPermissions(new String[]{
				Manifest.permission.ACCESS_FINE_LOCATION,
				Manifest.permission.WRITE_EXTERNAL_STORAGE
			}, 4102);
		}
	}

	private String loadAndroidBridgeScript() {
		try (InputStream input = getAssets().open("android-platform-bridge.js");
			ByteArrayOutputStream output = new ByteArrayOutputStream()) {
			byte[] buffer = new byte[4096];
			int count;
			while ((count = input.read(buffer)) != -1) {
				output.write(buffer, 0, count);
			}
			return new String(output.toByteArray(), StandardCharsets.UTF_8);
		} catch (Exception error) {
			return "console.error('Android transfer bridge could not be loaded');";
		}
	}
}
