package com.charlesbita.homecast;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.util.LruCache;
import android.util.Size;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.Locale;

/** The phone's videos (from Android's media library), as files for MediaServer and as a list. */
public class PhoneMedia implements MediaServer.Source {

    /** Folders of social apps: never listed, never served to the TV (matched in any case). */
    private static final String[] HIDDEN_FOLDERS = {"whatsapp", "facebook", "instagram", "tiktok", "tik tok"};

    private final Context ctx;
    private final LruCache<String, byte[]> thumbs = new LruCache<String, byte[]>(12 * 1024 * 1024) {
        @Override
        protected int sizeOf(String key, byte[] value) {
            return value.length;
        }
    };

    public PhoneMedia(Context ctx) {
        this.ctx = ctx.getApplicationContext();
    }

    private static Uri uriOf(String id) {
        return ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, Long.parseLong(id));
    }

    static boolean hiddenFolder(String folder) {
        if (folder == null) return false;
        String f = folder.toLowerCase(Locale.ROOT);
        for (String h : HIDDEN_FOLDERS) if (f.contains(h)) return true;
        return false;
    }

    /** True if the video is in a hidden folder, or cannot be found (unknown files are not served). */
    private boolean hidden(String id) {
        Cursor c = null;
        try {
            c = ctx.getContentResolver().query(uriOf(id), new String[] {MediaStore.Video.Media.BUCKET_DISPLAY_NAME},
                    null, null, null);
            if (c == null || !c.moveToFirst()) return true;
            return hiddenFolder(c.getString(0));
        } catch (Exception e) {
            return true;
        } finally {
            if (c != null) c.close();
        }
    }

    @Override
    public MediaServer.Media open(String id) throws IOException {
        Uri u;
        try {
            u = uriOf(id);
        } catch (NumberFormatException e) {
            return null;
        }
        if (hidden(id)) return null;
        ContentResolver cr = ctx.getContentResolver();
        final ParcelFileDescriptor pfd;
        try {
            pfd = cr.openFileDescriptor(u, "r");
        } catch (Exception e) {
            return null;
        }
        if (pfd == null) return null;
        final FileInputStream in = new FileInputStream(pfd.getFileDescriptor());
        String type = cr.getType(u);
        return new MediaServer.Media(in.getChannel(), pfd.getStatSize(), type != null ? type : "video/mp4", new Closeable() {
            public void close() throws IOException {
                in.close();
                pfd.close();
            }
        });
    }

    @Override
    public byte[] thumb(String id) {
        if (hidden(id)) return null;
        byte[] cached = thumbs.get(id);
        if (cached != null) return cached;
        Bitmap b = null;
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                b = ctx.getContentResolver().loadThumbnail(uriOf(id), new Size(480, 270), null);
            } else {
                b = MediaStore.Video.Thumbnails.getThumbnail(ctx.getContentResolver(), Long.parseLong(id),
                        MediaStore.Video.Thumbnails.MINI_KIND, null);
            }
        } catch (Exception e) {
            b = null;
        }
        if (b == null) return null;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.JPEG, 82, out);
        b.recycle();
        byte[] jpg = out.toByteArray();
        thumbs.put(id, jpg);
        return jpg;
    }

    /** The video list as JSON: [{id, title, folder, dur, w, h, size, date, type}], newest first. */
    public JSONArray list() {
        JSONArray arr = new JSONArray();
        String[] cols = {
            MediaStore.Video.Media._ID, MediaStore.Video.Media.DISPLAY_NAME, MediaStore.Video.Media.TITLE,
            MediaStore.Video.Media.DURATION, MediaStore.Video.Media.SIZE, MediaStore.Video.Media.WIDTH,
            MediaStore.Video.Media.HEIGHT, MediaStore.Video.Media.DATE_ADDED, MediaStore.Video.Media.BUCKET_DISPLAY_NAME,
            MediaStore.Video.Media.MIME_TYPE
        };
        Cursor c = null;
        try {
            c = ctx.getContentResolver().query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, cols, null, null,
                    MediaStore.Video.Media.DATE_ADDED + " DESC");
            if (c == null) return arr;
            while (c.moveToNext() && arr.length() < 3000) {
                JSONObject o = new JSONObject();
                String name = c.getString(1);
                String title = c.getString(2);
                o.put("id", String.valueOf(c.getLong(0)));
                o.put("name", name != null ? name : "");
                o.put("title", title != null && title.length() > 0 ? title : (name != null ? name : "Video"));
                o.put("dur", c.getLong(3));
                o.put("size", c.getLong(4));
                o.put("w", c.getInt(5));
                o.put("h", c.getInt(6));
                o.put("date", c.getLong(7));
                String folder = c.getString(8);
                if (hiddenFolder(folder)) continue;
                o.put("folder", folder != null ? folder : "Videos");
                String type = c.getString(9);
                o.put("type", type != null ? type : "");
                arr.put(o);
            }
        } catch (Exception e) {
            // no permission yet
        } finally {
            if (c != null) c.close();
        }
        return arr;
    }
}
