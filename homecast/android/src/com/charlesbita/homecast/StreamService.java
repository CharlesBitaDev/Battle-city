package com.charlesbita.homecast;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import java.security.SecureRandom;

/**
 * Phone side: keeps the video server running (also with the screen off or the app in the
 * background) while the TV plays the phone's videos, with a notification to stop it.
 * Stops by itself after 20 minutes without the app open and without a video being sent.
 */
public class StreamService extends Service {

    public static final int PORT = 8792;
    private static final String CHANNEL = "sharing";
    private static final String ACTION_STOP = "com.charlesbita.homecast.STOP";
    private static final long IDLE_MS = 20 * 60 * 1000;

    private static MediaServer server;
    private static PhoneMedia media;
    private static String token;
    static volatile boolean appVisible;

    private WifiManager.WifiLock wifiLock;
    private PowerManager.WakeLock wakeLock;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long idleSince = System.currentTimeMillis();

    /** Starts the video server if needed (shared by the service and the app screen). */
    static synchronized MediaServer ensure(Context ctx) {
        if (server == null) {
            media = new PhoneMedia(ctx);
            SharedPreferences p = ctx.getSharedPreferences("homecast", MODE_PRIVATE);
            token = p.getString("token", null);
            if (token == null) {
                token = randomToken(24);
                p.edit().putString("token", token).apply();
            }
            server = new MediaServer(media, token);
            if (server.start(PORT) < 0) server = null;
        }
        return server;
    }

    static synchronized PhoneMedia media(Context ctx) {
        ensure(ctx);
        return media;
    }

    static synchronized String token() {
        return token;
    }

    static String randomToken(int n) {
        String abc = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        SecureRandom r = new SecureRandom();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) sb.append(abc.charAt(r.nextInt(abc.length())));
        return sb.toString();
    }

    @Override
    public void onCreate() {
        super.onCreate();
        ensure(this);
        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm != null) {
            wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "homecast:stream");
            wifiLock.acquire();
        }
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "homecast:stream");
            wakeLock.acquire();
        }
        handler.postDelayed(idleCheck, 60000);
    }

    private final Runnable idleCheck = new Runnable() {
        public void run() {
            MediaServer s = server;
            long now = System.currentTimeMillis();
            boolean busy = appVisible || (s != null && (s.activeStreams() > 0 || now - s.lastRequestAt() < 3 * 60000));
            if (busy) idleSince = now;
            if (now - idleSince > IDLE_MS) {
                stopSelf();
                return;
            }
            handler.postDelayed(this, 60000);
        }
    };

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        Notification n = notification();
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(1, n);
        return START_NOT_STICKY;
    }

    private Notification notification() {
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Sharing videos with the TV", NotificationManager.IMPORTANCE_LOW));
            b = new Notification.Builder(this, CHANNEL);
        } else {
            b = new Notification.Builder(this);
        }
        int pf = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), pf);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, StreamService.class).setAction(ACTION_STOP), pf);
        b.setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle("HomeCast")
                .setContentText("Your TV can play this phone's videos over Wi-Fi")
                .setContentIntent(open)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Stop sharing", stop).build());
        return b.build();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(idleCheck);
        synchronized (StreamService.class) {
            if (server != null) server.stop();
            server = null;
        }
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
