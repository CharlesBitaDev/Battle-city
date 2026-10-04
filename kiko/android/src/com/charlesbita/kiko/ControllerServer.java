package com.charlesbita.kiko;

import java.io.BufferedInputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.Charset;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * A tiny web server on the TV for the phone controller. It serves the controller page and
 * keeps one WebSocket per phone. Plain Java (no Android classes) so it can be tested anywhere.
 *
 * Phone to TV messages: "join:1" / "join:2" (take a player), "s:N" (buttons held:
 * 1 up, 2 down, 4 left, 8 right, 16 fire), "menu" (pause/back), "p" (keep-alive).
 * TV to phone: "slot:N", "kicked", "mode:game" / "mode:menu", "buzz:MS".
 */
public class ControllerServer {

    public interface Listener {
        void onJoin(int slot, boolean connected);
        void onState(int slot, int bits);
        void onMenu(int slot);
    }

    public interface Assets {
        byte[] read(String name) throws IOException;
    }

    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final String WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

    private final Listener listener;
    private final Assets assets;
    private final Client[] slots = new Client[3];
    private final ExecutorService sender = Executors.newSingleThreadExecutor();
    private ServerSocket server;
    private volatile boolean running;
    private int port = -1;

    public ControllerServer(Listener listener, Assets assets) {
        this.listener = listener;
        this.assets = assets;
    }

