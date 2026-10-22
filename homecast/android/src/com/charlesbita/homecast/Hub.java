package com.charlesbita.homecast;

import java.io.BufferedInputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.Charset;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The TV's little server on the home network. It is a relay: the TV's own screen (the page in
 * the WebView, connecting over loopback with a secret) and the phones all connect by WebSocket
 * to /ws, and the page decides everything (pairing, what to play, the shared state).
 * Plain Java, no Android classes, so it can be run and tested on a computer.
 *
 * Page to hub (text):   {"hub":"tv","secret":"..."}  first, to become the TV
 *                       "N|{json}" to phone N, "*|{json}" to every paired phone,
 *                       "auth|N" (phone N paired: it now gets "*" messages), "kick|N"
 * Hub to page:          {"from":N,"msg":{json from the phone}}, and for connects/disconnects
 *                       {"from":N,"msg":{"t":"_open","ip":"..."}} / {"t":"_close"}
 * Discovery: phones send the UDP datagram "HOMECAST?" to port DISCOVERY_PORT; the TV answers
 * "HOMECAST <wsPort> <name>".
 */
public class Hub {

    public static final int DISCOVERY_PORT = 8791;
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final String WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    private static final int MAX_MESSAGE = 8 * 1024 * 1024;

    private final String secret;
    private final String name;
    private final Map<Integer, Client> phones = new HashMap<Integer, Client>();
    private final ExecutorService sender = Executors.newSingleThreadExecutor();
    private volatile Client tv;
    private int nextId = 1;
    private ServerSocket server;
    private DatagramSocket udp;
    private volatile boolean running;
    private int port = -1;

    public Hub(String secret, String name) {
        this.secret = secret;
        this.name = name;
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
        daemon("hub-accept", new Runnable() {
            public void run() { acceptLoop(); }
        });
        daemon("hub-discovery", new Runnable() {
            public void run() { discoveryLoop(); }
        });
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
        if (udp != null) udp.close();
        synchronized (phones) {
            for (Client c : phones.values()) c.close();
            phones.clear();
        }
        if (tv != null) tv.close();
        sender.shutdownNow();
    }

    private static void daemon(String name, Runnable r) {
        Thread t = new Thread(r, name);
        t.setDaemon(true);
        t.start();
    }

    // ------------------------------------------------------------------ discovery

    private void discoveryLoop() {
        try {
            udp = new DatagramSocket(null);
            udp.setReuseAddress(true);
            udp.setBroadcast(true);
            udp.bind(new InetSocketAddress(DISCOVERY_PORT));
        } catch (IOException e) {
            return;
        }
        byte[] buf = new byte[256];
        while (running) {
            try {
                DatagramPacket in = new DatagramPacket(buf, buf.length);
                udp.receive(in);
                String q = new String(in.getData(), 0, in.getLength(), UTF8).trim();
                if (!q.equals("HOMECAST?")) continue;
                byte[] reply = ("HOMECAST " + port + " " + name).getBytes(UTF8);
                udp.send(new DatagramPacket(reply, reply.length, in.getAddress(), in.getPort()));
            } catch (IOException e) {
                if (!running) return;
            }
        }
    }

    /** Asks the network for TVs; returns "ip port name" lines. Used by the phone. */
    public static List<String> discover(int waitMs) {
        List<String> found = new ArrayList<String>();
        DatagramSocket s = null;
        try {
            s = new DatagramSocket();
            s.setBroadcast(true);
            s.setSoTimeout(250);
            byte[] q = "HOMECAST?".getBytes(UTF8);
            List<InetAddress> targets = broadcastAddresses();
            targets.add(InetAddress.getByName("255.255.255.255"));
            long end = System.currentTimeMillis() + waitMs;
            int round = 0;
            byte[] buf = new byte[512];
            while (System.currentTimeMillis() < end) {
                if (round++ % 4 == 0) {
                    for (InetAddress a : targets) {
                        try {
                            s.send(new DatagramPacket(q, q.length, a, DISCOVERY_PORT));
                        } catch (IOException e) {
                            // that network can't broadcast
                        }
                    }
                }
                try {
                    DatagramPacket in = new DatagramPacket(buf, buf.length);
                    s.receive(in);
                    String r = new String(in.getData(), 0, in.getLength(), UTF8).trim();
                    if (!r.startsWith("HOMECAST ")) continue;
                    String[] parts = r.split(" ", 3);
                    String line = in.getAddress().getHostAddress() + " " + parts[1] + " " + (parts.length > 2 ? parts[2] : "TV");
                    if (!found.contains(line)) found.add(line);
                } catch (IOException e) {
                    // nothing yet
                }
            }
        } catch (IOException e) {
            // no network
        } finally {
            if (s != null) s.close();
        }
        return found;
    }

