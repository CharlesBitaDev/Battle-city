package com.charlesbita.gamestore;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Game Store: lists the games in store/catalog.json (on GitHub), and downloads and installs
 * them with Android's PackageInstaller. The screen itself is web/index.html in a WebView.
 */
public class MainActivity extends Activity {

    static final String CATALOG_URL =
            "https://raw.githubusercontent.com/CharlesBitaDev/Battle-city/ccr-b0870caf-5uxupg/store/catalog.json";
    private static final String ACTION_STATUS = "com.charlesbita.gamestore.INSTALL_STATUS";

    private WebView web;
    private SharedPreferences prefs;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private volatile boolean busy;

    private final BroadcastReceiver statusReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String id = intent.getStringExtra("id");
            int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -999);
            if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                if (confirm != null) {
                    confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    try {
                        startActivity(confirm);
                    } catch (Exception e) {
                        busy = false;
                        call("Store.onInstallError", id, "The TV could not show the install screen.");
                    }
                }
                return;
            }
            busy = false;
            if (status == PackageInstaller.STATUS_SUCCESS) {
                call("Store.onInstalled", id, "");
            } else {
                String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
                call("Store.onInstallError", id, status == PackageInstaller.STATUS_FAILURE_ABORTED
                        ? "Install cancelled." : ("Install failed" + (msg != null ? ": " + msg : ".")));
            }
        }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        prefs = getSharedPreferences("gamestore", MODE_PRIVATE);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#10131c"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Bridge(), "Android");
        setContentView(web);
        hideSystemUi();

        IntentFilter f = new IntentFilter(ACTION_STATUS);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(statusReceiver, f, 4 /* RECEIVER_NOT_EXPORTED */);
        else registerReceiver(statusReceiver, f);

        web.loadUrl("file:///android_asset/web/index.html");
    }

    private void hideSystemUi() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUi();
        // back from an install screen, settings or a game: refresh what's installed
        js("window.Store&&Store.refresh()");
    }

    @Override
    protected void onDestroy() {
        try {
            unregisterReceiver(statusReceiver);
        } catch (Exception e) {
            // ignore
        }
        if (web != null) web.destroy();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ remote

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        String name = null;
        switch (e.getKeyCode()) {
            case KeyEvent.KEYCODE_DPAD_UP: name = "up"; break;
            case KeyEvent.KEYCODE_DPAD_DOWN: name = "down"; break;
            case KeyEvent.KEYCODE_DPAD_LEFT: name = "left"; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: name = "right"; break;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
            case KeyEvent.KEYCODE_BUTTON_A:
                name = "ok"; break;
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE:
            case KeyEvent.KEYCODE_BUTTON_B:
                name = "back"; break;
            default:
                return super.dispatchKeyEvent(e);
        }
        if (e.getAction() == KeyEvent.ACTION_DOWN) js("window.Store&&Store.key('" + name + "')");
        return true;
    }

    // ------------------------------------------------------------------ helpers

    private void js(final String code) {
        ui.post(new Runnable() {
            public void run() { if (web != null) web.evaluateJavascript(code, null); }
        });
    }

    /** Calls a JS function with string arguments (safely quoted as JSON). */
    private void call(String fn, String a, String b) {
        js("window.Store&&" + fn + "(" + JSONObject.quote(a == null ? "" : a) + "," + JSONObject.quote(b == null ? "" : b) + ")");
    }

    private static byte[] get(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(20000);
        c.setRequestProperty("Cache-Control", "no-cache");
        try {
            if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
            InputStream in = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        } finally {
            c.disconnect();
        }
    }

    private long installedVersion(String pkg) {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(pkg, 0);
            return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
        } catch (PackageManager.NameNotFoundException e) {
            return -1;
        }
    }

    private boolean mayInstall() {
        return Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls();
    }

    private void download(final String id, final String url) {
        if (busy) return;
        busy = true;
        new Thread(new Runnable() {
            public void run() {
                File file = new File(getCacheDir(), id + ".apk");
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(30000);
                    int code = c.getResponseCode();
                    if (code != 200) throw new Exception("the server said " + code);
                    long total = c.getContentLength();
                    InputStream in = c.getInputStream();
                    OutputStream out = new FileOutputStream(file);
                    byte[] buf = new byte[16384];
                    long done = 0;
                    int n, lastPct = -1;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : -1;
                        if (pct != lastPct) {
                            lastPct = pct;
                            call("Store.onProgress", id, String.valueOf(pct));
                        }
                    }
                    out.close();
                    in.close();
                    c.disconnect();
                    install(id, file);
                } catch (Exception e) {
                    busy = false;
                    call("Store.onInstallError", id, "Download failed. Check the TV's internet connection.");
                }
            }
        }).start();
    }

    private void install(String id, File file) throws Exception {
        call("Store.onProgress", id, "installing");
        PackageInstaller pi = getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params =
                new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        int sessionId = pi.createSession(params);
        PackageInstaller.Session session = pi.openSession(sessionId);
        try {
            OutputStream out = session.openWrite("base.apk", 0, file.length());
            InputStream in = new FileInputStream(file);
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            session.fsync(out);
            out.close();
            Intent status = new Intent(ACTION_STATUS).setPackage(getPackageName()).putExtra("id", id);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent p = PendingIntent.getBroadcast(this, sessionId, status, flags);
            session.commit(p.getIntentSender());
        } finally {
            session.close();
        }
    }

    /** Methods the store page calls as window.Android.*. */
    private final class Bridge {
        /** Fetches the catalog in the background, then calls Store.onCatalog(json, error). */
        @JavascriptInterface
        public void loadCatalog() {
            new Thread(new Runnable() {
                public void run() {
                    try {
                        String json = new String(get(CATALOG_URL + "?t=" + System.currentTimeMillis()), "UTF-8");
                        new JSONObject(json); // check it parses
                        prefs.edit().putString("catalog", json).apply();
                        call("Store.onCatalog", json, "");
                    } catch (Exception e) {
                        String cached = prefs.getString("catalog", "");
                        call("Store.onCatalog", cached, "Could not reach the internet.");
                    }
                }
            }).start();
        }

        /** Installed version code of a package, or -1. */
        @JavascriptInterface
        public double installedVersion(String pkg) {
            return MainActivity.this.installedVersion(pkg);
        }

        @JavascriptInterface
        public String storePackage() {
            return getPackageName();
        }

        @JavascriptInterface
        public boolean mayInstall() {
            return MainActivity.this.mayInstall();
        }

        /** Opens the setting that lets this store install apps. */
        @JavascriptInterface
        public void allowInstalls() {
            ui.post(new Runnable() {
                public void run() {
                    try {
                        startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + getPackageName())));
                    } catch (Exception e) {
                        try {
                            startActivity(new Intent(Settings.ACTION_SECURITY_SETTINGS));
                        } catch (Exception e2) {
                            call("Store.onInstallError", "", "Open the TV's Settings and allow Game Store to install apps.");
                        }
                    }
                }
            });
        }

        @JavascriptInterface
        public void install(String id, String url) {
            download(id, url);
        }

        @JavascriptInterface
        public boolean open(String pkg) {
            PackageManager pm = getPackageManager();
            Intent i = pm.getLeanbackLaunchIntentForPackage(pkg);
            if (i == null) i = pm.getLaunchIntentForPackage(pkg);
            if (i == null) return false;
            final Intent launch = i;
            ui.post(new Runnable() {
                public void run() { startActivity(launch); }
            });
            return true;
        }

        @JavascriptInterface
        public void exit() {
            ui.post(new Runnable() {
                public void run() { finish(); }
            });
        }
    }
}
