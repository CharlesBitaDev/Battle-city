package com.charlesbita.battlecity;

import android.app.Activity;
import android.content.SharedPreferences;
import android.content.res.AssetFileDescriptor;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.SoundPool;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Shows the game (web/index.html from the app's assets) full screen, passes the TV remote's
 * buttons to it, and runs the phone controller server.
 */
public class MainActivity extends Activity implements ControllerServer.Listener {

    private static final int PORT = 8765;

    private WebView web;
    private ControllerServer server;
    private SharedPreferences prefs;
    private SoundPool pool;
    private final Map<String, Integer> sounds = new HashMap<String, Integer>();
    private int engineStream = 0;
    private int engineLevel = 0;
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        prefs = getSharedPreferences("battlecity", MODE_PRIVATE);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Bridge(), "Android");
        setContentView(web);
        hideSystemUi();

        server = new ControllerServer(this, new ControllerServer.Assets() {
            public byte[] read(String name) throws IOException { return readAsset(name); }
        });
        server.start(PORT);
        loadSounds();

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
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    // ------------------------------------------------------------------ TV remote

    private static String keyName(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_DPAD_UP:
            case KeyEvent.KEYCODE_W:
                return "up";
            case KeyEvent.KEYCODE_DPAD_DOWN:
            case KeyEvent.KEYCODE_S:
                return "down";
            case KeyEvent.KEYCODE_DPAD_LEFT:
            case KeyEvent.KEYCODE_A:
                return "left";
            case KeyEvent.KEYCODE_DPAD_RIGHT:
            case KeyEvent.KEYCODE_D:
                return "right";
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
            case KeyEvent.KEYCODE_SPACE:
            case KeyEvent.KEYCODE_BUTTON_A:
            case KeyEvent.KEYCODE_BUTTON_X:
            case KeyEvent.KEYCODE_BUTTON_R1:
                return "ok";
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE:
            case KeyEvent.KEYCODE_BUTTON_B:
            case KeyEvent.KEYCODE_BUTTON_START:
            case KeyEvent.KEYCODE_MENU:
                return "back";
            default:
                return null;
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        String name = keyName(e.getKeyCode());
        if (name == null) return super.dispatchKeyEvent(e);
        if (e.getAction() == KeyEvent.ACTION_DOWN) {
            if (e.getRepeatCount() == 0) js("BC.key('" + name + "',true)");
        } else if (e.getAction() == KeyEvent.ACTION_UP) {
            js("BC.key('" + name + "',false)");
        }
        return true;
    }

    private void js(final String code) {
        final String script = "window.BC&&" + code + ";";
        if (Looper.myLooper() == Looper.getMainLooper()) {
            if (web != null) web.evaluateJavascript(script, null);
        } else {
            ui.post(new Runnable() {
                public void run() { if (web != null) web.evaluateJavascript(script, null); }
            });
        }
    }

    // ------------------------------------------------------------------ phones

    @Override
    public void onJoin(int slot, boolean connected) {
        js("BC.phoneJoin(" + slot + "," + connected + ")");
    }

    @Override
    public void onState(int slot, int bits) {
        js("BC.phoneState(" + slot + "," + bits + ")");
    }

    @Override
    public void onMenu(int slot) {
        js("BC.phoneMenu(" + slot + ")");
    }

    // ------------------------------------------------------------------ sound
    // The sound effects are pre-recorded files (web/sounds/*.ogg) played by Android's
    // SoundPool, which is much lighter than synthesising them in the WebView.

    private void loadSounds() {
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        pool = new SoundPool.Builder().setMaxStreams(10).setAudioAttributes(attrs).build();
        pool.setOnLoadCompleteListener(new SoundPool.OnLoadCompleteListener() {
            public void onLoadComplete(SoundPool p, int sampleId, int status) {
                Integer engine = sounds.get("engine");
                if (status == 0 && engine != null && engine == sampleId) applyEngine();
            }
        });
        try {
            String[] files = getAssets().list("web/sounds");
            if (files == null) return;
            for (String f : files) {
                if (!f.endsWith(".ogg")) continue;
                AssetFileDescriptor fd = getAssets().openFd("web/sounds/" + f);
                sounds.put(f.substring(0, f.length() - 4), pool.load(fd, 1));
                fd.close();
            }
        } catch (IOException e) {
            // no sounds; the game still runs
        }
    }

    private void playSound(String name, float volume) {
        Integer id = sounds.get(name);
        if (pool == null || id == null) return;
        float v = Math.max(0f, Math.min(1f, volume));
        pool.play(id, v, v, 1, 0, 1f);
    }

    private synchronized void setEngine(int level) {
        engineLevel = level;
        applyEngine();
    }

    /** 0 = off, 1 = idling, 2 = driving (louder and faster). */
    private synchronized void applyEngine() {
        Integer id = sounds.get("engine");
        if (pool == null || id == null) return;
        if (engineLevel == 0) {
            if (engineStream != 0) pool.stop(engineStream);
            engineStream = 0;
            return;
        }
        float vol = engineLevel == 2 ? 0.55f : 0.22f;
        float rate = engineLevel == 2 ? 1.45f : 1.0f;
        if (engineStream == 0) {
            engineStream = pool.play(id, vol, vol, 0, -1, rate);
        } else {
            pool.setVolume(engineStream, vol, vol);
            pool.setRate(engineStream, rate);
        }
    }

    // ------------------------------------------------------------------ life cycle

    @Override
    protected void onPause() {
        js("BC.onPause()");
        setEngine(0);
        if (pool != null) pool.autoPause();
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (pool != null) pool.autoResume();
        if (web != null) {
            web.onResume();
            hideSystemUi();
        }
        js("BC.onResume()");
    }

    @Override
    protected void onDestroy() {
        if (server != null) server.stop();
        if (pool != null) {
            pool.release();
            pool = null;
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    private byte[] readAsset(String name) throws IOException {
        InputStream in = getAssets().open(name);
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        } finally {
            in.close();
        }
    }

    /** Methods the game's JavaScript can call as window.Android.*. */
    private final class Bridge {
        @JavascriptInterface
        public String getAddress() {
            String ip = ControllerServer.localIp();
            int port = server == null ? -1 : server.getPort();
            return (ip == null || port < 0) ? "" : "http://" + ip + ":" + port;
        }

        @JavascriptInterface
        public String load(String key) {
            return prefs.getString(key, null);
        }

        @JavascriptInterface
        public void save(String key, String value) {
            prefs.edit().putString(key, value).apply();
        }

        @JavascriptInterface
        public void exit() {
            ui.post(new Runnable() {
                public void run() { finish(); }
            });
        }

        @JavascriptInterface
        public void playSound(String name, float volume) {
            MainActivity.this.playSound(name, volume);
        }

        @JavascriptInterface
        public void engine(int level) {
            setEngine(level);
        }

        @JavascriptInterface
        public void sendToPhone(int slot, String msg) {
            if (server != null) server.send(slot, msg);
        }
    }
}
