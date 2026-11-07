package mw.yourcompany.smartinventory;

import android.app.Activity;
import android.view.autofill.AutofillManager;
import android.webkit.JavascriptInterface;

public final class AndroidCredentialBridge {
    private final Activity activity;

    public AndroidCredentialBridge(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void commitAutofill() {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O) return;

        AutofillManager autofillManager = activity.getSystemService(AutofillManager.class);
        if (autofillManager == null || !autofillManager.isEnabled()) return;
        activity.runOnUiThread(autofillManager::commit);
    }
}