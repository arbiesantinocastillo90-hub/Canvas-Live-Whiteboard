using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using System.Text.RegularExpressions;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        bool showTray = Array.IndexOf(args, "--no-browser") < 0;
        bool openBrowser = showTray && Array.IndexOf(args, "--background") < 0;
        string folder = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        string key;
        using (SHA256 hash = SHA256.Create())
            key = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(folder.ToLowerInvariant()))).Replace("-", "").Substring(0, 24);
        string stateFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Canvas Live", "launchers", key);
        string endpointFile = Path.Combine(stateFolder, "endpoint.txt");
        string sid;
        using (WindowsIdentity identity = WindowsIdentity.GetCurrent()) sid = identity.User.Value;
        using (Mutex mutex = new Mutex(false, "Local\\CanvasLive." + sid + "." + key))
        {
            bool ownsMutex;
            try { ownsMutex = mutex.WaitOne(0); }
            catch (AbandonedMutexException) { ownsMutex = true; }
            if (!ownsMutex)
            {
                try
                {
                    string existing = WaitForEndpoint(endpointFile, key);
                    if (openBrowser) OpenBrowser(existing);
                    return 0;
                }
                catch (Exception error) { return ShowError(error, stateFolder, openBrowser); }
            }
            try
            {
                Directory.CreateDirectory(stateFolder);
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                using (StaticSite server = new StaticSite(Path.Combine(folder, "app"), key))
                {
                    server.Start();
                    File.WriteAllText(endpointFile, server.Url, new UTF8Encoding(false));
                    using (LauncherContext context = new LauncherContext(server.Url, showTray))
                    {
                        if (openBrowser) OpenBrowser(server.Url);
                        Application.Run(context);
                    }
                }
                return 0;
            }
            catch (Exception error) { return ShowError(error, stateFolder, openBrowser); }
            finally
            {
                try { File.Delete(endpointFile); } catch (IOException) { } catch (UnauthorizedAccessException) { }
                mutex.ReleaseMutex();
            }
        }
    }

    internal static void OpenBrowser(string url)
    {
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    }

    private static string WaitForEndpoint(string file, string key)
    {
        for (int attempt = 0; attempt < 30; attempt++)
        {
            try
            {
                Uri uri;
                string endpoint = File.ReadAllText(file).Trim();
                if (Uri.TryCreate(endpoint, UriKind.Absolute, out uri) && uri.Scheme == "http" &&
                    uri.Host == "127.0.0.1" && uri.Port > 0 && uri.AbsolutePath == "/" &&
                    uri.UserInfo == "" && uri.Query == "" && uri.Fragment == "")
                {
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create(new Uri(uri, "__canvas_live_launcher"));
                    request.Proxy = null;
                    request.AllowAutoRedirect = false;
                    request.Timeout = 500;
                    request.ReadWriteTimeout = 500;
                    using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                    using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                    {
                        char[] buffer = new char[128];
                        int count = reader.ReadBlock(buffer, 0, buffer.Length);
                        if (new string(buffer, 0, count) == "CanvasLive:" + key) return uri.AbsoluteUri;
                    }
                }
            }
            catch (IOException) { }
            catch (WebException) { }
            Thread.Sleep(100);
        }
        throw new InvalidOperationException("Canvas Live is still starting or its existing window cannot be reached. Close Canvas Live from the tray and try again.");
    }

    private static int ShowError(Exception error, string stateFolder, bool showDialog)
    {
        string message = "Canvas Live could not open.\n\n" + error.Message + "\n\nKeep the executable and its app folder together.";
        try
        {
            Directory.CreateDirectory(stateFolder);
            File.WriteAllText(Path.Combine(stateFolder, "last-error.txt"), message);
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
        if (showDialog) MessageBox.Show(message, "Canvas Live", MessageBoxButtons.OK, MessageBoxIcon.Error);
        return 1;
    }
}

internal sealed class LauncherContext : ApplicationContext
{
    private readonly NotifyIcon icon;
    private readonly ContextMenuStrip menu;

