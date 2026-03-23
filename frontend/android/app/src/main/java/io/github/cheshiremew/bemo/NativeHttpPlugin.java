package io.github.cheshiremew.bemo;

import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Map;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

@CapacitorPlugin(name = "NativeHttp")
public class NativeHttpPlugin extends Plugin {
    private static final MediaType DEFAULT_MEDIA_TYPE = MediaType.parse("application/octet-stream");
    private final OkHttpClient client = new OkHttpClient();

    @PluginMethod
    public void request(PluginCall call) {
        final String url = call.getString("url", "").trim();
        final String method = call.getString("method", "GET").trim().toUpperCase();

        if (url.isEmpty()) {
            call.reject("Missing request url");
            return;
        }

        bridge.execute(() -> {
            try {
                Request request = buildRequest(call, url, method);
                try (Response response = client.newCall(request).execute()) {
                    JSObject payload = new JSObject();
                    payload.put("status", response.code());
                    payload.put("url", response.request().url().toString());
                    payload.put("headers", toHeadersObject(response.headers().toMultimap()));

                    if (response.body() != null) {
                        byte[] bytes = response.body().bytes();
                        payload.put("body", Base64.encodeToString(bytes, Base64.NO_WRAP));
                        payload.put("bodyEncoding", "base64");
                    } else {
                        payload.put("body", "");
                        payload.put("bodyEncoding", "base64");
                    }

                    call.resolve(payload);
                }
            } catch (Exception error) {
                call.reject(error.getMessage(), error);
            }
        });
    }

    private Request buildRequest(PluginCall call, String url, String method) throws JSONException {
        Request.Builder builder = new Request.Builder().url(url);
        JSObject headers = call.getObject("headers", new JSObject());
        Iterator<String> headerNames = headers.keys();
        while (headerNames.hasNext()) {
            String key = headerNames.next();
            String value = headers.getString(key);
            if (value != null) {
                builder.header(key, value);
            }
        }

        RequestBody body = buildRequestBody(call, headers);
        if (body == null && requiresRequestBody(method)) {
          body = RequestBody.create(new byte[0], DEFAULT_MEDIA_TYPE);
        }

        builder.method(method, body);
        return builder.build();
    }

    private RequestBody buildRequestBody(PluginCall call, JSObject headers) {
        String rawBody = call.getString("body");
        if (rawBody == null) {
            return null;
        }

        String bodyEncoding = call.getString("bodyEncoding", "text");
        byte[] bytes;
        if ("base64".equals(bodyEncoding)) {
            bytes = Base64.decode(rawBody, Base64.DEFAULT);
        } else {
            bytes = rawBody.getBytes(StandardCharsets.UTF_8);
        }

        String contentType = headers.getString("Content-Type", "application/octet-stream");
        MediaType mediaType = MediaType.parse(contentType);
        if (mediaType == null) {
            mediaType = DEFAULT_MEDIA_TYPE;
        }
        return RequestBody.create(bytes, mediaType);
    }

    private boolean requiresRequestBody(String method) {
        return "PROPFIND".equals(method)
            || "PUT".equals(method)
            || "POST".equals(method)
            || "PATCH".equals(method)
            || "MKCOL".equals(method)
            || "LOCK".equals(method)
            || "UNLOCK".equals(method)
            || "REPORT".equals(method);
    }

    private JSObject toHeadersObject(Map<String, java.util.List<String>> headers) {
        JSObject object = new JSObject();
        for (Map.Entry<String, java.util.List<String>> entry : headers.entrySet()) {
            if (entry.getValue() == null || entry.getValue().isEmpty()) {
                object.put(entry.getKey(), "");
                continue;
            }
            object.put(entry.getKey(), String.join(", ", entry.getValue()));
        }
        return object;
    }
}
