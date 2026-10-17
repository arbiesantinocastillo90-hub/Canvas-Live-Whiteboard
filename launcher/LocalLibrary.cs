using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

// Fixed local application storage only. Request data never becomes a file path.
internal sealed class LocalLibrary
{
    private const int MaxBody = 16 * 1024 * 1024;
    private const int MaxLibrary = 128 * 1024 * 1024;
    private readonly object gate = new object();
    private readonly string folder;
    private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = MaxLibrary, RecursionLimit = 64 };
    private Dictionary<string, object> entries;

    internal LocalLibrary(string directory) { folder = Path.GetFullPath(directory); }

    private static void Ordinary(string path)
    {
        for (string current = Path.GetFullPath(path); !String.IsNullOrEmpty(current); current = Path.GetDirectoryName(current))
            if ((File.Exists(current) || Directory.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new IOException("Local library folders must not contain links.");
    }
    private void Load()
    {
        if (entries != null) return;
        Ordinary(folder);
        string file = Path.Combine(folder, "library.json");
        Ordinary(file);
        if (!File.Exists(file)) { entries = new Dictionary<string, object>(StringComparer.Ordinal); return; }
        if (new FileInfo(file).Length > MaxLibrary) throw new IOException("The local library is too large.");
        var root = json.DeserializeObject(File.ReadAllText(file, Encoding.UTF8)) as Dictionary<string, object>;
        if (root == null || !root.ContainsKey("version") || Convert.ToInt32(root["version"], CultureInfo.InvariantCulture) != 1 || !root.ContainsKey("entries")) throw new IOException("The local library is invalid; its saved file was retained.");
        var loaded = root["entries"] as Dictionary<string, object>;
        if (loaded == null || loaded.Count > 2000) throw new IOException("The local library is invalid; its saved file was retained.");
        foreach (var item in loaded)
        {
            var entry = item.Value as Dictionary<string, object>;
            if (!Regex.IsMatch(item.Key, "^(file|metadata|sessions|latest|view|settings):[A-Za-z0-9_-]{1,280}$") || entry == null || !entry.ContainsKey("revision") || !entry.ContainsKey("value") || !(entry["value"] is Dictionary<string, object>) || Convert.ToInt64(entry["revision"], CultureInfo.InvariantCulture) < 1)
                throw new IOException("The local library is invalid; its saved file was retained.");
        }
        entries = loaded;
    }
    private void Persist(Dictionary<string, object> next)
    {
        Ordinary(folder);
        Directory.CreateDirectory(folder);
        string target = Path.Combine(folder, "library.json"), backup = Path.Combine(folder, "library.previous.json");
        Ordinary(target); Ordinary(backup);
        byte[] bytes = new UTF8Encoding(false, true).GetBytes(json.Serialize(new Dictionary<string, object> { { "version", 1 }, { "entries", next } }));
        if (bytes.Length > MaxLibrary) throw new IOException("The local library is full. Export your projects before adding more.");
        string temporary = Path.Combine(folder, "library-" + Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 8192, FileOptions.WriteThrough)) { file.Write(bytes, 0, bytes.Length); file.Flush(true); }
            if (File.Exists(target)) File.Replace(temporary, target, backup); else File.Move(temporary, target);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    private static void Reply(Stream stream, int code, string reason, object value, JavaScriptSerializer serializer)
    {
        byte[] body = Encoding.UTF8.GetBytes(serializer.Serialize(value));
        byte[] header = Encoding.ASCII.GetBytes("HTTP/1.1 " + code + " " + reason + "\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: " + body.Length + "\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n");
        stream.Write(header, 0, header.Length); stream.Write(body, 0, body.Length);
    }
    internal bool Serve(Stream stream, string method, string rawTarget, string[] lines, string origin)
    {
        string path = rawTarget.Split('?')[0];
        const string prefix = "/__canvas_live_library";
        if (path != prefix && !path.StartsWith(prefix + "/", StringComparison.Ordinal)) return false;
        try
        {
            var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (int i = 1; i < lines.Length; i++)
            {
                int separator = lines[i].IndexOf(':'); if (separator < 1) continue;
                string name = lines[i].Substring(0, separator).Trim();
                if (headers.ContainsKey(name)) { Reply(stream, 400, "Bad Request", new { error = "Duplicate request header." }, json); return true; }
                headers[name] = lines[i].Substring(separator + 1).Trim();
            }
            // Drain ordinary bounded PUT bodies before rejecting headers or revisions.
            // Closing a socket with unread bytes can reset it and hide the JSON error.
            byte[] bytes = null;
            if (method == "PUT")
            {
                string rawLength;
                int length;
                if (headers.ContainsKey("Transfer-Encoding") || !headers.TryGetValue("Content-Length", out rawLength) || !Int32.TryParse(rawLength, NumberStyles.None, CultureInfo.InvariantCulture, out length) || length < 2 || length > MaxBody) { Reply(stream, 413, "Payload Too Large", new { error = "The saved item exceeds its size limit." }, json); return true; }
                bytes = new byte[length];
                for (int read = 0; read < length;) { int count = stream.Read(bytes, read, length - read); if (count == 0) throw new IOException("The saved item was incomplete."); read += count; }
            }
            string source;
            if ((headers.TryGetValue("Origin", out source) && source != origin) || (headers.TryGetValue("Sec-Fetch-Site", out source) && source == "cross-site"))
            { Reply(stream, 403, "Forbidden", new { error = "Only Canvas Live can access its local library." }, json); return true; }
            lock (gate)
            {
                Load();
                if (method == "GET" && path == prefix) { Reply(stream, 200, "OK", new { version = 1, entries = entries }, json); return true; }
                string key = path.Length > prefix.Length + 1 ? Uri.UnescapeDataString(path.Substring(prefix.Length + 1)) : "";
                if (!Regex.IsMatch(key, "^(file|metadata|sessions|latest|view|settings):[A-Za-z0-9_-]{1,280}$")) { Reply(stream, 400, "Bad Request", new { error = "Invalid library identifier." }, json); return true; }
                object existing;
                var entry = entries.TryGetValue(key, out existing) ? existing as Dictionary<string, object> : null;
                long revision = entry == null ? 0 : Convert.ToInt64(entry["revision"], CultureInfo.InvariantCulture);
                if (method == "GET") { Reply(stream, 200, "OK", entry ?? new Dictionary<string, object> { { "revision", 0 }, { "value", null } }, json); return true; }
                if (method != "PUT") { Reply(stream, 405, "Method Not Allowed", new { error = "Use GET or PUT." }, json); return true; }
                string match;
                long expected;
                if (!headers.TryGetValue("If-Match", out match) || !Int64.TryParse(match, NumberStyles.None, CultureInfo.InvariantCulture, out expected)) { Reply(stream, 428, "Precondition Required", new { error = "A library revision is required." }, json); return true; }
                if (expected != revision) { Reply(stream, 409, "Conflict", new { error = "This item changed in another view. Reload it before saving." }, json); return true; }
                string contentType;
                if (!headers.TryGetValue("Content-Type", out contentType) || !contentType.StartsWith("application/json", StringComparison.OrdinalIgnoreCase) || headers.ContainsKey("Transfer-Encoding")) { Reply(stream, 415, "Unsupported Media Type", new { error = "Use bounded JSON content." }, json); return true; }
                var value = json.DeserializeObject(new UTF8Encoding(false, true).GetString(bytes)) as Dictionary<string, object>;
                if (value == null || value.ContainsKey("__proto__") || value.ContainsKey("constructor")) { Reply(stream, 400, "Bad Request", new { error = "Invalid saved item." }, json); return true; }
                var updated = new Dictionary<string, object> { { "revision", revision + 1 }, { "value", value } };
                var next = new Dictionary<string, object>(entries, StringComparer.Ordinal); next[key] = updated;
                if (next.Count > 2000) throw new IOException("The local library has reached its item limit.");
                Persist(next); entries = next;
                Reply(stream, 200, "OK", updated, json);
            }
        }
        catch (ArgumentException) { Reply(stream, 400, "Bad Request", new { error = "The saved item is invalid JSON." }, json); }
        catch (InvalidOperationException) { Reply(stream, 400, "Bad Request", new { error = "The saved item is invalid JSON." }, json); }
        catch (Exception) { Reply(stream, 503, "Service Unavailable", new { error = "The local library could not save or open this item. Existing data was retained." }, json); }
        return true;
    }
}
