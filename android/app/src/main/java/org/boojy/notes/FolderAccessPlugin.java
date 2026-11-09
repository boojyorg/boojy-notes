package org.boojy.notes;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import android.provider.DocumentsContract.Document;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * A folder the user picks with Android's folder picker, for the notes
 * (src/phone/folderFiles.ts). Each method is one call to Android and decides
 * nothing: a file is named by its document id inside the picked tree, and the
 * page keeps the path → id map, the safe save and every rule.
 *
 * One call per file is about 30 ms here, so the two calls a start makes for
 * every note (`walk`, `readMany`) run on several threads: 500 notes read in
 * about a second, not a quarter of a minute.
 */
@CapacitorPlugin(name = "FolderAccess")
public class FolderAccessPlugin extends Plugin {

    /** The phone's own storage (and its SD card); a cloud app's folders are refused. */
    private static final String DEVICE = "com.android.externalstorage.documents";
    private static final String MISSING = "MISSING";
    private static final int THREADS = 8;
    private static final String[] COLUMNS = {
        Document.COLUMN_DOCUMENT_ID,
        Document.COLUMN_DISPLAY_NAME,
        Document.COLUMN_MIME_TYPE,
        Document.COLUMN_LAST_MODIFIED,
        Document.COLUMN_SIZE
    };

    private ContentResolver resolver() {
        return getContext().getContentResolver();
    }

    private static Uri tree(PluginCall call) {
        return Uri.parse(call.getString("tree"));
    }

    private static Uri doc(Uri tree, String id) {
        return DocumentsContract.buildDocumentUriUsingTree(tree, id);
    }

    /** A file or folder that is not there is its own answer; anything else is an error. */
    private static void fail(PluginCall call, Exception e) {
        Throwable cause = e instanceof ExecutionException && e.getCause() != null ? e.getCause() : e;
        boolean missing =
            cause instanceof FileNotFoundException ||
            (cause instanceof IllegalArgumentException && String.valueOf(cause.getMessage()).contains("Missing file"));
        if (missing) call.reject(String.valueOf(cause), MISSING);
        else call.reject(String.valueOf(cause));
    }