    internal LauncherContext(string url, bool showTray)
    {
        menu = new ContextMenuStrip();
        menu.Items.Add("Open Canvas Live", null, delegate { Program.OpenBrowser(url); });
        menu.Items.Add("Close Canvas Live", null, delegate { ExitThread(); });
        string iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar), "app", "canvas-live.ico");
        Icon appIcon;
        try { appIcon = new Icon(iconPath); }
        catch (Exception) { appIcon = SystemIcons.Application; }
        icon = new NotifyIcon { Text = "Canvas Live", Icon = appIcon, ContextMenuStrip = menu, Visible = showTray };
        icon.DoubleClick += delegate { Program.OpenBrowser(url); };
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { icon.Visible = false; icon.Dispose(); menu.Dispose(); }
        base.Dispose(disposing);
    }
}

internal sealed class StaticSite : IDisposable
{
    private readonly Dictionary<string, string> assets = new Dictionary<string, string>(StringComparer.Ordinal);
    private readonly List<TcpClient> clients = new List<TcpClient>();
    private readonly SemaphoreSlim slots = new SemaphoreSlim(16);
    private readonly string identity;
    private readonly LocalLibrary library;
    private readonly string packageFolder;
    private TcpListener listener;
    private volatile bool stopping;
    internal string Url { get; private set; }

    internal StaticSite(string root, string key)
    {
        root = Path.GetFullPath(root);
        packageFolder = Path.GetDirectoryName(root);
        library = new LocalLibrary(Path.Combine(Path.GetDirectoryName(root), "data"));
        if (!File.Exists(Path.Combine(root, "index.html")))
            throw new FileNotFoundException("The packaged website is missing: app/index.html.");
        CollectAssets(root, root);
        assets["/"] = assets["/index.html"];
        identity = "CanvasLive:" + key;
    }

    private void CollectAssets(string root, string directory)
    {
        if ((File.GetAttributes(directory) & FileAttributes.ReparsePoint) != 0)
            throw new InvalidOperationException("The app folder must contain regular files and folders.");
        foreach (string file in Directory.GetFiles(directory))
        {
            if ((File.GetAttributes(file) & FileAttributes.ReparsePoint) != 0)
                throw new InvalidOperationException("The app folder must not contain linked files.");
            assets.Add("/" + file.Substring(root.Length + 1).Replace('\\', '/'), file);
        }
        foreach (string child in Directory.GetDirectories(directory)) CollectAssets(root, child);
    }

    internal void Start()
    {
        listener = new TcpListener(IPAddress.Loopback, 4173);
        try { listener.Start(); }
        catch (SocketException)
        {
            listener.Stop();
            listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
        }
        int port = ((IPEndPoint)listener.LocalEndpoint).Port;
        Url = "http://127.0.0.1:" + port + "/";
        Task.Run((Action)AcceptClients);
    }

    private void AcceptClients()
    {
        while (!stopping)
        {
            TcpClient client;
            try { client = listener.AcceptTcpClient(); }
            catch (SocketException) { if (stopping) return; continue; }
            catch (ObjectDisposedException) { return; }
            if (!slots.Wait(0)) { client.Close(); continue; }
            lock (clients) clients.Add(client);
            ThreadPool.QueueUserWorkItem(delegate
            {
                try { Serve(client); }
                catch (IOException) { }
                catch (SocketException) { }
                catch (ObjectDisposedException) { }
                catch (UnauthorizedAccessException) { }
                finally { lock (clients) clients.Remove(client); client.Close(); slots.Release(); }
            });
        }
    }

