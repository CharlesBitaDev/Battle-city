package com.charlesbita.homecast;

import java.io.BufferedInputStream;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.Charset;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The phone's video server: sends the original video files (with byte ranges, so the TV can
 * seek) and small thumbnails to the TV over the local network. Every request must carry the
 * secret token (?k=...). Nothing is re-encoded. Plain Java, so it can be tested on a computer.
 *
 *   GET|HEAD /v/<id>?k=TOKEN   the video file
 *   GET      /t/<id>?k=TOKEN   a JPEG thumbnail
 */
public class MediaServer {

    /** Where the files come from (the phone's media library, or a folder in tests). */
    public interface Source {
        /** Opens a video by id, or returns null. */
        Media open(String id) throws IOException;
        /** A JPEG thumbnail, or null. */
        byte[] thumb(String id);
    }

    public static final class Media {
        final FileChannel channel;
        final long length;
        final String type;
        final Closeable owner;

        public Media(FileChannel channel, long length, String type, Closeable owner) {
            this.channel = channel;
            this.length = length;
            this.type = type;
            this.owner = owner;
        }
    }

    private static final Charset UTF8 = Charset.forName("UTF-8");

    private final Source source;
    private final String token;
    private final AtomicInteger active = new AtomicInteger();
    private ServerSocket server;
    private volatile boolean running;
    private int port = -1;

    public MediaServer(Source source, String token) {
        this.source = source;
        this.token = token;
    }