    /**
     * Makes Documents/<name> through MediaStore, which needs no permission,
     * so the picker can open inside it. Answers the folder's document id.
     */
    @PluginMethod
    public void ensureDefault(PluginCall call) {
        String name = call.getString("name");
        JSObject out = new JSObject();
        out.put("initial", "primary:Documents/" + name);
        boolean made = false;
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, "boojy-notes-folder.txt");
                values.put(MediaStore.MediaColumns.MIME_TYPE, "text/plain");
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, "Documents/" + name);
                Uri probe = resolver().insert(MediaStore.Files.getContentUri("external"), values);
                if (probe != null) resolver().delete(probe, null, null);
                made = probe != null;
            } catch (Exception e) {
                made = false;
            }
        }
        out.put("made", made);
        call.resolve(out);
    }

    /** Opens the picker, at `initial` (a document id on the phone's storage) when given. */
    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION |
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        String initial = call.getString("initial");
        if (initial != null && Build.VERSION.SDK_INT >= 26) {
            intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, DocumentsContract.buildDocumentUri(DEVICE, initial));
        }
        startActivityForResult(call, intent, "picked");
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        Intent data = result.getData();
        JSObject out = new JSObject();
        if (data == null || data.getData() == null) {
            out.put("picked", false);
            call.resolve(out);
            return;
        }
        Uri tree = data.getData();
        if (!DEVICE.equals(tree.getAuthority())) {
            out.put("picked", false);
            out.put("refused", "not-on-device");
            call.resolve(out);
            return;
        }
        resolver()
            .takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        out.put("picked", true);
        out.put("tree", tree.toString());
        out.put("root", DocumentsContract.getTreeDocumentId(tree));
        call.resolve(out);
    }

    /** The folders this install holds a read and write grant for. */
    @PluginMethod
    public void persisted(PluginCall call) {
        JSArray trees = new JSArray();
        for (UriPermission p : resolver().getPersistedUriPermissions()) {
            if (!p.isReadPermission() || !p.isWritePermission()) continue;
            if (!DEVICE.equals(p.getUri().getAuthority())) continue;
            JSObject o = new JSObject();
            o.put("tree", p.getUri().toString());
            o.put("root", DocumentsContract.getTreeDocumentId(p.getUri()));
            trees.put(o);
        }
        JSObject out = new JSObject();
        out.put("trees", trees);
        call.resolve(out);
    }

    private List<JSONObject> children(Uri tree, String parent) throws Exception {
        List<JSONObject> entries = new ArrayList<>();
        Uri uri = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parent);
        try (Cursor c = resolver().query(uri, COLUMNS, null, null, null)) {
            if (c == null) throw new FileNotFoundException("no listing for " + parent);
            while (c.moveToNext()) {
                JSONObject e = new JSONObject();
                e.put("id", c.getString(0));
                e.put("name", c.getString(1));
                e.put("dir", Document.MIME_TYPE_DIR.equals(c.getString(2)));
                e.put("mtime", c.getLong(3));
                e.put("size", c.getLong(4));
                entries.add(e);
            }
        }
        return entries;
    }

    /** One folder's entries. */
    @PluginMethod
    public void list(PluginCall call) {
        try {
            JSArray entries = new JSArray();
            for (JSONObject e : children(tree(call), call.getString("id"))) entries.put(e);
            JSObject out = new JSObject();
            out.put("entries", entries);
            call.resolve(out);
        } catch (Exception e) {
            fail(call, e);
        }
    }

    /**
     * Everything under a folder in one call, a level at a time, each level's
     * folders asked together. An entry carries `path`, relative to the folder.
     * A folder whose name starts with a dot is listed and not entered.
     */
    @PluginMethod
    public void walk(PluginCall call) {
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        try {
            Uri tree = tree(call);
            JSArray all = new JSArray();
            List<String[]> level = new ArrayList<>();
            level.add(new String[] { call.getString("id"), "" });
            while (!level.isEmpty()) {
                List<Future<List<JSONObject>>> asked = new ArrayList<>();
                for (String[] dir : level) asked.add(pool.submit(() -> children(tree, dir[0])));
                List<String[]> next = new ArrayList<>();
                for (int d = 0; d < level.size(); d++) {
                    String path = level.get(d)[1];
                    for (JSONObject e : asked.get(d).get()) {
                        String name = e.getString("name");
                        String at = path.isEmpty() ? name : path + "/" + name;
                        e.put("path", at);
                        all.put(e);
                        if (e.getBoolean("dir") && !name.startsWith(".")) next.add(new String[] { e.getString("id"), at });
                    }
                }
                level = next;
            }
            JSObject out = new JSObject();
            out.put("entries", all);
            call.resolve(out);
        } catch (Exception e) {
            fail(call, e);
        } finally {
            pool.shutdown();
        }
    }

    private byte[] readBytes(Uri uri) throws Exception {
        try (InputStream in = resolver().openInputStream(uri)) {
            if (in == null) throw new FileNotFoundException(String.valueOf(uri));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[16384];
            int n;
            while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            return out.toByteArray();
        }
    }

    /** Many files in one call, base64; null for one that is gone. */
    @PluginMethod
    public void readMany(PluginCall call) {
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        try {
            Uri tree = tree(call);
            JSONArray ids = call.getArray("ids");
            List<Future<String>> asked = new ArrayList<>();
            for (int i = 0; i < ids.length(); i++) {
                String id = ids.getString(i);
                asked.add(
                    pool.submit(() -> {
                        try {
                            return Base64.encodeToString(readBytes(doc(tree, id)), Base64.NO_WRAP);
                        } catch (FileNotFoundException gone) {
                            return null;
                        }
                    })
                );
            }
            JSArray data = new JSArray();
            for (Future<String> f : asked) {
                String one = f.get();
                data.put(one == null ? JSONObject.NULL : one);
            }
            JSObject out = new JSObject();
            out.put("data", data);
            call.resolve(out);
        } catch (Exception e) {
            fail(call, e);
        } finally {
            pool.shutdown();
        }
    }

    private void writeBytes(Uri uri, byte[] bytes) throws Exception {
        try (
            ParcelFileDescriptor pfd = resolver().openFileDescriptor(uri, "wt");
            FileOutputStream out = new FileOutputStream(pfd.getFileDescriptor())
        ) {
            out.write(bytes);
            out.flush();
            out.getFD().sync();
        }
    }

    private JSObject described(Uri made) {
        JSObject out = new JSObject();
        out.put("id", DocumentsContract.getDocumentId(made));
        try (Cursor c = resolver().query(made, new String[] { Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) out.put("name", c.getString(0));
        }
        return out;
    }

    /**
     * A new file (holding `data`) or folder (`dir`) under `parent`. Android
     * picks another name when this one is taken, so the answer carries the
     * name it got.
     */
    @PluginMethod
    public void create(PluginCall call) {
        try {
            Uri tree = tree(call);
            boolean dir = Boolean.TRUE.equals(call.getBoolean("dir", false));
            Uri made = DocumentsContract.createDocument(
                resolver(),
                doc(tree, call.getString("parent")),
                dir ? Document.MIME_TYPE_DIR : "application/octet-stream",
                call.getString("name")
            );
            if (made == null) {
                call.reject("createDocument answered nothing");
                return;
            }
            String data = call.getString("data");
            if (!dir && data != null) writeBytes(made, Base64.decode(data, Base64.NO_WRAP));
            call.resolve(described(made));
        } catch (Exception e) {
            fail(call, e);
        }
    }

    /** A file's bytes replaced where it is, flushed to the disk. Not whole-or-nothing on its own. */
    @PluginMethod
    public void write(PluginCall call) {
        try {
            writeBytes(doc(tree(call), call.getString("id")), Base64.decode(call.getString("data"), Base64.NO_WRAP));
            call.resolve();
        } catch (Exception e) {
            fail(call, e);
        }
    }

    /** Within its folder. Android picks another name when this one is taken: see the answer's. */
    @PluginMethod
    public void rename(PluginCall call) {
        try {
            Uri renamed = DocumentsContract.renameDocument(resolver(), doc(tree(call), call.getString("id")), call.getString("name"));
            if (renamed == null) {
                call.reject("renameDocument answered nothing");
                return;
            }
            call.resolve(described(renamed));
        } catch (Exception e) {
            fail(call, e);
        }
    }

    /** To another folder of the same tree, its name kept. */
    @PluginMethod
    public void move(PluginCall call) {
        try {
            Uri tree = tree(call);
            Uri moved = DocumentsContract.moveDocument(
                resolver(),
                doc(tree, call.getString("id")),
                doc(tree, call.getString("from")),
                doc(tree, call.getString("to"))
            );
            if (moved == null) {
                call.reject("moveDocument answered nothing");
                return;
            }
            call.resolve(described(moved));
        } catch (Exception e) {
            fail(call, e);
        }
    }

    /** A file, or a folder with everything in it: the page checks a folder is empty first. */
    @PluginMethod
    public void remove(PluginCall call) {
        try {
            if (!DocumentsContract.deleteDocument(resolver(), doc(tree(call), call.getString("id")))) {
                call.reject("deleteDocument answered false");
                return;
            }
            call.resolve();
        } catch (Exception e) {
            fail(call, e);
        }
    }
}
