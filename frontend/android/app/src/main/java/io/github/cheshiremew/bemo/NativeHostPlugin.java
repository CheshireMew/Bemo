package io.github.cheshiremew.bemo;

import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.webkit.WebView;

import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

@CapacitorPlugin(name = "NativeHost")
public class NativeHostPlugin extends Plugin {
    @PluginMethod
    public void copyToClipboard(PluginCall call) {
        String text = call.getString("text", "");
        String html = call.getString("html");

        ClipboardManager clipboard = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null) {
            call.reject("Clipboard service unavailable");
            return;
        }

        ClipData clip = (html != null && !html.trim().isEmpty())
            ? ClipData.newHtmlText("Bemo", text, html)
            : ClipData.newPlainText("Bemo", text);
        clipboard.setPrimaryClip(clip);
        call.resolve();
    }

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "").trim();
        if (url.isEmpty()) {
            call.reject("Missing url");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("No application can open this link.", error);
        }
    }

    @PluginMethod
    public void performDefaultBack(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else if (!getActivity().moveTaskToBack(true)) {
                    getActivity().finish();
                }
                call.resolve();
            } catch (Exception error) {
                call.reject(error.getMessage(), error);
            }
        });
    }

    @PluginMethod
    public void openBinary(PluginCall call) {
        String base64Data = call.getString("base64Data", "");
        String fileName = sanitizeFileName(call.getString("fileName", "bemo-file"));
        String mimeType = call.getString("mimeType", "application/octet-stream");

        if (base64Data.trim().isEmpty()) {
            call.reject("Missing binary payload");
            return;
        }

        try {
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            File directory = new File(getContext().getCacheDir(), "native-open");
            if (!directory.exists() && !directory.mkdirs()) {
                throw new IllegalStateException("Unable to prepare cache directory");
            }

            File file = new File(directory, fileName);
            FileOutputStream output = new FileOutputStream(file, false);
            output.write(bytes);
            output.flush();
            output.close();

            Uri contentUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                file
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(contentUri, mimeType);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("No application can open this file.", error);
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    private String sanitizeFileName(String value) {
        String normalized = value == null ? "" : value.trim().replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]+", "_");
        return normalized.isEmpty() ? "bemo-file" : normalized;
    }
}