    private void Serve(TcpClient client)
    {
        client.ReceiveTimeout = 3000;
        client.SendTimeout = 3000;
        using (NetworkStream stream = client.GetStream())
        {
            StringBuilder header = new StringBuilder();
            Stopwatch deadline = Stopwatch.StartNew();
            while (header.Length < 8192)
            {
                if (deadline.ElapsedMilliseconds >= 5000)
                { Reply(stream, 408, "Request Timeout", "text/plain", new byte[0], false); return; }
                int next = stream.ReadByte();
                if (next < 0) return;
                header.Append((char)next);
                if (header.Length >= 4 && header.ToString(header.Length - 4, 4) == "\r\n\r\n") break;
            }
            if (!header.ToString().EndsWith("\r\n\r\n", StringComparison.Ordinal))
            { Reply(stream, 431, "Request Header Fields Too Large", "text/plain", new byte[0], false); return; }
            string[] lines = header.ToString().Split(new string[] { "\r\n" }, StringSplitOptions.None);
            string[] request = lines[0].Split(' ');
            if (request.Length != 3 || (request[2] != "HTTP/1.1" && request[2] != "HTTP/1.0"))
            { Reply(stream, 400, "Bad Request", "text/plain", new byte[0], false); return; }
            string host = null;
            foreach (string line in lines)
                if (line.StartsWith("Host:", StringComparison.OrdinalIgnoreCase))
                {
                    if (host != null) { Reply(stream, 400, "Bad Request", "text/plain", new byte[0], false); return; }
                    host = line.Substring(5).Trim();
                }
            if (host != new Uri(Url).Authority)
            { Reply(stream, 403, "Forbidden", "text/plain", new byte[0], false); return; }
            if (request[1].StartsWith("/__canvas_live_companion", StringComparison.Ordinal))
            { ServeCompanion(stream, request[0], request[1], lines); return; }
            if (library.Serve(stream, request[0], request[1], lines, Url.TrimEnd('/'))) return;
            bool head = request[0] == "HEAD";
            if (request[0] != "GET" && !head)
            { Reply(stream, 405, "Method Not Allowed", "text/plain", new byte[0], false); return; }
            string target = request[1].Split('?')[0];
            if (!target.StartsWith("/", StringComparison.Ordinal) || target.StartsWith("//", StringComparison.Ordinal))
            { Reply(stream, 400, "Bad Request", "text/plain", new byte[0], head); return; }
            string path = Uri.UnescapeDataString(target);
            if (path.IndexOf('\\') >= 0 || path.IndexOf('\0') >= 0 || Array.IndexOf(path.Split('/'), "..") >= 0)
            { Reply(stream, 400, "Bad Request", "text/plain", new byte[0], head); return; }
            if (path == "/__canvas_live_launcher")
            { Reply(stream, 200, "OK", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes(identity), head); return; }
            string file;
            if (!assets.TryGetValue(path, out file))
            { Reply(stream, 404, "Not Found", "text/plain", new byte[0], head); return; }
            if (path == "/" || path == "/index.html")
            {
                string html = File.ReadAllText(file, Encoding.UTF8).Replace("</head>", "<meta name=\"canvas-live-storage\" content=\"local-v1\"></head>");
                Reply(stream, 200, "OK", "text/html; charset=utf-8", Encoding.UTF8.GetBytes(html), head); return;
            }
            using (FileStream content = File.OpenRead(file))
            {
                WriteHeader(stream, 200, "OK", ContentType(file), content.Length);
                if (!head) content.CopyTo(stream);
            }
        }
    }

