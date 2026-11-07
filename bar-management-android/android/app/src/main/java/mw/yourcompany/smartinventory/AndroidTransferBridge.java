package mw.yourcompany.smartinventory;

import android.app.Activity;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class AndroidTransferBridge {
    private static final int MAX_IMAGE_BYTES = 1024 * 1024;
    private static final int MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
    private final Activity activity;
    private final WebView webView;

    public AndroidTransferBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @JavascriptInterface
    public void putS3Object(String uploadUrl, String contentType, String encodedBody, String requestId) {
        new Thread(() -> {
            JSONObject result;
            try {
                result = uploadToS3(uploadUrl, contentType, encodedBody);
            } catch (Exception error) {
                result = result(500, error.getMessage());
            }
            completeRequest(requestId, result);
        }).start();
    }

    @JavascriptInterface
    public void saveDownload(String fileName, String contentType, String encodedBody, String requestId) {
        new Thread(() -> {
            JSONObject result;
            try {
                result = saveToDownloads(fileName, contentType, encodedBody);
            } catch (Exception error) {
                result = result(500, error.getMessage());
            }
            completeRequest(requestId, result);
            if (result.optInt("status") == 200) {
                activity.runOnUiThread(() -> Toast.makeText(activity, "File saved to Documents/Smart POS", Toast.LENGTH_LONG).show());
            }
        }).start();
    }

    @JavascriptInterface
    public void showTransferError(String message) {
        activity.runOnUiThread(() -> Toast.makeText(activity, message, Toast.LENGTH_LONG).show());
    }

    private JSONObject uploadToS3(String uploadUrl, String contentType, String encodedBody) throws Exception {
        if (!"image/png".equals(contentType) && !"image/jpeg".equals(contentType)) {
            return result(400, "Logo and signature uploads must be PNG or JPEG.");
        }

        URL url = new URL(uploadUrl);
        String host = url.getHost();
        if (!"https".equalsIgnoreCase(url.getProtocol()) || host == null
            || !host.endsWith(".amazonaws.com") || !host.contains(".s3")
            || url.getQuery() == null || !url.getQuery().contains("X-Amz-Signature=")) {
            return result(400, "Upload URL is not a valid signed S3 URL.");
        }

        byte[] body = decodeBase64(encodedBody, MAX_IMAGE_BYTES);
        if (body.length == 0) return result(400, "The selected image is empty.");

        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        try {
            connection.setRequestMethod("PUT");
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(30000);
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(body.length);
            connection.setRequestProperty("Content-Type", contentType);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body);
            }
            int status = connection.getResponseCode();
            if (status >= 200 && status < 300) {
                return result(status, "Image uploaded.");
            }
            return result(status, readError(connection));
        } finally {
            connection.disconnect();
        }
    }

    private JSONObject saveToDownloads(String fileName, String contentType, String encodedBody) throws Exception {
        String mimeType = contentType == null ? "application/octet-stream" : contentType.split(";")[0].trim();
        if (!isSupportedDownloadType(mimeType)) {
            return result(400, "This Android download file type is not supported.");
        }

        byte[] body = decodeBase64(encodedBody, MAX_DOWNLOAD_BYTES);
        if (body.length == 0) return result(400, "The export file is empty.");
        String safeName = fileName == null ? "report" : fileName.replaceAll("[^A-Za-z0-9._-]", "_");
        if (safeName.isEmpty()) safeName = "report";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOCUMENTS + "/Smart POS");
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);

            Uri fileUri = activity.getContentResolver().insert(MediaStore.Files.getContentUri("external"), values);
            if (fileUri == null) throw new IllegalStateException("Could not create a file in Documents/Smart POS.");
            try (OutputStream output = activity.getContentResolver().openOutputStream(fileUri)) {
                if (output == null) throw new IllegalStateException("Could not open the PDF file.");
                output.write(body);
            } catch (Exception error) {
                activity.getContentResolver().delete(fileUri, null, null);
                throw error;
            }
            ContentValues published = new ContentValues();
            published.put(MediaStore.MediaColumns.IS_PENDING, 0);
            activity.getContentResolver().update(fileUri, published, null, null);
        } else {
            File documents = activity.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
            if (documents == null) throw new IllegalStateException("App Documents storage is unavailable.");
            File appDocuments = new File(documents, "Smart POS");
            if (!appDocuments.exists() && !appDocuments.mkdirs()) {
                throw new IllegalStateException("Could not create the app Documents folder.");
            }
            File exportFile = new File(appDocuments, safeName);
            try (FileOutputStream output = new FileOutputStream(exportFile)) {
                output.write(body);
            }
        }
        return result(200, "File saved to Documents/Smart POS.");
    }

    private boolean isSupportedDownloadType(String mimeType) {
        return "application/pdf".equalsIgnoreCase(mimeType)
            || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".equalsIgnoreCase(mimeType)
            || "application/vnd.ms-excel".equalsIgnoreCase(mimeType)
            || "application/octet-stream".equalsIgnoreCase(mimeType);
    }

    private byte[] decodeBase64(String encodedBody, int maxBytes) {
        if (encodedBody == null || encodedBody.length() > ((long) maxBytes * 4 / 3) + 8) {
            throw new IllegalArgumentException("File exceeds the allowed size.");
        }
        byte[] body = Base64.decode(encodedBody, Base64.DEFAULT);
        if (body.length > maxBytes) throw new IllegalArgumentException("File exceeds the allowed size.");
        return body;
    }

    private String readError(HttpURLConnection connection) throws IOException {
        InputStream input = connection.getErrorStream();
        if (input == null) return "Upload failed with HTTP " + connection.getResponseCode();
        try (InputStream error = input) {
            byte[] bytes = error.readNBytes(1024);
            return new String(bytes, StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            return "Upload failed with HTTP " + connection.getResponseCode();
        }
    }

    private JSONObject result(int status, String message) {
        JSONObject value = new JSONObject();
        try {
            value.put("status", status);
            value.put("message", message == null ? "Android file transfer failed." : message);
        } catch (JSONException ignored) {
            // The fixed result keys and values are always JSON-compatible.
        }
        return value;
    }

    private void completeRequest(String requestId, JSONObject result) {
        String script = "window.__androidTransferComplete && window.__androidTransferComplete("
            + JSONObject.quote(requestId) + "," + result.toString() + ");";
        activity.runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }
}