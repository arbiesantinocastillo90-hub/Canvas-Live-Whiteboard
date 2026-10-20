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
    private readonly object mediaGate = new object();
    private const int MaxImage = 20 * 1024 * 1024;
    private readonly string folder;
    private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = MaxLibrary, RecursionLimit = 64 };
    private Dictionary<string, object> entries;
    private readonly Dictionary<string, string> recordPaths = new Dictionary<string, string>(StringComparer.Ordinal);
    private readonly Dictionary<string, object> issues = new Dictionary<string, object>(StringComparer.Ordinal);
    private readonly HashSet<string> blocked = new HashSet<string>(StringComparer.Ordinal);
    private readonly HashSet<string> blockedHashes = new HashSet<string>(StringComparer.Ordinal);
    private readonly HashSet<string> recovered = new HashSet<string>(StringComparer.Ordinal);
    private readonly Dictionary<string, string> descriptorHashes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    private long storedBytes;

    internal LocalLibrary(string directory) { folder = Path.GetFullPath(directory); }

    private static void Ordinary(string path)
    {
        for (string current = Path.GetFullPath(path); !String.IsNullOrEmpty(current); current = Path.GetDirectoryName(current))
            if ((File.Exists(current) || Directory.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new IOException("Local library folders must not contain links.");
    }
    private string V2Folder { get { return Path.Combine(folder, "library-v2"); } }
    private static bool ValidKey(string key) { return Regex.IsMatch(key, "^(file|metadata|sessions|latest|view|settings):[A-Za-z0-9_-]{1,280}$"); }
    private static string Digest(string text)
    {
        // Stable 128-bit names keep nested portable paths below legacy Windows limits.
        // The complete key is stored and verified inside every record.
        using (SHA256 hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(text))).Replace("-", "").ToLowerInvariant().Substring(0, 32);
    }
    private static string EncodedKey(string kind, string id) { return kind + ":" + Convert.ToBase64String(Encoding.UTF8.GetBytes(id)).TrimEnd('=').Replace('+', '-').Replace('/', '_'); }
    private static Dictionary<string, object> ObjectValue(object value) { return value as Dictionary<string, object>; }
    private static bool ValidEntry(Dictionary<string, object> entry)
    {
        object revision, value; long number;
        return entry != null && entry.TryGetValue("revision", out revision) && !(revision is string) && !(revision is bool) && Int64.TryParse(Convert.ToString(revision, CultureInfo.InvariantCulture), NumberStyles.None, CultureInfo.InvariantCulture, out number) && number >= 1 && number < 9007199254740991L && entry.TryGetValue("value", out value) && value is Dictionary<string, object>;
    }
    private static bool DateValue(object value)
    {
        long number;
        return value != null && !(value is string) && !(value is bool) && Int64.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), NumberStyles.None, CultureInfo.InvariantCulture, out number) && number >= 0 && number <= 8640000000000000L;
    }
    private static string PreviousPath(string path) { return path.Substring(0, path.Length - 5) + ".previous.json"; }
    private byte[] JsonBytes(object value) { return new UTF8Encoding(false, true).GetBytes(json.Serialize(value)); }
    private void AtomicWrite(string target, byte[] bytes, string backup)
    {
        string directory = Path.GetDirectoryName(target);
        Ordinary(directory); Ordinary(target); if (backup != null) Ordinary(backup);
        Directory.CreateDirectory(directory);
        string temporary = Path.Combine(directory, "write-" + Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 8192, FileOptions.WriteThrough)) { file.Write(bytes, 0, bytes.Length); file.Flush(true); }
            if (File.Exists(target)) File.Replace(temporary, target, backup); else File.Move(temporary, target);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    private string RelativeRecordPath(string key, Dictionary<string, object> value)
    {
        object id, project;
        if (key.StartsWith("file:", StringComparison.Ordinal) && value.TryGetValue("id", out id) && id is string && EncodedKey("file", (string)id) == key && value.TryGetValue("projectId", out project) && project is string && ((string)project).Length > 0 && ((string)project).Length <= 200)
            return Path.Combine("projects", Digest((string)project), "canvases", Digest(key) + ".json");
        return Path.Combine("records", Digest(key) + ".json");
    }
    private Dictionary<string, object> ReadJson(string path, int maximum)
    {
        Ordinary(path);
        if (!File.Exists(path)) return null;
        if (new FileInfo(path).Length > maximum) throw new IOException("The saved record exceeds its size limit.");
        return json.DeserializeObject(File.ReadAllText(path, new UTF8Encoding(false, true))) as Dictionary<string, object>;
    }
    private Dictionary<string, object> ReadLegacy(string path)
    {
        Ordinary(path); if (!File.Exists(path)) return null;
        var root = ReadJson(path, MaxLibrary); object version, raw;
        if (root == null || !root.TryGetValue("version", out version) || !(version is int) || (int)version != 1 || !root.TryGetValue("entries", out raw) || !(raw is Dictionary<string, object>)) throw new IOException("The saved library is invalid.");
        var result = (Dictionary<string, object>)raw;
        if (result.Count > 2000) throw new IOException("The local library has reached its item limit.");
        return result;
    }
    private void Issue(string key, bool restored, string message) { issues[key] = new { key = key, recovered = restored, message = message }; }
    private static bool RecoverableReadError(Exception error) { return error is IOException || error is UnauthorizedAccessException || error is ArgumentException || error is InvalidOperationException || error is FormatException || error is OverflowException; }
    private void Load()
    {
        if (entries != null) return;
        Ordinary(folder); Ordinary(V2Folder);
        recordPaths.Clear(); issues.Clear(); blocked.Clear(); blockedHashes.Clear(); recovered.Clear(); descriptorHashes.Clear(); storedBytes = 0;
        if (!Directory.Exists(V2Folder)) Migrate();
        var marker = ReadJson(Path.Combine(V2Folder, "format.json"), 1024);
        object version;
        if (marker == null || !marker.TryGetValue("version", out version) || !(version is int) || (int)version != 2) throw new IOException("The folder library is incomplete; existing data was retained.");
        var loaded = new Dictionary<string, object>(StringComparer.Ordinal);
        try
        {
            var migration = ReadJson(Path.Combine(V2Folder, "migration-issues.json"), 1024 * 1024);
            if (migration != null) foreach (var item in migration) if (ValidKey(item.Key) || item.Key == "") issues[item.Key] = item.Value;
        }
        catch (Exception error) { if (!RecoverableReadError(error)) throw; Issue("", false, "A recovery note could not be read. Saved item records were retained."); }
        foreach (string path in RecordFiles()) LoadRecord(path, loaded);
        if (loaded.Count + blocked.Count > 2000 || storedBytes > MaxLibrary) throw new IOException("The local library exceeds its size limit; its saved files were retained.");
        entries = loaded;
        RefreshDescriptors();
    }
    private void Migrate()
    {
        Dictionary<string, object> primary = null, previous = null;
        bool damagedPrimary = false;
        string old = Path.Combine(folder, "library.json"), oldPrevious = Path.Combine(folder, "library.previous.json");
        try { primary = ReadLegacy(old); } catch (Exception error) { if (!RecoverableReadError(error)) throw; damagedPrimary = true; }
        try { previous = ReadLegacy(oldPrevious); } catch (Exception error) { if (!RecoverableReadError(error)) throw; }
        if (damagedPrimary && previous == null) throw new IOException("The saved library and its previous copy could not be opened; both were retained.");
        if (primary == null && previous != null) { primary = previous; Issue("", true, "The previous saved library was recovered. The original files were retained."); }
        if (primary == null) primary = new Dictionary<string, object>(StringComparer.Ordinal);
        var selected = new Dictionary<string, object>(StringComparer.Ordinal);
        foreach (var item in primary)
        {
            if (!ValidKey(item.Key)) throw new IOException("The saved library contains an invalid identifier; its source was retained.");
            var entry = ObjectValue(item.Value);
            if (!ValidEntry(entry))
            {
                object alternate;
                entry = previous != null && previous.TryGetValue(item.Key, out alternate) ? ObjectValue(alternate) : null;
                if (!ValidEntry(entry)) { blocked.Add(item.Key); Issue(item.Key, false, "This saved item could not be opened. Its original data was retained for recovery."); continue; }
                Issue(item.Key, true, "This item was recovered from its previous saved copy. The original data was retained.");
            }
            selected[item.Key] = entry;
        }
        // The previous format had no delete operation. A backup-only key can
        // therefore be salvaged without reversing a supported user deletion.
        // Canvas recovery does not invent project or workspace membership.
        if (previous != null) foreach (var item in previous)
        {
            if (primary.ContainsKey(item.Key)) continue;
            if (!ValidKey(item.Key)) { Issue("", false, "An item with an invalid identifier remains in the previous library for manual recovery."); continue; }
            var entry = ObjectValue(item.Value);
            if (!ValidEntry(entry)) { blocked.Add(item.Key); Issue(item.Key, false, "An unreadable item remains in the previous library for recovery. Its identifier is protected from replacement."); continue; }
            selected[item.Key] = entry;
            Issue(item.Key, true, "This saved item was recovered from the previous library. Project and workspace membership was not changed.");
        }
        if (selected.Count + blocked.Count > 2000) throw new IOException("The recovered library exceeds its item limit; both original files were retained.");
        string staging = Path.Combine(folder, "v2-stage-" + Guid.NewGuid().ToString("N").Substring(0, 12));
        Ordinary(staging); Directory.CreateDirectory(staging);
        // An interrupted migration remains a retained staging folder. It is never served.
        foreach (var item in selected)
        {
            var entry = (Dictionary<string, object>)item.Value;
            string target = Path.Combine(staging, RelativeRecordPath(item.Key, (Dictionary<string, object>)entry["value"]));
            byte[] bytes = JsonBytes(new { version = 2, key = item.Key, revision = entry["revision"], value = entry["value"] });
            if (bytes.Length > MaxBody + 1024 || (storedBytes += bytes.Length) > MaxLibrary) throw new IOException("The saved library exceeds its size limit; its source was retained.");
            AtomicWrite(target, bytes, null);
            object before;
            var oldEntry = previous != null && previous.TryGetValue(item.Key, out before) ? ObjectValue(before) : null;
            if (ValidEntry(oldEntry)) AtomicWrite(PreviousPath(target), JsonBytes(new { version = 2, key = item.Key, revision = oldEntry["revision"], value = oldEntry["value"] }), null);
        }
        if (issues.Count > 0) AtomicWrite(Path.Combine(staging, "migration-issues.json"), JsonBytes(issues), null);
        // Store unreadable keys as explicit tombstones so a later PUT cannot erase them.
        if (blocked.Count > 0) AtomicWrite(Path.Combine(staging, "blocked.json"), JsonBytes(new { keys = new List<string>(blocked).ToArray() }), null);
        AtomicWrite(Path.Combine(staging, "format.json"), JsonBytes(new { version = 2 }), null);
        Ordinary(V2Folder); Directory.Move(staging, V2Folder);
        storedBytes = 0;
    }
    private IEnumerable<string> RecordFiles()
    {
        var paths = new List<string>();
        string records = Path.Combine(V2Folder, "records"); Ordinary(records);
        if (Directory.Exists(records)) AddRecordFiles(records, paths);
        string projects = Path.Combine(V2Folder, "projects"); Ordinary(projects);
        int scannedProjects = 0;
        if (Directory.Exists(projects)) foreach (string project in Directory.EnumerateDirectories(projects))
        {
            if (++scannedProjects > 2000) throw new IOException("The local library has too many project folders.");
            if (!Regex.IsMatch(Path.GetFileName(project), "^[a-f0-9]{32}$")) continue;
            Ordinary(project); string canvases = Path.Combine(project, "canvases"); Ordinary(canvases);
            if (Directory.Exists(canvases)) AddRecordFiles(canvases, paths);
            if (paths.Count > 2000) throw new IOException("The local library has reached its item limit.");
        }
        string blockedPath = Path.Combine(V2Folder, "blocked.json");
        var tombstones = ReadJson(blockedPath, 1024 * 1024); object raw;
        if (File.Exists(blockedPath))
        {
            if (tombstones == null || !tombstones.TryGetValue("keys", out raw) || !(raw is object[]) || ((object[])raw).Length > 2000) throw new IOException("The recovery protection file is invalid; saved records were retained.");
            foreach (object key in (object[])raw) { if (!(key is string) || !ValidKey((string)key)) throw new IOException("The recovery protection file is invalid; saved records were retained."); blocked.Add((string)key); }
        }
        return paths;
    }
    private void AddRecordFiles(string directory, List<string> paths)
    {
        int scanned = 0;
        foreach (string path in Directory.EnumerateFiles(directory, "*.json"))
        {
            if (++scanned > 8000) throw new IOException("The saved record folder has too many files.");
            string name = Path.GetFileName(path);
            if (Regex.IsMatch(name, "^[a-f0-9]{32}\\.json$")) { if (!paths.Contains(path)) paths.Add(path); }
            else if (Regex.IsMatch(name, "^[a-f0-9]{32}\\.previous\\.json$"))
            {
                string current = Path.Combine(directory, name.Replace(".previous.json", ".json"));
                if (!paths.Contains(current)) paths.Add(current);
            }
            if (paths.Count > 2000) throw new IOException("The local library has reached its item limit.");
        }
    }
    private Dictionary<string, object> ReadRecord(string path, out string key)
    {
        key = null; var entry = ReadJson(path, MaxBody + 1024); object rawKey, version;
        if (entry != null && entry.TryGetValue("key", out rawKey) && rawKey is string && ValidKey((string)rawKey)) key = (string)rawKey;
        if (!ValidEntry(entry) || key == null || !entry.TryGetValue("version", out version) || !(version is int) || (int)version != 2 || Path.GetFileName(path).Split('.')[0] != Digest(key)) throw new IOException("The saved record is invalid.");
        return new Dictionary<string, object> { { "revision", entry["revision"] }, { "value", entry["value"] } };
    }
    private void LoadRecord(string path, Dictionary<string, object> loaded)
    {
        Dictionary<string, object> entry = null; string key = null, previousKey = null;
        try { entry = ReadRecord(path, out key); if (entry == null) throw new IOException("The current saved record is missing."); }
        catch (Exception error)
        {
            if (!RecoverableReadError(error)) throw;
            try { entry = ReadRecord(PreviousPath(path), out previousKey); } catch (Exception second) { if (!RecoverableReadError(second)) throw; }
            if (entry != null && (key == null || key == previousKey)) { key = previousKey; recovered.Add(key); Issue(key, true, "This item was recovered from its previous saved copy. Its damaged file was retained."); }
            else { if (key != null) blocked.Add(key); blockedHashes.Add(Path.GetFileName(path).Split('.')[0]); Issue(key ?? "", false, "A saved item could not be opened. Its original files were retained for recovery."); return; }
        }
        if (entry == null) { if (key != null) blocked.Add(key); return; }
        if (loaded.ContainsKey(key)) throw new IOException("The folder library contains duplicate identifiers; all copies were retained.");
        loaded[key] = entry; recordPaths[key] = path;
        storedBytes += JsonBytes(new { version = 2, key = key, revision = entry["revision"], value = entry["value"] }).Length;
        if (storedBytes > MaxLibrary) throw new IOException("The local library exceeds its size limit; its saved files were retained.");
    }
    private void PersistRecord(string key, Dictionary<string, object> updated)
    {
        if (blocked.Contains(key) || blockedHashes.Contains(Digest(key))) throw new IOException("This saved item needs recovery before it can be replaced.");
        string target;
        if (!recordPaths.TryGetValue(key, out target))
        {
            target = Path.Combine(V2Folder, RelativeRecordPath(key, (Dictionary<string, object>)updated["value"]));
            Ordinary(target); Ordinary(PreviousPath(target));
            if (File.Exists(target) || Directory.Exists(target) || File.Exists(PreviousPath(target))) throw new IOException("An unindexed saved file already occupies this location; it was retained for recovery.");
        }
        byte[] bytes = JsonBytes(new { version = 2, key = key, revision = updated["revision"], value = updated["value"] });
        long before = entries.ContainsKey(key) ? JsonBytes(new { version = 2, key = key, revision = ((Dictionary<string, object>)entries[key])["revision"], value = ((Dictionary<string, object>)entries[key])["value"] }).Length : 0;
        if (bytes.Length > MaxBody + 1024 || storedBytes - before + bytes.Length > MaxLibrary) throw new IOException("The local library is full. Export your projects before adding more.");
        if (recovered.Contains(key) && File.Exists(target))
        {
            string retained = Path.Combine(V2Folder, "recovery", Digest(key) + "-" + Guid.NewGuid().ToString("N").Substring(0, 12) + ".json");
            Ordinary(Path.GetDirectoryName(retained)); Directory.CreateDirectory(Path.GetDirectoryName(retained));
            Ordinary(target); Ordinary(retained); File.Copy(target, retained, false);
        }
        AtomicWrite(target, bytes, recovered.Contains(key) ? null : PreviousPath(target));
        recordPaths[key] = target; storedBytes = storedBytes - before + bytes.Length; recovered.Remove(key);
    }
    private object FileSummary(string key, Dictionary<string, object> entry)
    {
        var value = (Dictionary<string, object>)entry["value"]; object id, project, document, created, updated, opened, name;
        if (!value.TryGetValue("id", out id) || !(id is string) || EncodedKey("file", (string)id) != key || !value.TryGetValue("projectId", out project) || !(project is string) || ((string)project).Length < 1 || ((string)project).Length > 200 || !value.TryGetValue("document", out document) || !(document is Dictionary<string, object>) || !((Dictionary<string, object>)document).TryGetValue("name", out name) || !(name is string) || !value.TryGetValue("createdAt", out created) || !DateValue(created) || !value.TryGetValue("updatedAt", out updated) || !DateValue(updated) || !value.TryGetValue("lastOpenedAt", out opened) || !DateValue(opened) || Convert.ToInt64(updated) < Convert.ToInt64(created) || Convert.ToInt64(opened) < Convert.ToInt64(created))
        { Issue(key, false, "This canvas has invalid saved details. Its data was retained for recovery."); return null; }
        return new { key = key, revision = entry["revision"], id = id, projectId = project, name = name, createdAt = created, updatedAt = updated, lastOpenedAt = opened };
    }
    private object Catalog()
    {
        var index = new Dictionary<string, object>(StringComparer.Ordinal); var files = new List<object>();
        foreach (var item in entries)
        {
            if (IsAsset(item.Key)) continue;
            if (item.Key.StartsWith("file:", StringComparison.Ordinal)) { object summary = FileSummary(item.Key, (Dictionary<string, object>)item.Value); if (summary != null) files.Add(summary); }
            else index[item.Key] = item.Value;
        }
        return new { version = 2, entries = index, files = files.ToArray(), issues = new List<object>(issues.Values).ToArray() };
    }
    private void RefreshDescriptors()
    {
        // These human-readable folder descriptors are derived, never transaction authority.
        // A denied descriptor write must not turn an already durable record save into a failure.
        try
        {
            object raw;
            if (entries.TryGetValue(EncodedKey("metadata", "main"), out raw))
            {
                var value = (Dictionary<string, object>)((Dictionary<string, object>)raw)["value"]; object projects;
                if (value.TryGetValue("projects", out projects) && projects is object[]) foreach (object item in (object[])projects)
                {
                    var project = ObjectValue(item); object id;
                    if (project == null || !project.TryGetValue("id", out id) || !(id is string)) continue;
                    WriteDescriptor(Path.Combine(V2Folder, "projects", Digest((string)id), "project.json"), project);
                }
            }
            if (entries.TryGetValue(EncodedKey("sessions", "main"), out raw))
            {
                var value = (Dictionary<string, object>)((Dictionary<string, object>)raw)["value"]; object items;
                if (value.TryGetValue("items", out items) && items is object[]) foreach (object item in (object[])items)
                {
                    var workspace = ObjectValue(item); object id;
                    if (workspace == null || !workspace.TryGetValue("id", out id) || !(id is string)) continue;
                    WriteDescriptor(Path.Combine(V2Folder, "workspaces", Digest((string)id), "workspace.json"), workspace);
                }
            }
        }
        catch (Exception error) { if (!RecoverableReadError(error)) throw; Issue("", true, "Saved content is available; its folder descriptions will be refreshed on the next start."); }
    }
    private void WriteDescriptor(string path, object value)
    {
        byte[] bytes = JsonBytes(value); string hash = ImageHash(bytes), previous;
        if (descriptorHashes.TryGetValue(path, out previous) && previous == hash) return;
        Ordinary(path);
        if (!File.Exists(path) || new FileInfo(path).Length != bytes.Length || ImageHash(File.ReadAllBytes(path)) != hash) AtomicWrite(path, bytes, null);
        descriptorHashes[path] = hash;
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
    private const int MediaHeaderSize = 128;
    private static bool HasSignature(byte[] bytes, string value, int offset)
    {
        if (bytes.Length < offset + value.Length) return false;
        for (int i = 0; i < value.Length; i++) if (bytes[offset + i] != (byte)value[i]) return false;
        return true;
    }
    private static string MediaMime(byte[] bytes, bool complete)
    {
        if (bytes.Length >= 4 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255)
        {
            if (complete && (bytes[bytes.Length - 2] != 255 || bytes[bytes.Length - 1] != 217)) throw new ArgumentException("Invalid JPEG media.");
            return "image/jpeg";
        }
        try { return RasterMime(bytes); } catch (ArgumentException) { }
        string head = Encoding.ASCII.GetString(bytes, 0, Math.Min(bytes.Length, 4096));
        if (bytes.Length >= 12 && HasSignature(bytes, "ftyp", 4) && Regex.IsMatch(Encoding.ASCII.GetString(bytes, 8, 4), "^(isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV|dash)$")) return "video/mp4";
        if (bytes.Length >= 8 && bytes[0] == 0x1a && bytes[1] == 0x45 && bytes[2] == 0xdf && bytes[3] == 0xa3 && head.IndexOf("webm", StringComparison.Ordinal) >= 0) return "video/webm";
        if (bytes.Length >= 10 && (HasSignature(bytes, "ID3", 0) || (bytes[0] == 255 && (bytes[1] & 0xe0) == 0xe0 && ((bytes[1] >> 3) & 3) != 1 && ((bytes[1] >> 1) & 3) != 0 && (bytes[2] >> 4) > 0 && (bytes[2] >> 4) < 15 && ((bytes[2] >> 2) & 3) != 3))) return "audio/mpeg";
        if (bytes.Length >= 44 && HasSignature(bytes, "RIFF", 0) && HasSignature(bytes, "WAVE", 8)) return "audio/wav";
        if (bytes.Length >= 35 && HasSignature(bytes, "OggS", 0) && bytes[4] == 0 && (head.IndexOf("OpusHead", 27, StringComparison.Ordinal) >= 0 || head.IndexOf("vorbis", 27, StringComparison.Ordinal) >= 0)) return "audio/ogg";
        if (bytes.Length >= 12 && Regex.IsMatch(head, "^%PDF-[12]\\.[0-9]"))
        {
            if (complete && Encoding.ASCII.GetString(bytes, Math.Max(0, bytes.Length - 1024), Math.Min(bytes.Length, 1024)).IndexOf("%%EOF", StringComparison.Ordinal) < 0) throw new ArgumentException("Invalid PDF media.");
            return "application/pdf";
        }
        string text = new UTF8Encoding(false, complete).GetString(bytes);
        if (String.IsNullOrEmpty(text) || Regex.IsMatch(text, "[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]") || Regex.IsMatch(text, "^\\s*(<!doctype|<html|<svg|<script|<\\?xml)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)) throw new ArgumentException("Unsupported local media.");
        return "text/plain";
    }
    private string MediaPath(string id) { return Path.Combine(folder, "media", id + ".asset"); }
    private void PersistMedia(string id, string mime, byte[] bytes)
    {
        string target = MediaPath(id), directory = Path.GetDirectoryName(target);
        Ordinary(directory); Ordinary(target); Directory.CreateDirectory(directory);
        if (!File.Exists(target))
        {
            int count = 0;
            foreach (string ignored in Directory.EnumerateFiles(directory, "*.asset")) if (++count >= 1000) throw new IOException("The local media library is full.");
        }
        byte[] header = new byte[MediaHeaderSize];
        byte[] metadata = Encoding.ASCII.GetBytes("CanvasLiveMedia1\n" + mime + "\n" + bytes.Length.ToString(CultureInfo.InvariantCulture) + "\n");
        Buffer.BlockCopy(metadata, 0, header, 0, metadata.Length);
        string temporary = Path.Combine(directory, "media-" + Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, FileOptions.WriteThrough)) { file.Write(header, 0, header.Length); file.Write(bytes, 0, bytes.Length); file.Flush(true); }
            if (File.Exists(target)) File.Replace(temporary, target, null); else File.Move(temporary, target);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    private bool ServeMedia(Stream stream, string method, string path, Dictionary<string, string> headers, string origin)
    {
        const string prefix = "/__canvas_live_library/media/";
        if (!path.StartsWith(prefix, StringComparison.Ordinal)) return false;
        var serializer = new JavaScriptSerializer { MaxJsonLength = 4096, RecursionLimit = 8 };
        string id = path.Substring(prefix.Length), source;
        if (!Regex.IsMatch(id, "^[a-f0-9]{64}$")) { Reply(stream, 400, "Bad Request", new { error = "Invalid media identifier." }, serializer); return true; }
        bool forbidden = (headers.TryGetValue("Origin", out source) && source != origin) || (headers.TryGetValue("Sec-Fetch-Site", out source) && source == "cross-site") || (method == "PUT" && (!headers.TryGetValue("Origin", out source) || source != origin));
        if (method == "PUT")
        {
            string rawLength, contentType; int length;
            if (headers.ContainsKey("Transfer-Encoding") || !headers.TryGetValue("Content-Length", out rawLength) || !Int32.TryParse(rawLength, NumberStyles.None, CultureInfo.InvariantCulture, out length) || length < 1 || length > MaxImage)
            { Reply(stream, 413, "Payload Too Large", new { error = "Choose media of 20 MB or smaller." }, serializer); return true; }
            if (forbidden)
            {
                // Consume a bounded rejected body so closing the socket preserves the HTTP error.
                byte[] discard = new byte[Math.Min(length, 65536)];
                for (int remaining = length; remaining > 0;) { int count = stream.Read(discard, 0, Math.Min(discard.Length, remaining)); if (count == 0) throw new IOException("The media was incomplete."); remaining -= count; }
                Reply(stream, 403, "Forbidden", new { error = "Only Canvas Live can access its local media." }, serializer); return true;
            }
            byte[] bytes = new byte[length];
            for (int read = 0; read < length;) { int count = stream.Read(bytes, read, length - read); if (count == 0) throw new IOException("The media was incomplete."); read += count; }
            string mime = MediaMime(bytes, true);
            if (!headers.TryGetValue("Content-Type", out contentType) || contentType != mime || ImageHash(bytes) != id)
            { Reply(stream, 400, "Bad Request", new { error = "The media contents do not match their identifier or type." }, serializer); return true; }
            lock (mediaGate) { PersistMedia(id, mime, bytes); }
            Reply(stream, 200, "OK", new { mediaId = id }, serializer); return true;
        }
        if (forbidden) { Reply(stream, 403, "Forbidden", new { error = "Only Canvas Live can access its local media." }, serializer); return true; }
        if (method != "GET" && method != "HEAD") { Reply(stream, 405, "Method Not Allowed", new { error = "Use GET, HEAD or PUT." }, serializer); return true; }
        string target = MediaPath(id); Ordinary(target);
        if (!File.Exists(target)) { Reply(stream, 404, "Not Found", new { error = "The media is unavailable on this device." }, serializer); return true; }
        using (var file = new FileStream(target, FileMode.Open, FileAccess.Read, FileShare.Read, 65536, FileOptions.SequentialScan))
        {
            if (file.Length <= MediaHeaderSize || file.Length > MaxImage + MediaHeaderSize) throw new IOException("Invalid saved media size.");
            byte[] metadata = new byte[MediaHeaderSize];
            if (file.Read(metadata, 0, metadata.Length) != metadata.Length) throw new IOException("Invalid saved media metadata.");
            string[] fields = Encoding.ASCII.GetString(metadata).TrimEnd('\0').Split('\n');
            int length;
            if (fields.Length != 4 || fields[0] != "CanvasLiveMedia1" || fields[3] != "" || !Int32.TryParse(fields[2], NumberStyles.None, CultureInfo.InvariantCulture, out length) || length < 1 || length > MaxImage || file.Length != MediaHeaderSize + length) throw new IOException("Invalid saved media metadata.");
            byte[] signature = new byte[Math.Min(length, 4096)];
            if (file.Read(signature, 0, signature.Length) != signature.Length || MediaMime(signature, false) != fields[1]) throw new IOException("Invalid saved media signature.");
            if (fields[1] == "image/jpeg") { file.Position = file.Length - 2; if (file.ReadByte() != 255 || file.ReadByte() != 217) throw new IOException("Invalid JPEG media."); }
            if (fields[1] == "application/pdf") { byte[] tail = new byte[Math.Min(length, 1024)]; file.Position = file.Length - tail.Length; file.Read(tail, 0, tail.Length); if (Encoding.ASCII.GetString(tail).IndexOf("%%EOF", StringComparison.Ordinal) < 0) throw new IOException("Invalid PDF media."); }
            string match; bool unchanged = headers.TryGetValue("If-None-Match", out match) && match == "\"" + id + "\"";
            long start = 0, end = length - 1; bool ranged = false; string range;
            // Native video/audio seeking needs a single bounded byte range.
            if (!unchanged && headers.TryGetValue("Range", out range))
            {
                Match parsed = Regex.Match(range, "^bytes=([0-9]*)-([0-9]*)$");
                long first, last;
                if (!parsed.Success || (parsed.Groups[1].Value.Length == 0 && parsed.Groups[2].Value.Length == 0)) { Reply(stream, 416, "Range Not Satisfiable", new { error = "Use one bounded media byte range." }, serializer); return true; }
                if (parsed.Groups[1].Value.Length == 0) { if (!Int64.TryParse(parsed.Groups[2].Value, out last) || last < 1) { Reply(stream, 416, "Range Not Satisfiable", new { error = "Invalid byte range." }, serializer); return true; } start = Math.Max(0, length - last); }
                else {
                    if (!Int64.TryParse(parsed.Groups[1].Value, out first) || first >= length || (parsed.Groups[2].Value.Length > 0 && (!Int64.TryParse(parsed.Groups[2].Value, out last) || last < first))) { Reply(stream, 416, "Range Not Satisfiable", new { error = "Invalid byte range." }, serializer); return true; }
                    start = first; if (parsed.Groups[2].Value.Length > 0) end = Math.Min(length - 1, Int64.Parse(parsed.Groups[2].Value, CultureInfo.InvariantCulture));
                }
                ranged = true;
            }
            long responseLength = unchanged ? 0 : end - start + 1;
            string header = "HTTP/1.1 " + (unchanged ? "304 Not Modified" : ranged ? "206 Partial Content" : "200 OK") + "\r\nContent-Type: " + fields[1] + "\r\nContent-Length: " + responseLength + "\r\nConnection: close\r\nCache-Control: private, max-age=31536000, immutable\r\nETag: \"" + id + "\"\r\nX-Content-Type-Options: nosniff\r\nAccept-Ranges: bytes\r\n" + (ranged ? "Content-Range: bytes " + start + "-" + end + "/" + length + "\r\n" : "") + "\r\n";
            byte[] head = Encoding.ASCII.GetBytes(header); stream.Write(head, 0, head.Length);
            if (!unchanged && method != "HEAD")
            {
                file.Position = MediaHeaderSize + start;
                byte[] buffer = new byte[65536];
                for (long remaining = responseLength; remaining > 0;) { int count = file.Read(buffer, 0, (int)Math.Min(buffer.Length, remaining)); if (count == 0) throw new IOException("The media file was truncated."); stream.Write(buffer, 0, count); remaining -= count; }
            }
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
        var responseJson = new JavaScriptSerializer { MaxJsonLength = MaxLibrary, RecursionLimit = 64 };
        try
        {
            var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (int i = 1; i < lines.Length; i++)
            {
                int separator = lines[i].IndexOf(':'); if (separator < 1) continue;
                string name = lines[i].Substring(0, separator).Trim();
                if (headers.ContainsKey(name)) { Reply(stream, 400, "Bad Request", new { error = "Duplicate request header." }, responseJson); return true; }
                headers[name] = lines[i].Substring(separator + 1).Trim();
            }
            if (ServeMedia(stream, method, path, headers, origin)) return true;
            if (ServeBinary(stream, method, path, headers, origin)) return true;
            // Drain ordinary bounded PUT bodies before rejecting headers or revisions.
            // Closing a socket with unread bytes can reset it and hide the JSON error.
            byte[] bytes = null;
            if (method == "PUT")
            {
                string rawLength;
                int length;
                if (headers.ContainsKey("Transfer-Encoding") || !headers.TryGetValue("Content-Length", out rawLength) || !Int32.TryParse(rawLength, NumberStyles.None, CultureInfo.InvariantCulture, out length) || length < 2 || length > MaxBody) { Reply(stream, 413, "Payload Too Large", new { error = "The saved item exceeds its size limit." }, responseJson); return true; }
                bytes = new byte[length];
                for (int read = 0; read < length;) { int count = stream.Read(bytes, read, length - read); if (count == 0) throw new IOException("The saved item was incomplete."); read += count; }
            }
            string source;
            if ((headers.TryGetValue("Origin", out source) && source != origin) || (headers.TryGetValue("Sec-Fetch-Site", out source) && source == "cross-site"))
            { Reply(stream, 403, "Forbidden", new { error = "Only Canvas Live can access its local library." }, responseJson); return true; }
            object response; int status; string reason;
            lock (gate)
            {
                response = Handle(method, path, headers, bytes, out status, out reason);
            }
            // Responses reference immutable saved values. Serialization and socket writes
            // occur outside the commit gate so a slow reader cannot stall autosaving.
            Reply(stream, status, reason, response, responseJson);
        }
        catch (ArgumentException) { Reply(stream, 400, "Bad Request", new { error = "The saved item is invalid JSON." }, responseJson); }
        catch (InvalidOperationException) { Reply(stream, 400, "Bad Request", new { error = "The saved item is invalid JSON." }, responseJson); }
        catch (Exception) { Reply(stream, 503, "Service Unavailable", new { error = "The local library could not save or open this item. Existing data was retained." }, responseJson); }
        return true;
    }
    private object Handle(string method, string path, Dictionary<string, string> headers, byte[] bytes, out int status, out string reason)
    {
        const string prefix = "/__canvas_live_library";
        status = 200; reason = "OK"; Load();
        if (method == "GET" && path == prefix)
        {
            var index = new Dictionary<string, object>(StringComparer.Ordinal);
            foreach (var item in entries) if (!IsAsset(item.Key)) index[item.Key] = item.Value;
            return new { version = 1, entries = index };
        }
        if (method == "GET" && path == prefix + "/catalog") return Catalog();
        string key = path.Length > prefix.Length + 1 ? Uri.UnescapeDataString(path.Substring(prefix.Length + 1)) : "";
        if (!ValidKey(key)) { status = 400; reason = "Bad Request"; return new { error = "Invalid library identifier." }; }
        if (blocked.Contains(key) || blockedHashes.Contains(Digest(key))) { status = 503; reason = "Service Unavailable"; return new { error = "This saved item could not be opened. Its original data was retained for recovery; it cannot be overwritten." }; }
        object existing;
        var entry = IsAsset(key) ? ReadAsset(key) : entries.TryGetValue(key, out existing) ? existing as Dictionary<string, object> : null;
        if (entry == null && IsAsset(key) && entries.TryGetValue(key, out existing)) entry = ObjectValue(existing);
        long revision = entry == null ? 0 : Convert.ToInt64(entry["revision"], CultureInfo.InvariantCulture);
        if (method == "GET") return entry ?? new Dictionary<string, object> { { "revision", 0 }, { "value", null } };
        if (method != "PUT") { status = 405; reason = "Method Not Allowed"; return new { error = "Use GET or PUT." }; }
        string match; long expected;
        if (!headers.TryGetValue("If-Match", out match) || !Int64.TryParse(match, NumberStyles.None, CultureInfo.InvariantCulture, out expected)) { status = 428; reason = "Precondition Required"; return new { error = "A library revision is required." }; }
        if (expected != revision) { status = 409; reason = "Conflict"; return new { error = "This item changed in another view. Reload it before saving." }; }
        if (revision >= 9007199254740990L) throw new IOException("This saved item has reached its revision limit.");
        string contentType;
        if (!headers.TryGetValue("Content-Type", out contentType) || !contentType.StartsWith("application/json", StringComparison.OrdinalIgnoreCase) || headers.ContainsKey("Transfer-Encoding")) { status = 415; reason = "Unsupported Media Type"; return new { error = "Use bounded JSON content." }; }
        var value = json.DeserializeObject(new UTF8Encoding(false, true).GetString(bytes)) as Dictionary<string, object>;
        if (value == null || value.ContainsKey("__proto__") || value.ContainsKey("constructor") || value.ContainsKey("prototype")) { status = 400; reason = "Bad Request"; return new { error = "Invalid saved item." }; }
        var updated = new Dictionary<string, object> { { "revision", revision + 1 }, { "value", value } };
        if (!entries.ContainsKey(key) && entries.Count + blocked.Count >= 2000) throw new IOException("The local library has reached its item limit.");
        if (IsAsset(key)) PersistAsset(key, updated);
        else
        {
            PersistRecord(key, updated);
            entries[key] = updated;
            if (key == EncodedKey("metadata", "main") || key == EncodedKey("sessions", "main")) RefreshDescriptors();
        }
        return updated;
    }
}