    private void ServeCompanion(Stream stream, string method, string target, string[] headers)
    {
        string origin = HeaderValue(headers, "Origin");
        string site = HeaderValue(headers, "Sec-Fetch-Site");
        if (target != "/__canvas_live_companion" || method != "GET")
        { Reply(stream, 404, "Not Found", "text/plain", new byte[0], false); return; }
        if (HeaderValue(headers, "X-Canvas-Live-Companion") != "1" ||
            (origin != null && origin != Url.TrimEnd('/')) ||
            (site != null && site != "same-origin" && site != "none"))
        { Reply(stream, 403, "Forbidden", "text/plain", new byte[0], false); return; }
        try
        {
            string folder = Path.Combine(packageFolder, ".canvas-live");
            string file = Path.Combine(folder, "mcp-session.json");
            if ((File.GetAttributes(folder) & FileAttributes.ReparsePoint) != 0 ||
                (File.GetAttributes(file) & FileAttributes.ReparsePoint) != 0)
                throw new IOException("Linked runtime files are not supported.");
            FileInfo info = new FileInfo(file);
            if (info.Length > 16384) throw new IOException("Invalid companion registration.");
            var serializer = new JavaScriptSerializer { MaxJsonLength = 16384, RecursionLimit = 8 };
            var session = serializer.Deserialize<Dictionary<string, object>>(File.ReadAllText(file, Encoding.UTF8));
            object urlValue, codeValue;
            Uri endpoint;
            if (session == null || !session.TryGetValue("url", out urlValue) || !session.TryGetValue("browserPairingCode", out codeValue) ||
                !(urlValue is string) || !(codeValue is string) || !Uri.TryCreate((string)urlValue, UriKind.Absolute, out endpoint) ||
                endpoint.Scheme != "http" || endpoint.Host != "127.0.0.1" || endpoint.UserInfo != "" || endpoint.Query != "" ||
                endpoint.Fragment != "" || endpoint.AbsolutePath != "/mcp" || endpoint.Port < 1024 ||
                !Regex.IsMatch((string)codeValue, "^[A-Za-z0-9_-]{32,256}$"))
                throw new IOException("Invalid companion registration.");
            // Deliberately return only the browser credential, never the MCP bearer token.
            string json = serializer.Serialize(new { url = endpoint.GetLeftPart(UriPartial.Authority), browserPairingCode = (string)codeValue });
            byte[] body = Encoding.UTF8.GetBytes(json);
            byte[] responseHeader = Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: " + body.Length + "\r\nCache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n\r\n");
            stream.Write(responseHeader, 0, responseHeader.Length);
            stream.Write(body, 0, body.Length);
        }
        catch (Exception error)
        {
            if (!(error is IOException) && !(error is UnauthorizedAccessException) && !(error is ArgumentException) && !(error is InvalidOperationException)) throw;
            Reply(stream, 503, "Service Unavailable", "application/json", Encoding.UTF8.GetBytes("{\"error\":\"Start Canvas Live MCP from this package.\"}"), false);
        }
    }

    private static string HeaderValue(string[] lines, string name)
    {
        string value = null;
        foreach (string line in lines)
            if (line.StartsWith(name + ":", StringComparison.OrdinalIgnoreCase))
            {
                if (value != null) return "invalid-duplicate-header";
                value = line.Substring(name.Length + 1).Trim();
            }
        return value;
    }

    private static string ContentType(string file)
    {
        switch (Path.GetExtension(file).ToLowerInvariant())
        {
            case ".html": return "text/html; charset=utf-8";
            case ".js": case ".mjs": return "text/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".json": case ".map": return "application/json";
            case ".svg": return "image/svg+xml";
            case ".png": return "image/png";
            case ".jpg": case ".jpeg": return "image/jpeg";
            case ".webp": return "image/webp";
            case ".ico": return "image/x-icon";
            case ".woff": return "font/woff";
            case ".woff2": return "font/woff2";
            case ".txt": return "text/plain; charset=utf-8";
            default: return "application/octet-stream";
        }
    }

    private static void Reply(Stream stream, int code, string reason, string type, byte[] body, bool head)
    {
        WriteHeader(stream, code, reason, type, body.Length);
        if (!head) stream.Write(body, 0, body.Length);
    }

    private static void WriteHeader(Stream stream, int code, string reason, string type, long length)
    {
        byte[] header = Encoding.ASCII.GetBytes("HTTP/1.1 " + code + " " + reason + "\r\nContent-Type: " + type + "\r\nContent-Length: " + length +
            (code == 405 ? "\r\nAllow: GET, HEAD" : "") +
            "\r\nConnection: close\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\n\r\n");
        stream.Write(header, 0, header.Length);
    }

    public void Dispose()
    {
        stopping = true;
        if (listener != null) listener.Stop();
        lock (clients) foreach (TcpClient client in clients) client.Close();
    }
}