    public synchronized int start(int firstPort) {
        for (int p = firstPort; p < firstPort + 10 && server == null; p++) {
            try {
                ServerSocket s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new InetSocketAddress(p));
                server = s;
                port = p;
            } catch (IOException e) {
                // try the next port
            }
        }
        if (server == null) return -1;
        running = true;
        Thread t = new Thread(new Runnable() {
            public void run() { acceptLoop(); }
        }, "media-accept");
        t.setDaemon(true);
        t.start();
        return port;
    }

    public int getPort() {
        return port;
    }

    /** Number of videos being sent right now. */
    public int activeStreams() {
        return active.get();
    }

    public void stop() {
        running = false;
        try {
            if (server != null) server.close();
        } catch (IOException e) {
            // ignore
        }
    }

    private void acceptLoop() {
        while (running) {
            try {
                final Socket s = server.accept();
                Thread t = new Thread(new Runnable() {
                    public void run() { handle(s); }
                }, "media-client");
                t.setDaemon(true);
                t.start();
            } catch (IOException e) {
                if (!running) return;
            }
        }
    }

    private void handle(Socket s) {
        Media m = null;
        try {
            s.setSoTimeout(60000);
            // a deep send buffer rides out short Wi-Fi dips instead of starving the TV's player
            s.setSendBufferSize(1024 * 1024);
            InputStream in = new BufferedInputStream(s.getInputStream());
            OutputStream out = s.getOutputStream();
            String head = readHead(in);
            if (head == null) return;
            String[] lines = head.split("\r\n");
            String[] req = lines[0].split(" ");
            if (req.length < 2) return;
            String method = req[0];
            String path = req[1], query = "";
            int q = path.indexOf('?');
            if (q >= 0) {
                query = path.substring(q + 1);
                path = path.substring(0, q);
            }
            String range = null;
            for (int i = 1; i < lines.length; i++) {
                if (lines[i].toLowerCase().startsWith("range:")) range = lines[i].substring(6).trim();
            }
            if (!tokenOk(query)) {
                simple(out, "403 Forbidden", "Forbidden");
                return;
            }
            if (path.startsWith("/t/")) {
                byte[] jpg = source.thumb(decode(path.substring(3)));
                if (jpg == null) simple(out, "404 Not Found", "No thumbnail");
                else {
                    out.write(("HTTP/1.1 200 OK\r\nContent-Type: image/jpeg\r\nContent-Length: " + jpg.length
                            + "\r\nCache-Control: max-age=86400\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n").getBytes(UTF8));
                    out.write(jpg);
                    out.flush();
                }
                return;
            }
            if (!path.startsWith("/v/")) {
                simple(out, "404 Not Found", "Not found");
                return;
            }
            m = source.open(decode(path.substring(3)));
            if (m == null) {
                simple(out, "404 Not Found", "No such video");
                return;
            }
            long start = 0, end = m.length - 1;
            boolean partial = false;
            if (range != null && range.startsWith("bytes=") && m.length > 0) {
                String r = range.substring(6);
                int comma = r.indexOf(',');
                if (comma >= 0) r = r.substring(0, comma);
                int dash = r.indexOf('-');
                try {
                    if (dash == 0) {                          // last N bytes
                        long n = Long.parseLong(r.substring(1).trim());
                        start = Math.max(0, m.length - n);
                    } else if (dash > 0) {
                        start = Long.parseLong(r.substring(0, dash).trim());
                        String e = r.substring(dash + 1).trim();
                        if (e.length() > 0) end = Math.min(end, Long.parseLong(e));
                    }
                    partial = true;
                } catch (NumberFormatException e) {
                    partial = false;
                }
                if (partial && (start >= m.length || start > end)) {
                    out.write(("HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */" + m.length
                            + "\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").getBytes(UTF8));
                    out.flush();
                    return;
                }
            }
            long len = end - start + 1;
            StringBuilder h = new StringBuilder();
            h.append(partial ? "HTTP/1.1 206 Partial Content\r\n" : "HTTP/1.1 200 OK\r\n");
            h.append("Content-Type: ").append(m.type).append("\r\n");
            h.append("Accept-Ranges: bytes\r\n");
            h.append("Content-Length: ").append(len).append("\r\n");
            if (partial) h.append("Content-Range: bytes ").append(start).append('-').append(end).append('/').append(m.length).append("\r\n");
            h.append("Access-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n");
            out.write(h.toString().getBytes(UTF8));
            if (!method.equals("HEAD")) {
                active.incrementAndGet();
                try {
                    send(m.channel, start, len, out);
                } finally {
                    active.decrementAndGet();
                }
            }
            out.flush();
        } catch (IOException e) {
            // the TV stopped reading (seek, stop) - normal
        } finally {
            if (m != null) {
                try {
                    m.owner.close();
                } catch (IOException e) {
                    // ignore
                }
            }
            try {
                s.close();
            } catch (IOException e) {
                // ignore
            }
        }
    }

    private static void send(FileChannel ch, long start, long len, OutputStream out) throws IOException {
        ByteBuffer buf = ByteBuffer.allocate(256 * 1024);
        long pos = start, left = len;
        while (left > 0) {
            buf.clear();
            if (left < buf.capacity()) buf.limit((int) left);
            int n = ch.read(buf, pos);
            if (n <= 0) break;
            out.write(buf.array(), 0, n);
            pos += n;
            left -= n;
        }
    }

    private boolean tokenOk(String query) {
        String k = null;
        for (String part : query.split("&")) {
            if (part.startsWith("k=")) k = part.substring(2);
        }
        if (k == null || k.length() != token.length()) return false;
        int diff = 0;
        for (int i = 0; i < k.length(); i++) diff |= k.charAt(i) ^ token.charAt(i);
        return diff == 0;
    }

    private static String decode(String s) {
        try {
            return URLDecoder.decode(s, "UTF-8");
        } catch (Exception e) {
            return s;
        }
    }

    private static void simple(OutputStream out, String status, String text) throws IOException {
        byte[] b = text.getBytes(UTF8);
        out.write(("HTTP/1.1 " + status + "\r\nContent-Type: text/plain\r\nContent-Length: " + b.length
                + "\r\nConnection: close\r\n\r\n").getBytes(UTF8));
        out.write(b);
        out.flush();
    }

    private static String readHead(InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder();
        int state = 0;
        while (sb.length() < 16384) {
            int b = in.read();
            if (b < 0) return null;
            sb.append((char) b);
            if (b == '\r' && (state == 0 || state == 2)) state++;
            else if (b == '\n' && (state == 1 || state == 3)) state++;
            else state = 0;
            if (state == 4) return sb.toString();
        }
        return null;
    }

    /** MIME type from a file name; the TV's player sniffs the real format anyway. */
    public static String typeOf(String name, String fallback) {
        String n = name.toLowerCase();
        if (n.endsWith(".mp4") || n.endsWith(".m4v") || n.endsWith(".mov")) return "video/mp4";
        if (n.endsWith(".mkv")) return "video/x-matroska";
        if (n.endsWith(".webm")) return "video/webm";
        if (n.endsWith(".ts") || n.endsWith(".m2ts")) return "video/mp2t";
        if (n.endsWith(".3gp")) return "video/3gpp";
        if (n.endsWith(".avi")) return "video/x-msvideo";
        return fallback != null ? fallback : "application/octet-stream";
    }
}
