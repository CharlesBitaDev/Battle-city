package com.charlesbita.homecast;

import android.Manifest;
import android.app.Activity;
import android.app.UiModeManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.TimedText;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Display;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;

/**
 * HomeCast. On a TV: a full-screen video player (Android's MediaPlayer, which decodes the
 * original file on the TV's hardware decoder) under the app's screens (web/index.html in a
 * WebView), plus the Hub server that phones connect to. On a phone: the same screens as a
 * remote, and the video server that lets the TV play the phone's videos over Wi-Fi.
 */
public class MainActivity extends Activity implements SurfaceHolder.Callback {

    static final int HUB_PORT = 8790;

    private SharedPreferences prefs;
    private boolean tvMode;
    private WebView web;
    private SurfaceView surface;
    private SurfaceHolder holder;
    private MediaPlayer mp;
    private Hub hub;
    private String hubSecret;
    private WifiManager.MulticastLock multicast;
    private final Handler ui = new Handler(Looper.getMainLooper());

    // player state, read by the page from any thread
    private volatile int posMs, durMs, videoW, videoH;
    private volatile boolean playing, prepared, buffering;
    private volatile String tracksJson = "[]";
    private int originalMode = 0;
    private boolean modeChanged;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences("homecast", MODE_PRIVATE);
        String forced = prefs.getString("mode", "");
        tvMode = forced.length() > 0 ? forced.equals("tv") : detectTv();
        // only the TV stays awake; the phone keeps sending video with its screen off
        if (tvMode) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        if (tvMode) {
            surface = new SurfaceView(this);
            surface.getHolder().addCallback(this);
            root.addView(surface, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER));
        }
        web = new WebView(this);
        web.setBackgroundColor(tvMode ? Color.TRANSPARENT : Color.parseColor("#0b0d12"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= 21) s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Bridge(), "Android");
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        if (tvMode) hideSystemUi();

        if (tvMode) {
            hubSecret = StreamService.randomToken(32);
            hub = new Hub(hubSecret, deviceName());
            hub.start(HUB_PORT);
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                multicast = wm.createMulticastLock("homecast");
                multicast.acquire();
            }
            if (Build.VERSION.SDK_INT >= 23) originalMode = getWindow().getAttributes().preferredDisplayModeId;
            ui.post(tick);
        } else {
            useWifiOnly();
            startSharing();
        }
        web.loadUrl("file:///android_asset/web/index.html");
    }

    private boolean detectTv() {
        PackageManager pm = getPackageManager();
        UiModeManager um = (UiModeManager) getSystemService(UI_MODE_SERVICE);
        if (um != null && um.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION) return true;
        if (pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK)) return true;
        return !pm.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN);
    }

    private String deviceName() {
        String n = null;
        if (Build.VERSION.SDK_INT >= 25) n = Settings.Global.getString(getContentResolver(), Settings.Global.DEVICE_NAME);
        if (n == null || n.length() == 0) n = Build.MODEL;
        return n == null ? "TV" : n.replace('\n', ' ');
    }

    private void hideSystemUi() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && tvMode) hideSystemUi();
    }

    // ------------------------------------------------------------------ phone: Wi-Fi only, sharing

    /** Sends this app's traffic over Wi-Fi only, never mobile data. */
    private void useWifiOnly() {
        if (Build.VERSION.SDK_INT < 23) return;
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null) return;
        Network wifi = null;
        for (Network n : cm.getAllNetworks()) {
            NetworkCapabilities c = cm.getNetworkCapabilities(n);
            if (c != null && (c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || c.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET))) wifi = n;
        }
        // with no Wi-Fi network (e.g. the phone is the hotspot) local addresses still route locally
        cm.bindProcessToNetwork(wifi);
    }

    private void startSharing() {
        StreamService.ensure(this);
        Intent i = new Intent(this, StreamService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i);
            else startService(i);
        } catch (Exception e) {
            // the server still runs while the app is open
        }
    }

    private boolean hasMediaPermission() {
        if (Build.VERSION.SDK_INT < 23) return true;
        String p = Build.VERSION.SDK_INT >= 33 ? "android.permission.READ_MEDIA_VIDEO" : Manifest.permission.READ_EXTERNAL_STORAGE;
        if (checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED) return true;
        return Build.VERSION.SDK_INT >= 34 && checkSelfPermission("android.permission.READ_MEDIA_VISUAL_USER_SELECTED") == PackageManager.PERMISSION_GRANTED;
    }

    private void askMediaPermission() {
        if (Build.VERSION.SDK_INT < 23) return;
        String[] want;
        if (Build.VERSION.SDK_INT >= 34) want = new String[] {"android.permission.READ_MEDIA_VIDEO", "android.permission.READ_MEDIA_VISUAL_USER_SELECTED"};
        else if (Build.VERSION.SDK_INT >= 33) want = new String[] {"android.permission.READ_MEDIA_VIDEO", "android.permission.POST_NOTIFICATIONS"};
        else want = new String[] {Manifest.permission.READ_EXTERNAL_STORAGE};
        requestPermissions(want, 7);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (Build.VERSION.SDK_INT >= 33 && code == 7 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {"android.permission.POST_NOTIFICATIONS"}, 8);
        }
        js("HC.onPermission(" + hasMediaPermission() + ")");
    }

    // ------------------------------------------------------------------ TV: player

    private final Runnable tick = new Runnable() {
        public void run() {
            MediaPlayer m = mp;
            if (m != null && prepared) {
                try {
                    posMs = m.getCurrentPosition();
                    playing = m.isPlaying();
                } catch (IllegalStateException e) {
                    // released
                }
            }
            ui.postDelayed(this, 250);
        }
    };

    @Override
    public void surfaceCreated(SurfaceHolder h) {
        holder = h;
        if (mp != null) {
            try {
                mp.setDisplay(h);
            } catch (Exception e) {
                // ignore
            }
        }
    }

    @Override
    public void surfaceChanged(SurfaceHolder h, int format, int w, int hgt) {
        holder = h;
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder h) {
        holder = null;
        if (mp != null) {
            try {
                mp.setDisplay(null);
            } catch (Exception e) {
                // ignore
            }
        }
    }

    /** Bumped by every play and stop, so a late check or time limit can't act on another video. */
    private int playSeq;
    private static final int OPEN_LIMIT_MS = 30000;

    /** Checks that the phone answers before opening the player: MediaPlayer can wait for minutes
     *  on an address it can't reach without reporting anything. */
    private void play(final String url, final int startMs) {
        release();
        final int seq = ++playSeq;
        new Thread(new Runnable() {
            public void run() {
                final String problem = probe(url);
                ui.post(new Runnable() {
                    public void run() {
                        if (seq != playSeq) return;
                        if (problem != null) js("HC.onPlayer('error'," + JSONObject.quote(problem) + ")");
                        else openPlayer(url, startMs, seq);
                    }
                });
            }
        }, "probe").start();
    }

    /** null when the phone sends the video, else "unreachable", "refused", "missing" or "http N". */
    private static String probe(String url) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(5000);
            c.setReadTimeout(8000);
            c.setRequestProperty("Range", "bytes=0-1");
            int code = c.getResponseCode();
            if (code == 200 || code == 206) return null;
            return code == 403 ? "refused" : code == 404 ? "missing" : "http " + code;
        } catch (Exception e) {
            return "unreachable";
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private void openPlayer(String url, final int startMs, final int seq) {
        final MediaPlayer m = new MediaPlayer();
        mp = m;
        prepared = false;
        posMs = startMs;
        durMs = 0;
        buffering = true;
        tracksJson = "[]";
        try {
            if (Build.VERSION.SDK_INT >= 21) {
                m.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE).build());
            } else {
                m.setAudioStreamType(AudioManager.STREAM_MUSIC);
            }
            m.setDataSource(url);
            if (holder != null) m.setDisplay(holder);
            m.setScreenOnWhilePlaying(true);
            m.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
                public void onPrepared(MediaPlayer p) {
                    if (p != mp) return;
                    prepared = true;
                    durMs = p.getDuration();
                    tracksJson = readTracks(p);
                    videoW = p.getVideoWidth();
                    videoH = p.getVideoHeight();
                    fitVideo();
                    if (startMs > 0) p.seekTo(startMs);
                    // After an output mode change the TV's HDMI link needs a moment; starting during
                    // it can leave the sound out of step with the picture, so wait for it.
                    ui.postDelayed(new Runnable() {
                        public void run() {
                            if (p != mp) return;
                            p.start();
                            playing = true;
                            buffering = false;
                            event("prepared");
                        }
                    }, bestDisplayMode() ? 2500 : 0);
                }
            });
            m.setOnVideoSizeChangedListener(new MediaPlayer.OnVideoSizeChangedListener() {
                public void onVideoSizeChanged(MediaPlayer p, int w, int h) {
                    videoW = w;
                    videoH = h;
                    fitVideo();
                }
            });
            m.setOnInfoListener(new MediaPlayer.OnInfoListener() {
                public boolean onInfo(MediaPlayer p, int what, int extra) {
                    if (what == MediaPlayer.MEDIA_INFO_BUFFERING_START) { buffering = true; event("buffering"); }
                    else if (what == MediaPlayer.MEDIA_INFO_BUFFERING_END || what == MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START) {
                        buffering = false;
                        event("ready");
                    }
                    return false;
                }
            });
            m.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                public void onCompletion(MediaPlayer p) {
                    if (p != mp) return;
                    playing = false;
                    event("ended");
                }
            });
            m.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                public boolean onError(MediaPlayer p, int what, int extra) {
                    if (p != mp) return true;
                    playing = false;
                    String why = extra == MediaPlayer.MEDIA_ERROR_UNSUPPORTED ? "unsupported"
                            : extra == MediaPlayer.MEDIA_ERROR_IO ? "network" : extra == MediaPlayer.MEDIA_ERROR_TIMED_OUT ? "timeout"
                            : extra == MediaPlayer.MEDIA_ERROR_MALFORMED ? "malformed" : "error " + what + "/" + extra;
                    js("HC.onPlayer('error'," + JSONObject.quote(why) + ")");
                    return true;
                }
            });
            m.setOnTimedTextListener(new MediaPlayer.OnTimedTextListener() {
                public void onTimedText(MediaPlayer p, TimedText t) {
                    js("HC.onSubtitle(" + JSONObject.quote(t == null || t.getText() == null ? "" : t.getText()) + ")");
                }
            });
            buffering = true;
            m.prepareAsync();
            // some TV decoders never answer for a video they can't handle (e.g. taller than 1080)
            ui.postDelayed(new Runnable() {
                public void run() {
                    if (seq != playSeq || mp != m || prepared) return;
                    release();
                    js("HC.onPlayer('error','stuck')");
                }
            }, OPEN_LIMIT_MS);
        } catch (Exception e) {
            js("HC.onPlayer('error'," + JSONObject.quote("cannot open: " + e.getMessage()) + ")");
        }
    }

    private String readTracks(MediaPlayer p) {
        JSONArray a = new JSONArray();
        try {
            MediaPlayer.TrackInfo[] ts = p.getTrackInfo();
            for (int i = 0; i < ts.length; i++) {
                int type = ts[i].getTrackType();
                if (type != MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_AUDIO && type != MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_TIMEDTEXT) continue;
                JSONObject o = new JSONObject();
                o.put("i", i);
                o.put("type", type == MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_AUDIO ? "audio" : "text");
                o.put("lang", ts[i].getLanguage());
                a.put(o);
            }
        } catch (Exception e) {
            // no track info
        }
        return a.toString();
    }

    /** Shows the whole picture, as large as the screen allows, keeping its shape. */
    private void fitVideo() {
        if (surface == null || videoW <= 0 || videoH <= 0) return;
        View root = (View) surface.getParent();
        int sw = root.getWidth(), sh = root.getHeight();
        if (sw <= 0 || sh <= 0) return;
        int w = sw, h = (int) ((long) sw * videoH / videoW);
        if (h > sh) {
            h = sh;
            w = (int) ((long) sh * videoW / videoH);
        }
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, h, Gravity.CENTER);
        surface.setLayoutParams(lp);
    }

    /** If the video has more lines than the TV's current output and the TV can do more, switch up.
     *  Off unless chosen in Settings: on slow TV boxes the switch can cost smooth playback.
     *  Returns true when it switched. */
    private boolean bestDisplayMode() {
        if (Build.VERSION.SDK_INT < 23 || !prefs.getBoolean("bestMode", false) || videoH <= 0) return false;
        Display d = getWindowManager().getDefaultDisplay();
        Display.Mode cur = d.getMode();
        int curLines = Math.min(cur.getPhysicalWidth(), cur.getPhysicalHeight());
        int want = Math.min(videoW, videoH);
        if (want <= curLines) return false;
        // the smallest mode that fits the video, or else the biggest there is (same refresh rate)
        Display.Mode fit = null, biggest = null;
        for (Display.Mode m : d.getSupportedModes()) {
            int lines = Math.min(m.getPhysicalWidth(), m.getPhysicalHeight());
            if (lines <= curLines || Math.abs(m.getRefreshRate() - cur.getRefreshRate()) > 1.5f) continue;
            if (lines >= want && (fit == null || lines < Math.min(fit.getPhysicalWidth(), fit.getPhysicalHeight()))) fit = m;
            if (biggest == null || lines > Math.min(biggest.getPhysicalWidth(), biggest.getPhysicalHeight())) biggest = m;
        }
        Display.Mode best = fit != null ? fit : biggest;
        if (best == null) return false;
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.preferredDisplayModeId = best.getModeId();
        getWindow().setAttributes(lp);
        modeChanged = true;
        return true;
    }

    private void restoreDisplayMode() {
        if (!modeChanged || Build.VERSION.SDK_INT < 23) return;
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.preferredDisplayModeId = originalMode;
        getWindow().setAttributes(lp);
        modeChanged = false;
    }

    private void release() {
        MediaPlayer m = mp;
        mp = null;
        prepared = false;
        playing = false;
        if (m != null) {
            try {
                m.reset();
            } catch (Exception e) {
                // ignore
            }
            m.release();
        }
    }

    private void event(String e) {
        js("HC.onPlayer('" + e + "','')");
    }

    private void js(final String code) {
        final String script = "window.HC&&" + code + ";";
        Runnable r = new Runnable() {
            public void run() { if (web != null) web.evaluateJavascript(script, null); }
        };
        if (Looper.myLooper() == Looper.getMainLooper()) r.run();
        else ui.post(r);
    }

    // ------------------------------------------------------------------ remote keys (TV)

    private static String keyName(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_DPAD_UP: return "up";
            case KeyEvent.KEYCODE_DPAD_DOWN: return "down";
            case KeyEvent.KEYCODE_DPAD_LEFT: return "left";
            case KeyEvent.KEYCODE_DPAD_RIGHT: return "right";
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
            case KeyEvent.KEYCODE_BUTTON_A:
                return "ok";
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE:
            case KeyEvent.KEYCODE_BUTTON_B:
                return "back";
            case KeyEvent.KEYCODE_MENU:
            case KeyEvent.KEYCODE_INFO:
                return "menu";
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_SPACE:
                return "playpause";
            case KeyEvent.KEYCODE_MEDIA_PLAY: return "play";
            case KeyEvent.KEYCODE_MEDIA_PAUSE: return "pause";
            case KeyEvent.KEYCODE_MEDIA_STOP: return "stop";
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
            case KeyEvent.KEYCODE_MEDIA_NEXT:
                return "ff";
            case KeyEvent.KEYCODE_MEDIA_REWIND:
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                return "rew";
            default:
                return null;
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        String name = keyName(e.getKeyCode());
        if (name == null) return super.dispatchKeyEvent(e);
        if (!tvMode && !name.equals("back")) return super.dispatchKeyEvent(e);
        if (e.getAction() == KeyEvent.ACTION_DOWN) js("HC.key('" + name + "',true," + e.getRepeatCount() + ")");
        else if (e.getAction() == KeyEvent.ACTION_UP) js("HC.key('" + name + "',false,0)");
        return true;
    }

    // ------------------------------------------------------------------ life cycle

    @Override
    protected void onResume() {
        super.onResume();
        if (tvMode) hideSystemUi();
        else {
            StreamService.appVisible = true;
            useWifiOnly();
            startSharing();
        }
        if (web != null) web.onResume();
        js("HC.onResume()");
    }

    @Override
    protected void onPause() {
        js("HC.onPause()");
        StreamService.appVisible = false;
        if (tvMode && mp != null && playing) {
            try {
                mp.pause();
                playing = false;
            } catch (Exception e) {
                // ignore
            }
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacks(tick);
        release();
        restoreDisplayMode();
        if (hub != null) hub.stop();
        if (multicast != null && multicast.isHeld()) multicast.release();
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** Methods the page calls as window.Android.* */
    private final class Bridge {
        @JavascriptInterface public String mode() { return tvMode ? "tv" : "phone"; }
        @JavascriptInterface public String name() { return deviceName(); }
        @JavascriptInterface public String load(String k) { return prefs.getString("js." + k, null); }
        @JavascriptInterface public void save(String k, String v) { prefs.edit().putString("js." + k, v).apply(); }
        @JavascriptInterface public String version() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public String addresses() {
            JSONArray a = new JSONArray();
            for (String ip : Hub.lanAddresses()) a.put(ip);
            return a.toString();
        }

        /** "tv" or "phone" to choose by hand, "" to detect; restarts the screen. */
        @JavascriptInterface
        public void setMode(final String m) {
            prefs.edit().putString("mode", m).apply();
            ui.post(new Runnable() {
                public void run() { recreate(); }
            });
        }

        @JavascriptInterface
        public void exit() {
            ui.post(new Runnable() {
                public void run() { finish(); }
            });
        }

        // ---- TV
        @JavascriptInterface public String hubSecret() { return hubSecret == null ? "" : hubSecret; }
        @JavascriptInterface public int hubPort() { return hub == null ? -1 : hub.getPort(); }

        @JavascriptInterface
        public void play(final String url, final int startMs) {
            ui.post(new Runnable() {
                public void run() { MainActivity.this.play(url, startMs); }
            });
        }

        @JavascriptInterface
        public void pause() {
            ui.post(new Runnable() {
                public void run() {
                    if (mp != null && prepared && mp.isPlaying()) { mp.pause(); playing = false; }
                }
            });
        }

        @JavascriptInterface
        public void resume() {
            ui.post(new Runnable() {
                public void run() {
                    if (mp != null && prepared && !mp.isPlaying()) { mp.start(); playing = true; }
                }
            });
        }

        @JavascriptInterface
        public void seek(final int ms) {
            ui.post(new Runnable() {
                public void run() {
                    if (mp != null && prepared) {
                        int t = Math.max(0, Math.min(ms, durMs > 0 ? durMs - 500 : ms));
                        mp.seekTo(t);
                        posMs = t;
                    }
                }
            });
        }

        @JavascriptInterface
        public void stop() {
            ui.post(new Runnable() {
                public void run() {
                    playSeq++;
                    release();
                    restoreDisplayMode();
                    if (surface != null) surface.setLayoutParams(new FrameLayout.LayoutParams(
                            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER));
                }
            });
        }

        /** {pos, dur, playing, buffering, prepared, w, h} */
        @JavascriptInterface
        public String status() {
            return "{\"pos\":" + posMs + ",\"dur\":" + durMs + ",\"playing\":" + playing + ",\"buffering\":" + buffering
                    + ",\"prepared\":" + prepared + ",\"w\":" + videoW + ",\"h\":" + videoH + "}";
        }

        @JavascriptInterface public String tracks() { return tracksJson; }

        @JavascriptInterface
        public void selectTrack(final int i, final boolean on) {
            ui.post(new Runnable() {
                public void run() {
                    if (mp == null || !prepared) return;
                    try {
                        if (on) mp.selectTrack(i);
                        else mp.deselectTrack(i);
                    } catch (Exception e) {
                        // not allowed for this track
                    }
                }
            });
        }

        @JavascriptInterface
        public String volume() {
            AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
            if (am == null) return "{\"v\":0,\"max\":0}";
            return "{\"v\":" + am.getStreamVolume(AudioManager.STREAM_MUSIC) + ",\"max\":" + am.getStreamMaxVolume(AudioManager.STREAM_MUSIC) + "}";
        }

        @JavascriptInterface
        public void setVolume(int v) {
            AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
            if (am == null) return;
            int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            am.setStreamVolume(AudioManager.STREAM_MUSIC, Math.max(0, Math.min(max, v)), 0);
        }

        @JavascriptInterface
        public void setBestMode(boolean on) {
            prefs.edit().putBoolean("bestMode", on).apply();
        }

        @JavascriptInterface public boolean bestMode() { return prefs.getBoolean("bestMode", false); }

        // ---- phone
        @JavascriptInterface public boolean hasMediaPermission() { return MainActivity.this.hasMediaPermission(); }

        @JavascriptInterface
        public void askMediaPermission() {
            ui.post(new Runnable() {
                public void run() { MainActivity.this.askMediaPermission(); }
            });
        }

        /** {dev, base, token, items} - the phone's videos and where the TV can fetch them. */
        @JavascriptInterface
        public String library() {
            try {
                MediaServer s = StreamService.ensure(MainActivity.this);
                JSONObject o = new JSONObject();
                String dev = prefs.getString("dev", null);
                if (dev == null) {
                    dev = StreamService.randomToken(10);
                    prefs.edit().putString("dev", dev).apply();
                }
                List<String> ips = Hub.lanAddresses();
                o.put("dev", dev);
                o.put("name", deviceName());
                o.put("port", s == null ? -1 : s.getPort());
                JSONArray ipa = new JSONArray();
                for (String ip : ips) ipa.put(ip);
                o.put("ips", ipa);
                o.put("token", StreamService.token());
                o.put("items", StreamService.media(MainActivity.this).list());
                return o.toString();
            } catch (Exception e) {
                return "{\"items\":[]}";
            }
        }

        /** Looks for TVs on the Wi-Fi for about 2 seconds, then calls HC.onDiscover([...]). */
        @JavascriptInterface
        public void discover() {
            new Thread(new Runnable() {
                public void run() {
                    JSONArray a = new JSONArray();
                    for (String line : Hub.discover(2000)) {
                        String[] p = line.split(" ", 3);
                        try {
                            JSONObject o = new JSONObject();
                            o.put("ip", p[0]);
                            o.put("port", Integer.parseInt(p[1]));
                            o.put("name", p.length > 2 ? p[2] : "TV");
                            a.put(o);
                        } catch (Exception e) {
                            // skip
                        }
                    }
                    js("HC.onDiscover(" + a.toString() + ")");
                }
            }).start();
        }

        @JavascriptInterface
        public boolean onWifi() {
            if (Build.VERSION.SDK_INT < 23) return !Hub.lanAddresses().isEmpty();
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (cm != null) {
                for (Network n : cm.getAllNetworks()) {
                    NetworkCapabilities c = cm.getNetworkCapabilities(n);
                    if (c != null && c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return true;
                }
            }
            return !Hub.lanAddresses().isEmpty();
        }

        @JavascriptInterface
        public void stopSharing() {
            stopService(new Intent(MainActivity.this, StreamService.class));
        }
    }
}