    /** Starts on the first free port from firstPort; returns the port or -1. */
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
        }, "controller-accept");
        t.setDaemon(true);
        t.start();
        return port;
    }

    public int getPort() {
        return port;
    }

    public void stop() {
        running = false;
        try {
            if (server != null) server.close();
        } catch (IOException e) {
            // ignore
        }
        synchronized (slots) {
            for (int i = 0; i < slots.length; i++) {
                if (slots[i] != null) slots[i].close();
                slots[i] = null;
            }
        }
        sender.shutdownNow();
    }

    /** Sends a text message to the phone holding a player slot (no-op if none). */
    public void send(final int slot, final String msg) {
        if (slot < 1 || slot > 2) return;
        final Client c;
        synchronized (slots) {
            c = slots[slot];
        }
        if (c == null) return;
        try {
            sender.execute(new Runnable() {
                public void run() { c.sendText(msg); }
            });
        } catch (RuntimeException e) {
            // stopped
        }
    }

    private void acceptLoop() {
        while (running) {
            try {
                final Socket s = server.accept();
                Thread t = new Thread(new Runnable() {
                    public void run() { handle(s); }
                }, "controller-client");
                t.setDaemon(true);
                t.start();
            } catch (IOException e) {
                if (!running) return;
            }
        }
    }

    private void handle(Socket s) {
        try {
            s.setTcpNoDelay(true);
            s.setSoTimeout(10000);
            InputStream in = new BufferedInputStream(s.getInputStream());
            OutputStream out = s.getOutputStream();
            String head = readHead(in);
            if (head == null) {
                s.close();
                return;
            }
            String[] lines = head.split("\r\n");
            String[] req = lines[0].split(" ");
            if (req.length < 2) {
                s.close();
                return;
            }
            String path = req[1];
            int q = path.indexOf('?');
            if (q >= 0) path = path.substring(0, q);
            Map<String, String> h = new HashMap<String, String>();
            for (int i = 1; i < lines.length; i++) {
                int c = lines[i].indexOf(':');
                if (c > 0) h.put(lines[i].substring(0, c).trim().toLowerCase(), lines[i].substring(c + 1).trim());
            }
            String upgrade = h.get("upgrade");
            if ("/ws".equals(path) && upgrade != null && upgrade.equalsIgnoreCase("websocket")) {
                webSocket(s, in, out, h.get("sec-websocket-key"));
                return;
            }
            if ("/".equals(path) || "/index.html".equals(path)) {
                byte[] body = assets.read("web/controller.html");
                respond(out, "200 OK", "text/html; charset=utf-8", body);
            } else {
                respond(out, "404 Not Found", "text/plain", "Not found".getBytes(UTF8));
            }
            s.close();
        } catch (IOException e) {
            try {
                s.close();
            } catch (IOException e2) {
                // ignore
            }
        }
    }

    private static void respond(OutputStream out, String status, String type, byte[] body) throws IOException {
        String head = "HTTP/1.1 " + status + "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.length
                + "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
        out.write(head.getBytes(UTF8));
        out.write(body);
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

    // ------------------------------------------------------------------ WebSocket

    private void webSocket(Socket s, InputStream in, OutputStream out, String key) throws IOException {
        if (key == null) {
            s.close();
            return;
        }
        String accept;
        try {
            MessageDigest sha1 = MessageDigest.getInstance("SHA-1");
            accept = base64(sha1.digest((key + WS_GUID).getBytes(UTF8)));
        } catch (Exception e) {
            s.close();
            return;
        }
        out.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                + "Sec-WebSocket-Accept: " + accept + "\r\n\r\n").getBytes(UTF8));
        out.flush();
        Client c = new Client(s, out);
        try {
            while (running) {
                String msg = readFrame(in, c);
                if (msg == null) break;
                if (msg.length() > 0) onMessage(c, msg);
            }
        } catch (IOException e) {
            // phone went away or stopped sending keep-alives
        } finally {
            drop(c);
            c.close();
        }
    }

    private static String readFrame(InputStream in, Client c) throws IOException {
        int b0 = in.read();
        int b1 = in.read();
        if (b0 < 0 || b1 < 0) return null;
        int op = b0 & 0x0F;
        boolean masked = (b1 & 0x80) != 0;
        long len = b1 & 0x7F;
        if (len == 126) {
            len = (readByte(in) << 8) | readByte(in);
        } else if (len == 127) {
            len = 0;
            for (int i = 0; i < 8; i++) len = (len << 8) | readByte(in);
        }
        if (len > 8192) return null;
        byte[] mask = masked ? readFully(in, 4) : null;
        byte[] data = readFully(in, (int) len);
        if (mask != null) {
            for (int i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
        }
        if (op == 8) return null;                         // close
        if (op == 9) { c.send(0xA, data); return ""; }    // ping -> pong
        if (op == 1 || op == 0) return new String(data, UTF8);
        return "";
    }

    private static int readByte(InputStream in) throws IOException {
        int b = in.read();
        if (b < 0) throw new EOFException();
        return b;
    }

    private static byte[] readFully(InputStream in, int n) throws IOException {
        byte[] buf = new byte[n];
        int off = 0;
        while (off < n) {
            int r = in.read(buf, off, n - off);
            if (r < 0) throw new EOFException();
            off += r;
        }
        return buf;
    }

    private void onMessage(Client c, String msg) {
        if (msg.equals("p")) return;
        if (msg.startsWith("join:")) {
            int slot;
            try {
                slot = Integer.parseInt(msg.substring(5).trim());
            } catch (NumberFormatException e) {
                return;
            }
            if (slot < 1 || slot > 2) return;
            Client old;
            int previous;
            synchronized (slots) {
                previous = (c.slot > 0 && slots[c.slot] == c) ? c.slot : 0;
                if (previous > 0) slots[previous] = null;
                old = slots[slot];
                slots[slot] = c;
                c.slot = slot;
            }
            if (previous > 0 && previous != slot) {
                listener.onState(previous, 0);
                listener.onJoin(previous, false);
            }
            if (old != null && old != c) {
                old.slot = 0;
                old.sendText("kicked");
            }
            listener.onState(slot, 0);
            listener.onJoin(slot, true);
            c.sendText("slot:" + slot);
            return;
        }
        int slot = c.slot;
        if (slot <= 0) return;
        synchronized (slots) {
            if (slots[slot] != c) return;
        }
        if (msg.startsWith("s:")) {
            try {
                listener.onState(slot, Integer.parseInt(msg.substring(2).trim()) & 31);
            } catch (NumberFormatException e) {
                // ignore
            }
        } else if (msg.equals("menu")) {
            listener.onMenu(slot);
        } else if (msg.equals("leave")) {
            drop(c);
        }
    }

    private void drop(Client c) {
        int slot = 0;
        synchronized (slots) {
            if (c.slot > 0 && slots[c.slot] == c) {
                slot = c.slot;
                slots[slot] = null;
            }
            c.slot = 0;
        }
        if (slot > 0) {
            listener.onState(slot, 0);
            listener.onJoin(slot, false);
        }
    }

    private static final class Client {
        final Socket socket;
        final OutputStream out;
        volatile int slot;

        Client(Socket socket, OutputStream out) {
            this.socket = socket;
            this.out = out;
        }

        void sendText(String s) {
            send(0x1, s.getBytes(UTF8));
        }

        synchronized void send(int op, byte[] data) {
            try {
                int n = data.length;
                if (n < 126) {
                    out.write(new byte[] {(byte) (0x80 | op), (byte) n});
                } else {
                    out.write(new byte[] {(byte) (0x80 | op), 126, (byte) (n >> 8), (byte) n});
                }
                out.write(data);
                out.flush();
            } catch (IOException e) {
                close();
            }
        }

        void close() {
            try {
                socket.close();
            } catch (IOException e) {
                // ignore
            }
        }
    }

    // ------------------------------------------------------------------ helpers

    /** The TV's address on the home network, or null. Prefers Wi-Fi/Ethernet. */
    public static String localIp() {
        String best = null;
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                String name = ni.getName();
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || a.isLoopbackAddress()) continue;
                    String ip = a.getHostAddress();
                    boolean main = name.startsWith("wlan") || name.startsWith("eth");
                    if (main && a.isSiteLocalAddress()) return ip;
                    if (best == null || a.isSiteLocalAddress()) best = ip;
                }
            }
        } catch (Exception e) {
            // no network
        }
        return best;
    }

    private static final char[] B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".toCharArray();

    static String base64(byte[] d) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < d.length; i += 3) {
            int b = (d[i] & 0xFF) << 16;
            if (i + 1 < d.length) b |= (d[i + 1] & 0xFF) << 8;
            if (i + 2 < d.length) b |= d[i + 2] & 0xFF;
            sb.append(B64[(b >> 18) & 63]).append(B64[(b >> 12) & 63]);
            sb.append(i + 1 < d.length ? B64[(b >> 6) & 63] : '=');
            sb.append(i + 2 < d.length ? B64[b & 63] : '=');
        }
        return sb.toString();
    }
}
