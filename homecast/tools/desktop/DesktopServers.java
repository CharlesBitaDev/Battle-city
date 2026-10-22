import com.charlesbita.homecast.Hub;
import com.charlesbita.homecast.MediaServer;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Files;

/**
 * Runs the TV hub and a phone video server on a computer, for testing the app's screens in a
 * browser: java DesktopServers <video folder> [secret] [token]
 * Videos are served as /v/<file name>, thumbnails from <name>.jpg next to them.
 */
public class DesktopServers {
    public static void main(String[] args) throws Exception {
        final File dir = new File(args.length > 0 ? args[0] : ".");
        String secret = args.length > 1 ? args[1] : "test";
        String token = args.length > 2 ? args[2] : "testtoken";
        Hub hub = new Hub(secret, "Test TV");
        System.out.println("hub " + hub.start(8790));
        MediaServer ms = new MediaServer(new MediaServer.Source() {
            public MediaServer.Media open(String id) throws IOException {
                if (id.contains("~")) id = id.substring(0, id.indexOf('~'));
                File f = new File(dir, id);
                if (!f.isFile() || id.contains("/")) return null;
                FileInputStream in = new FileInputStream(f);
                return new MediaServer.Media(in.getChannel(), f.length(), MediaServer.typeOf(id, null), in);
            }
            public byte[] thumb(String id) {
                try {
                    if (id.contains("~")) id = id.substring(0, id.indexOf('~'));
                    File f = new File(dir, id + ".jpg");
                    return f.isFile() ? Files.readAllBytes(f.toPath()) : null;
                } catch (IOException e) {
                    return null;
                }
            }
        }, token);
        System.out.println("media " + ms.start(8792));
        System.out.println("lan " + Hub.lanAddresses());
        Thread.sleep(Long.MAX_VALUE);
    }
}
