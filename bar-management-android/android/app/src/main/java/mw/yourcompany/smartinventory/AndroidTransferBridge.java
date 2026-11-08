package mw.yourcompany.smartinventory;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentValues;
import android.database.Cursor;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.content.pm.PackageManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

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
                result = saveToDocuments(fileName, contentType, encodedBody);
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
    public void sharePdf(String fileName, String encodedBody, String shareText, String title, String requestId) {
        new Thread(() -> {
            try {
                String safeName = fileName == null ? "quotation.pdf" : fileName.replaceAll("[^A-Za-z0-9._-]", "_");
                if (!safeName.toLowerCase().endsWith(".pdf")) safeName += ".pdf";
                byte[] pdfBytes = decodeBase64(encodedBody, 30 * 1024 * 1024);
                if (pdfBytes.length == 0 || !hasPdfSignature(pdfBytes)) {
                    throw new IllegalArgumentException("The quotation file is not a valid PDF.");
                }

                File shareDirectory = new File(activity.getCacheDir(), "quotation-shares");
                if (!shareDirectory.exists() && !shareDirectory.mkdirs()) {
                    throw new IllegalStateException("Could not prepare the quotation for sharing.");
                }
                File pdfFile = new File(shareDirectory, System.currentTimeMillis() + "-" + safeName);
                try (FileOutputStream output = new FileOutputStream(pdfFile)) {
                    output.write(pdfBytes);
                }
                Uri pdfUri = FileProvider.getUriForFile(
                    activity,
                    activity.getPackageName() + ".fileprovider",
                    pdfFile
                );

                Intent sendIntent = new Intent(Intent.ACTION_SEND);
                sendIntent.setType("application/pdf");
                sendIntent.putExtra(Intent.EXTRA_STREAM, pdfUri);
                sendIntent.putExtra(Intent.EXTRA_TEXT, shareText == null ? "" : shareText);
                sendIntent.putExtra(Intent.EXTRA_TITLE, title == null ? "Quotation" : title);
                sendIntent.setClipData(ClipData.newUri(activity.getContentResolver(), safeName, pdfUri));
                sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                Intent chooser = Intent.createChooser(sendIntent, title == null ? "Send quotation" : title);
                chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                activity.runOnUiThread(() -> {
                    try {
                        activity.startActivity(chooser);
                        completeRequest(requestId, result(200, "Quotation ready to share.", pdfBytes.length));
                    } catch (Exception error) {
                        completeRequest(requestId, result(500, error.getMessage()));
                    }
                });
            } catch (Exception error) {
                completeRequest(requestId, result(500, error.getMessage()));
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

    private JSONObject saveToDocuments(String fileName, String contentType, String encodedBody) throws Exception {
        String mimeType = contentType == null ? "application/octet-stream" : contentType.split(";")[0].trim();
        if (!isSupportedDownloadType(mimeType)) {
            return result(400, "This Android download file type is not supported.");
        }

        byte[] body = decodeBase64(encodedBody, MAX_DOWNLOAD_BYTES);
        if (body.length == 0) return result(400, "The export file is empty.");
        String safeName = fileName == null ? "report" : fileName.replaceAll("[^A-Za-z0-9._-]", "_");
        if (safeName.isEmpty()) safeName = "report";
        long savedSize;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOCUMENTS + "/Smart POS");
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);

            Uri fileUri = activity.getContentResolver().insert(MediaStore.Files.getContentUri("external"), values);
            if (fileUri == null) throw new IllegalStateException("Could not create a file in Documents/Smart POS.");
            try {
                try (OutputStream output = activity.getContentResolver().openOutputStream(fileUri)) {
                    if (output == null) throw new IllegalStateException("Could not open the export file.");
                    output.write(body);
                }
                ContentValues published = new ContentValues();
                published.put(MediaStore.MediaColumns.IS_PENDING, 0);
                activity.getContentResolver().update(fileUri, published, null, null);
                try (Cursor cursor = activity.getContentResolver().query(
                        fileUri, new String[]{MediaStore.MediaColumns.SIZE}, null, null, null)) {
                    if (cursor == null || !cursor.moveToFirst()) {
                        throw new IllegalStateException("Could not verify the saved export.");
                    }
                    savedSize = cursor.getLong(0);
                }
            } catch (Exception error) {
                activity.getContentResolver().delete(fileUri, null, null);
                throw error;
            }
        } else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && ContextCompat.checkSelfPermission(activity, android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                return result(403, "Allow storage access in Android settings to save reports.");
            }
            File documents = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS);
            if (documents == null) throw new IllegalStateException("Shared Documents storage is unavailable.");
            File appDocuments = new File(documents, "Smart POS");
            if (!appDocuments.exists() && !appDocuments.mkdirs()) {
                throw new IllegalStateException("Could not create the app Documents folder.");
            }
            File exportFile = new File(appDocuments, safeName);
            try (FileOutputStream output = new FileOutputStream(exportFile)) {
                output.write(body);
            }
            savedSize = exportFile.length();
        }
        if (savedSize != body.length) {
            throw new IllegalStateException("Saved export size did not match the downloaded file.");
        }
        return result(200, "File saved to Documents/Smart POS.", savedSize);
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

    private boolean hasPdfSignature(byte[] bytes) {
        return bytes.length >= 5
            && bytes[0] == '%'
            && bytes[1] == 'P'
            && bytes[2] == 'D'
            && bytes[3] == 'F'
            && bytes[4] == '-';
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
        return result(status, message, -1);
    }

    private JSONObject result(int status, String message, long size) {
        JSONObject value = new JSONObject();
        try {
            value.put("status", status);
            value.put("message", message == null ? "Android file transfer failed." : message);
            if (size >= 0) value.put("size", size);
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