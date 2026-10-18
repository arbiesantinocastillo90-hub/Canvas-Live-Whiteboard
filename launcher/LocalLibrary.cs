using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Security.Cryptography;
using System.Web.Script.Serialization;

// Fixed local application storage only. Request data never becomes a file path.
internal sealed class LocalLibrary
{
    private const int MaxBody = 16 * 1024 * 1024;
    private const int MaxLibrary = 128 * 1024 * 1024;
    private readonly object gate = new object();
    private readonly object assetGate = new object();
    private const int MaxImage = 20 * 1024 * 1024;
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
    // Large immutable raster records live separately from rapidly changing view metadata.
    private static bool IsAsset(string key) { return key.StartsWith("settings:YXNzZXQt", StringComparison.Ordinal); }
    private string AssetPath(string key)
    {
        byte[] digest;
        using (SHA256 hash = SHA256.Create()) digest = hash.ComputeHash(Encoding.UTF8.GetBytes(key));
        return Path.Combine(folder, "appearance", BitConverter.ToString(digest).Replace("-", "").ToLowerInvariant() + ".json");
    }
    private Dictionary<string, object> ReadAsset(string key)
    {
        string path = AssetPath(key); Ordinary(path);
        if (!File.Exists(path)) return null;
        if (new FileInfo(path).Length > 4 * 1024 * 1024) throw new IOException("The local image exceeds its size limit.");
        var entry = new JavaScriptSerializer { MaxJsonLength = MaxLibrary, RecursionLimit = 64 }.DeserializeObject(File.ReadAllText(path, Encoding.UTF8)) as Dictionary<string, object>;
        if (entry == null || !entry.ContainsKey("revision") || !entry.ContainsKey("value") || !(entry["value"] is Dictionary<string, object>) || Convert.ToInt64(entry["revision"], CultureInfo.InvariantCulture) < 1) throw new IOException("The local image is invalid; its file was retained.");
        return entry;
    }
    private void PersistAsset(string key, Dictionary<string, object> entry)
    {
        string target = AssetPath(key), directory = Path.GetDirectoryName(target);
        Ordinary(directory); Ordinary(target);
        Directory.CreateDirectory(directory);
        if (!File.Exists(target) && Directory.GetFiles(directory, "*.json").Length >= 1000) throw new IOException("The local image library is full.");
        byte[] bytes = new UTF8Encoding(false, true).GetBytes(json.Serialize(entry));
        if (bytes.Length > 4 * 1024 * 1024) throw new IOException("The local image exceeds its size limit.");
        string temporary = Path.Combine(directory, "image-" + Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 8192, FileOptions.WriteThrough)) { file.Write(bytes, 0, bytes.Length); file.Flush(true); }
            if (File.Exists(target)) File.Replace(temporary, target, null); else File.Move(temporary, target);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    private static string RasterMime(byte[] bytes)
    {
        if (bytes.Length >= 24 && bytes[0] == 137 && bytes[1] == 80 && bytes[2] == 78 && bytes[3] == 71 && bytes[4] == 13 && bytes[5] == 10 && bytes[6] == 26 && bytes[7] == 10) return "image/png";
        if (bytes.Length >= 14 && bytes[0] == 71 && bytes[1] == 73 && bytes[2] == 70 && bytes[3] == 56 && (bytes[4] == 55 || bytes[4] == 57) && bytes[5] == 97) return "image/gif";
        if (bytes.Length >= 4 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255 && bytes[bytes.Length - 2] == 255 && bytes[bytes.Length - 1] == 217) return "image/jpeg";
        if (bytes.Length >= 16 && bytes[0] == 82 && bytes[1] == 73 && bytes[2] == 70 && bytes[3] == 70 && bytes[8] == 87 && bytes[9] == 69 && bytes[10] == 66 && bytes[11] == 80) return "image/webp";
        throw new ArgumentException("Only PNG, JPEG, WebP and GIF images are supported.");
    }
    private static string ImageHash(byte[] bytes)
    {
        using (SHA256 hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
    }
    private string BinaryAssetPath(string id) { return Path.Combine(folder, "appearance", id + ".image"); }
    private void PersistBinary(string id, byte[] bytes)
    {
        string target = BinaryAssetPath(id), directory = Path.GetDirectoryName(target);
        Ordinary(directory); Ordinary(target);
        Directory.CreateDirectory(directory);
        if (File.Exists(target)) return;
        int count = 0;
        foreach (string ignored in Directory.EnumerateFiles(directory, "*.image")) if (++count >= 1000) throw new IOException("The local image library is full.");
        string temporary = Path.Combine(directory, "image-" + Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, FileOptions.WriteThrough)) { file.Write(bytes, 0, bytes.Length); file.Flush(true); }
            File.Move(temporary, target);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    private bool ServeBinary(Stream stream, string method, string path, Dictionary<string, string> headers, string origin)
    {
        const string prefix = "/__canvas_live_library/assets/";
        if (!path.StartsWith(prefix, StringComparison.Ordinal)) return false;
        // Asset transfers never hold the frequently polled document-library lock.
        var serializer = new JavaScriptSerializer { MaxJsonLength = MaxLibrary, RecursionLimit = 64 };
        string id = path.Substring(prefix.Length), source;
        if (!Regex.IsMatch(id, "^[a-f0-9]{64}$")) { Reply(stream, 400, "Bad Request", new { error = "Invalid image identifier." }, serializer); return true; }
        if ((headers.TryGetValue("Origin", out source) && source != origin) || (headers.TryGetValue("Sec-Fetch-Site", out source) && source == "cross-site"))
        { Reply(stream, 403, "Forbidden", new { error = "Only Canvas Live can access its local images." }, serializer); return true; }
        if (method == "PUT")
        {
            string rawLength, contentType; int length;
            if (headers.ContainsKey("Transfer-Encoding") || !headers.TryGetValue("Content-Length", out rawLength) || !Int32.TryParse(rawLength, NumberStyles.None, CultureInfo.InvariantCulture, out length) || length < 1 || length > MaxImage)
            { Reply(stream, 413, "Payload Too Large", new { error = "Choose an image of 20 MB or smaller." }, serializer); return true; }
            byte[] bytes = new byte[length];
            for (int read = 0; read < length;) { int count = stream.Read(bytes, read, length - read); if (count == 0) throw new IOException("The image was incomplete."); read += count; }
            string mime = RasterMime(bytes);
            if (!headers.TryGetValue("Content-Type", out contentType) || contentType != mime || ImageHash(bytes) != id)
            { Reply(stream, 400, "Bad Request", new { error = "The image contents do not match their identifier or type." }, serializer); return true; }
            lock (assetGate) { PersistBinary(id, bytes); }
            Reply(stream, 200, "OK", new { assetId = id }, serializer); return true;
        }
        if (method != "GET") { Reply(stream, 405, "Method Not Allowed", new { error = "Use GET or PUT." }, serializer); return true; }
        string target = BinaryAssetPath(id); Ordinary(target);
        if (!File.Exists(target))
        {
            lock (assetGate)
            {
                // Read old installations' JSON assets once, then serve the binary file.
                string key = "settings:" + Convert.ToBase64String(Encoding.UTF8.GetBytes("asset-" + id)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
                var entry = ReadAsset(key);
                var value = entry == null ? null : entry["value"] as Dictionary<string, object>;
                object raw;
                if (value == null || !value.TryGetValue("dataURL", out raw) || !(raw is string))
                { Reply(stream, 404, "Not Found", new { error = "The image is unavailable on this device." }, serializer); return true; }
                string data = (string)raw; int separator = data.IndexOf(',');
                if (separator < 0 || !data.StartsWith("data:image/", StringComparison.Ordinal)) throw new ArgumentException("Invalid saved image.");
                byte[] bytes = Convert.FromBase64String(data.Substring(separator + 1));
                if (bytes.Length > MaxImage || data.Substring(0, separator) != "data:" + RasterMime(bytes) + ";base64" || ImageHash(bytes) != id) throw new ArgumentException("Invalid saved image.");
                PersistBinary(id, bytes);
            }
        }
        using (var file = new FileStream(target, FileMode.Open, FileAccess.Read, FileShare.Read, 65536, FileOptions.SequentialScan))
        {
            if (file.Length < 1 || file.Length > MaxImage) throw new IOException("Invalid saved image size.");
            // Inspect the bounded image header; JPEG also has an end marker.
            byte[] signature = new byte[(int)Math.Min(file.Length, 24)]; file.Read(signature, 0, signature.Length);
            string mime;
            if (signature.Length >= 4 && signature[0] == 255 && signature[1] == 216 && signature[2] == 255)
            {
                file.Position = file.Length - 2; int a = file.ReadByte(), b = file.ReadByte();
                if (a != 255 || b != 217) throw new ArgumentException("Invalid saved image.");
                mime = "image/jpeg";
            }
            else mime = RasterMime(signature);
            string match;
            bool unchanged = headers.TryGetValue("If-None-Match", out match) && match == "\"" + id + "\"";
            string header = "HTTP/1.1 " + (unchanged ? "304 Not Modified" : "200 OK") + "\r\nContent-Type: " + mime + "\r\nContent-Length: " + (unchanged ? 0 : file.Length) + "\r\nConnection: close\r\nCache-Control: private, max-age=31536000, immutable\r\nETag: \"" + id + "\"\r\nX-Content-Type-Options: nosniff\r\n\r\n";
            byte[] head = Encoding.ASCII.GetBytes(header); stream.Write(head, 0, head.Length);
            if (!unchanged) { file.Position = 0; file.CopyTo(stream, 65536); }
        }
        return true;
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
            if (ServeBinary(stream, method, path, headers, origin)) return true;
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
                if (method == "GET" && path == prefix) {
                    var index = new Dictionary<string, object>(StringComparer.Ordinal);
                    foreach (var item in entries) if (!IsAsset(item.Key)) index[item.Key] = item.Value;
                    Reply(stream, 200, "OK", new { version = 1, entries = index }, json); return true;
                }
                string key = path.Length > prefix.Length + 1 ? Uri.UnescapeDataString(path.Substring(prefix.Length + 1)) : "";
                if (!Regex.IsMatch(key, "^(file|metadata|sessions|latest|view|settings):[A-Za-z0-9_-]{1,280}$")) { Reply(stream, 400, "Bad Request", new { error = "Invalid library identifier." }, json); return true; }
                object existing;
                var entry = IsAsset(key) ? ReadAsset(key) : entries.TryGetValue(key, out existing) ? existing as Dictionary<string, object> : null;
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
                if (IsAsset(key)) PersistAsset(key, updated);
                else { Persist(next); entries = next; }
                Reply(stream, 200, "OK", updated, json);
            }
        }
        catch (ArgumentException) { Reply(stream, 400, "Bad Request", new { error = "The saved item is invalid JSON." }, json); }
        catch (InvalidOperationException) { Reply(stream, 400, "Bad Request", new { error = "The saved item is invalid JSON." }, json); }
        catch (Exception) { Reply(stream, 503, "Service Unavailable", new { error = "The local library could not save or open this item. Existing data was retained." }, json); }
        return true;
    }
}