    /** Broadcast addresses of the local networks (Wi-Fi, hotspot, Ethernet), not mobile data. */
    static List<InetAddress> broadcastAddresses() {
        List<InetAddress> list = new ArrayList<InetAddress>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback() || !isLanName(ni.getName())) continue;
                for (java.net.InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    if (ia.getAddress() instanceof Inet4Address && ia.getBroadcast() != null) list.add(ia.getBroadcast());
                }
            }
        } catch (Exception e) {
            // no network
        }
        return list;
    }

    static boolean isLanName(String n) {
        return n.startsWith("wlan") || n.startsWith("eth") || n.startsWith("ap") || n.startsWith("swlan")
                || n.startsWith("softap") || n.startsWith("en") || n.startsWith("br");
    }

    /** This device's addresses on local networks (Wi-Fi, hotspot, Ethernet). */
    public static List<String> lanAddresses() {
        List<String> list = new ArrayList<String>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback() || !isLanName(ni.getName())) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) list.add(a.getHostAddress());
                }
            }
        } catch (Exception e) {
            // no network
        }
        return list;
    }

    // ------------------------------------------------------------------ connections

    private void acceptLoop() {
        while (running) {
            try {
                final Socket s = server.accept();
                daemon("hub-client", new Runnable() {
                    public void run() { handle(s); }
                });
            } catch (IOException e) {
                if (!running) return;
            }
        }
    }

    private void handle(Socket s) {
        try {
            s.setTcpNoDelay(true);
            InputStream in = new BufferedInputStream(s.getInputStream());
            OutputStream out = s.getOutputStream();
            String head = readHead(in);
            if (head == null) {
                s.close();
                return;
            }
            String[] lines = head.split("\r\n");
            String[] req = lines[0].split(" ");
            String path = req.length > 1 ? req[1] : "";
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
            byte[] body = ("HomeCast on " + name + ". Open the HomeCast app on your phone to connect.").getBytes(UTF8);
            out.write(("HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: " + body.length
                    + "\r\nConnection: close\r\n\r\n").getBytes(UTF8));
            out.write(body);
            out.flush();
            s.close();
        } catch (IOException e) {
            try {
                s.close();
            } catch (IOException e2) {
                // ignore
            }
        }
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
        boolean loopback = s.getInetAddress().isLoopbackAddress();
        String first;
        try {
            first = readMessage(in, c);
        } catch (IOException e) {
            c.close();
            return;
        }
        if (first == null) {
            c.close();
            return;
        }
        if (loopback && first.startsWith("{\"hub\":\"tv\"") && first.contains("\"secret\":\"" + secret + "\"")) {
            runTv(c, in);
            return;
        }
        synchronized (phones) {
            c.id = nextId++;
            phones.put(c.id, c);
        }
        toTv(c.id, "{\"t\":\"_open\",\"ip\":\"" + s.getInetAddress().getHostAddress() + "\"}");
        try {
            String msg = first;
            while (running && msg != null) {
                if (msg.length() > 0 && msg.charAt(0) == '{') toTv(c.id, msg);
                msg = readMessage(in, c);
            }
        } catch (IOException e) {
            // phone went away
        } finally {
            synchronized (phones) {
                phones.remove(c.id);
            }
            c.close();
            toTv(c.id, "{\"t\":\"_close\"}");
        }
    }

    private void runTv(Client c, InputStream in) {
        Client old = tv;
        tv = c;
        if (old != null) old.close();
        // tell the page who is already here; they must say hello again to the new page
        synchronized (phones) {
            for (Client p : phones.values()) {
                p.paired = false;
                toTv(p.id, "{\"t\":\"_open\",\"ip\":\"" + p.socket.getInetAddress().getHostAddress() + "\"}");
                sendAsync(p, "{\"t\":\"rehello\"}");
            }
        }
        try {
            while (running) {
                String msg = readMessage(in, c);
                if (msg == null) break;
                onTvMessage(msg);
            }
        } catch (IOException e) {
            // page reloaded
        } finally {
            if (tv == c) tv = null;
            c.close();
        }
    }

    private void onTvMessage(String m) {
        int bar = m.indexOf('|');
        if (bar <= 0) return;
        String to = m.substring(0, bar);
        String body = m.substring(bar + 1);
        if (to.equals("*")) {
            List<Client> list = new ArrayList<Client>();
            synchronized (phones) {
                for (Client p : phones.values()) if (p.paired) list.add(p);
            }
            for (Client p : list) sendAsync(p, body);
            return;
        }
        Client p;
        try {
            if (to.equals("auth") || to.equals("kick")) {
                synchronized (phones) {
                    p = phones.get(Integer.parseInt(body.trim()));
                }
                if (p == null) return;
                if (to.equals("auth")) p.paired = true;
                else p.close();
                return;
            }
            synchronized (phones) {
                p = phones.get(Integer.parseInt(to));
            }
        } catch (NumberFormatException e) {
            return;
        }
        if (p != null) sendAsync(p, body);
    }

    private void toTv(int id, String msg) {
        Client t = tv;
        if (t != null) sendAsync(t, "{\"from\":" + id + ",\"msg\":" + msg + "}");
    }

    private void sendAsync(final Client c, final String text) {
        try {
            sender.execute(new Runnable() {
                public void run() { c.sendText(text); }
            });
        } catch (RuntimeException e) {
            // stopped
        }
    }

    /** Reads one whole text message (joining continuation frames); "" for control frames. */
    private static String readMessage(InputStream in, Client c) throws IOException {
        java.io.ByteArrayOutputStream acc = null;
        while (true) {
            int b0 = in.read();
            int b1 = in.read();
            if (b0 < 0 || b1 < 0) return null;
            boolean fin = (b0 & 0x80) != 0;
            int op = b0 & 0x0F;
            boolean masked = (b1 & 0x80) != 0;
            long len = b1 & 0x7F;
            if (len == 126) {
                len = (readByte(in) << 8) | readByte(in);
            } else if (len == 127) {
                len = 0;
                for (int i = 0; i < 8; i++) len = (len << 8) | readByte(in);
            }
            if (len > MAX_MESSAGE) return null;
            byte[] mask = masked ? readFully(in, 4) : null;
            byte[] data = readFully(in, (int) len);
            if (mask != null) {
                for (int i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
            }
            if (op == 8) return null;                                  // close
            if (op == 9) { c.send(0xA, data); if (acc == null) return ""; continue; }   // ping
            if (op == 0xA) { if (acc == null) return ""; continue; }  // pong
            if (acc == null) acc = new java.io.ByteArrayOutputStream();
            acc.write(data);
            if (acc.size() > MAX_MESSAGE) return null;
            if (fin) return new String(acc.toByteArray(), UTF8);
        }
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

    private static final class Client {
        final Socket socket;
        final OutputStream out;
        int id;
        volatile boolean paired;

        Client(Socket socket, OutputStream out) {
            this.socket = socket;
            this.out = out;
        }

        void sendText(String s) {
            send(0x1, s.getBytes(UTF8));
        }

        synchronized void send(int op, byte[] data) {
            try {
                long n = data.length;
                if (n < 126) {
                    out.write(new byte[] {(byte) (0x80 | op), (byte) n});
                } else if (n < 65536) {
                    out.write(new byte[] {(byte) (0x80 | op), 126, (byte) (n >> 8), (byte) n});
                } else {
                    byte[] h = new byte[10];
                    h[0] = (byte) (0x80 | op);
                    h[1] = 127;
                    for (int i = 0; i < 8; i++) h[9 - i] = (byte) (n >> (8 * i));
                    out.write(h);
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
