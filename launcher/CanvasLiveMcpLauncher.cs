using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Runtime.InteropServices;

internal static class McpProgram
{
    [STAThread]
    private static int Main(string[] args)
    {
        string folder = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        string key;
        using (SHA256 hash = SHA256.Create()) key = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(folder.ToLowerInvariant()))).Replace("-", "").Substring(0, 24);
        string sid;
        using (WindowsIdentity identity = WindowsIdentity.GetCurrent()) sid = identity.User.Value;
        string identityKey = sid + "." + key;
        bool quiet = Array.IndexOf(args, "--no-ui") >= 0;
        using (EventWaitHandle stop = new EventWaitHandle(false, EventResetMode.AutoReset, "Local\\CanvasLiveMcp.Stop." + identityKey))
        using (EventWaitHandle show = new EventWaitHandle(false, EventResetMode.AutoReset, "Local\\CanvasLiveMcp.Show." + identityKey))
        {
            if (Array.IndexOf(args, "--stop") >= 0) { stop.Set(); return 0; }
            using (Mutex mutex = new Mutex(false, "Local\\CanvasLiveMcp." + identityKey))
            {
                bool owns;
                try { owns = mutex.WaitOne(0); } catch (AbandonedMutexException) { owns = true; }
                if (!owns) { if (!quiet) show.Set(); return 0; }
                try
                {
                    Application.EnableVisualStyles();
                    Application.SetCompatibleTextRenderingDefault(false);
                    using (McpContext context = new McpContext(folder, key, quiet, stop, show)) Application.Run(context);
                    return 0;
                }
                catch (Exception error)
                {
                    string state = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Canvas Live", "mcp", key);
                    try { Directory.CreateDirectory(state); File.WriteAllText(Path.Combine(state, "last-error.txt"), error.Message); } catch (IOException) { } catch (UnauthorizedAccessException) { }
                    if (!quiet) MessageBox.Show("Canvas Live MCP could not start.\n\n" + error.Message + "\n\nKeep the complete portable folder together.", "Canvas Live MCP", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return 1;
                }
                finally { mutex.ReleaseMutex(); }
            }
        }
    }
}

internal sealed class McpContext : ApplicationContext
{
    private readonly string folder;
    private readonly string sessionPath;
    private readonly Process companion;
    private readonly McpChildJob childJob;
    private readonly NotifyIcon icon;
    private readonly Form window;
    private readonly System.Windows.Forms.Timer timer;
    private readonly EventWaitHandle stop;
    private readonly EventWaitHandle show;
    private readonly Label status;
    private readonly TextBox address;
    private readonly string launcherEndpoint;
    private bool closing;
    private bool ready;

    internal McpContext(string packageFolder, string key, bool quiet, EventWaitHandle stopEvent, EventWaitHandle showEvent)
    {
        folder = packageFolder;
        stop = stopEvent;
        show = showEvent;
        sessionPath = Path.Combine(folder, ".canvas-live", "mcp-session.json");
        string node = Path.Combine(folder, "runtime", "node.exe");
        string script = Path.Combine(folder, "mcp", "server.mjs");
        RequireRegular(node); RequireRegular(script); RequireRegular(Path.Combine(folder, "Canvas Live.exe"));
        string expected = File.ReadAllText(Path.Combine(folder, "runtime", "node.sha256")).Trim();
        using (SHA256 hash = SHA256.Create())
        using (FileStream file = File.OpenRead(node))
            if (!String.Equals(BitConverter.ToString(hash.ComputeHash(file)).Replace("-", ""), expected, StringComparison.OrdinalIgnoreCase)) throw new IOException("The bundled Node runtime failed its integrity check. Repackage Canvas Live.");
        // The native app has its own same-folder mutex and remains independently usable.
        Process app = Process.Start(new ProcessStartInfo(Path.Combine(folder, "Canvas Live.exe"), quiet ? "--no-browser" : "--background") { WorkingDirectory = folder, UseShellExecute = false, CreateNoWindow = true });
        launcherEndpoint = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Canvas Live", "launchers", key, "endpoint.txt");
        for (int attempt = 0; attempt < 80; attempt++)
        {
            if (HealthyApp(key)) break;
            if (app.HasExited && app.ExitCode != 0) throw new IOException("Canvas Live could not start. Open Canvas Live.exe to view its error.");
            if (attempt == 79) throw new IOException("Canvas Live did not become ready in time.");
            Thread.Sleep(100);
        }
        app.Dispose();
        Directory.CreateDirectory(Path.Combine(folder, ".canvas-live"));
        RequireOrdinaryDirectory(Path.Combine(folder, ".canvas-live"));
        if (File.Exists(sessionPath)) { RequireRegular(sessionPath); File.Delete(sessionPath); }
        ProcessStartInfo info = new ProcessStartInfo(node, "\"" + script + "\"") { WorkingDirectory = folder, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        info.EnvironmentVariables["CANVAS_MCP_PORT"] = "0";
        info.EnvironmentVariables["CANVAS_MCP_QUIET"] = "1";
        // Do not pass host Node injection flags into the portable companion.
        info.EnvironmentVariables.Remove("NODE_OPTIONS");
        info.EnvironmentVariables.Remove("NODE_PATH");
        companion = Process.Start(info);
        try { childJob = new McpChildJob(companion); }
        catch { if (!companion.HasExited) companion.Kill(); companion.Dispose(); throw; }
        // Drain streams without persisting credentials or canvas content.
        companion.OutputDataReceived += delegate { };
        companion.ErrorDataReceived += delegate { };
        companion.BeginOutputReadLine(); companion.BeginErrorReadLine();
        window = new Form { Text = "Canvas Live MCP", ClientSize = new Size(580, 420), StartPosition = FormStartPosition.CenterScreen, MinimumSize = new Size(550, 440) };
        Icon appIcon;
        try { appIcon = new Icon(Path.Combine(folder, "app", "canvas-live.ico")); } catch (Exception) { appIcon = SystemIcons.Application; }
        window.Icon = appIcon;
        Label heading = new Label { Text = "Canvas Live MCP", Font = new Font(SystemFonts.MessageBoxFont.FontFamily, 18, FontStyle.Bold), Left = 24, Top = 20, Width = 520, Height = 40 };
        status = new Label { Text = "Starting the local companion...", Left = 24, Top = 70, Width = 520, Height = 28 };
        address = new TextBox { Left = 24, Top = 108, Width = 530, ReadOnly = true, TabStop = true };
        Label steps = new Label { Text = "1. Open a canvas in Canvas Live.\n2. Open Workspace AI and choose Share this canvas.\n3. Connect your MCP-compatible AI client to the address above.\n\nLocal clients use the MCP access token. Cloud clients such as\nChatGPT need their supported secure tunnel or HTTPS setup.\nEach AI client still requires its own connection approval.", Left = 24, Top = 150, Width = 530, Height = 150 };
        Button open = new Button { Text = "Open Canvas Live", Left = 24, Top = 312, Width = 155, Height = 32 };
        open.Click += delegate { OpenApp(); };
        Button token = new Button { Text = "Copy MCP access token", Left = 190, Top = 312, Width = 175, Height = 32 };
        token.Click += delegate { CopyCredential("mcpToken"); };
        Button guide = new Button { Text = "Connection guide", Left = 376, Top = 312, Width = 178, Height = 32 };
        guide.Click += delegate { string doc = Path.Combine(folder, "PORTABLE_MCP.md"); if (File.Exists(doc)) Process.Start(new ProcessStartInfo(doc) { UseShellExecute = true }); };
        Button close = new Button { Text = "Stop MCP", Left = 414, Top = 370, Width = 140, Height = 30 };
        close.Click += delegate { ExitThread(); };
        Label note = new Label { Text = "Closing this window keeps MCP in the tray. Stop MCP ends sharing.", Left = 24, Top = 355, Width = 530, Height = 18 };
        window.Controls.AddRange(new Control[] { heading, status, address, steps, open, token, guide, close, note });
        window.FormClosing += delegate(object sender, FormClosingEventArgs eventArgs) { if (!closing) { eventArgs.Cancel = true; window.Hide(); } };
        ContextMenuStrip menu = new ContextMenuStrip();
        menu.Items.Add("Show MCP status", null, delegate { ShowWindow(); });
        menu.Items.Add("Open Canvas Live", null, delegate { OpenApp(); });
        menu.Items.Add("Stop MCP", null, delegate { ExitThread(); });
        icon = new NotifyIcon { Icon = appIcon, Text = "Canvas Live MCP - starting", ContextMenuStrip = menu, Visible = !quiet };
        icon.DoubleClick += delegate { ShowWindow(); };
        timer = new System.Windows.Forms.Timer { Interval = 300 };
        timer.Tick += delegate { Tick(); };
        timer.Start();
        if (!quiet) window.Show();
    }

    private static void RequireRegular(string path)
    {
        if (!File.Exists(path) || (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new IOException("Required portable file is missing or linked: " + Path.GetFileName(path));
    }
    private static void RequireOrdinaryDirectory(string path)
    {
        if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new IOException("The portable runtime folder must not be a link.");
    }
    private bool HealthyApp(string key)
    {
        try
        {
            Uri uri;
            if (!Uri.TryCreate(File.ReadAllText(launcherEndpoint).Trim(), UriKind.Absolute, out uri) || uri.Host != "127.0.0.1" || uri.Scheme != "http" || uri.AbsolutePath != "/" || uri.UserInfo != "" || uri.Query != "" || uri.Fragment != "") return false;
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(new Uri(uri, "__canvas_live_launcher")); request.Proxy = null; request.Timeout = 500; request.AllowAutoRedirect = false;
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream())) return reader.ReadToEnd() == "CanvasLive:" + key;
        }
        catch (IOException) { return false; } catch (WebException) { return false; }
    }
    private Dictionary<string, object> Session()
    {
        RequireRegular(sessionPath);
        if (new FileInfo(sessionPath).Length > 16384) throw new IOException("Invalid companion registration.");
        return new JavaScriptSerializer { MaxJsonLength = 16384, RecursionLimit = 8 }.Deserialize<Dictionary<string, object>>(File.ReadAllText(sessionPath));
    }
    private void Tick()
    {
        if (stop.WaitOne(0)) { ExitThread(); return; }
        if (show.WaitOne(0)) ShowWindow();
        if (companion.HasExited) { status.Text = "The companion stopped. Close MCP and open it again."; icon.Text = "Canvas Live MCP - stopped"; return; }
        if (!ready)
            try { var session = Session(); address.Text = (string)session["url"]; status.Text = "Ready locally. Share a canvas to allow AI access."; icon.Text = "Canvas Live MCP - ready"; ready = true; } catch (Exception) { }
    }
    private void CopyCredential(string field)
    {
        try { var session = Session(); Clipboard.SetText((string)session[field]); status.Text = "MCP access token copied. Paste only into your trusted AI client's connection settings."; }
        catch (Exception) { status.Text = "The companion is not ready. Try again in a moment."; }
    }
    private void OpenApp()
    {
        Process.Start(new ProcessStartInfo(Path.Combine(folder, "Canvas Live.exe")) { WorkingDirectory = folder, UseShellExecute = true });
    }
    private void ShowWindow() { window.Show(); window.WindowState = FormWindowState.Normal; window.Activate(); }
    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            closing = true; timer.Stop(); timer.Dispose(); icon.Visible = false; icon.Dispose(); window.Dispose();
            try { if (!companion.HasExited) { companion.Kill(); companion.WaitForExit(3000); } } catch (InvalidOperationException) { }
            companion.Dispose();
            childJob.Dispose();
            try { if (File.Exists(sessionPath)) { RequireRegular(sessionPath); File.Delete(sessionPath); } } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }
        base.Dispose(disposing);
    }
}

/** Closing or crashing this launcher stops only the companion process it owns. */
internal sealed class McpChildJob : IDisposable
{
    private IntPtr handle;
    [StructLayout(LayoutKind.Sequential)] private struct BasicLimits { internal long PerProcessUserTimeLimit; internal long PerJobUserTimeLimit; internal uint LimitFlags; internal UIntPtr MinimumWorkingSetSize; internal UIntPtr MaximumWorkingSetSize; internal uint ActiveProcessLimit; internal UIntPtr Affinity; internal uint PriorityClass; internal uint SchedulingClass; }
    [StructLayout(LayoutKind.Sequential)] private struct IoCounters { internal ulong ReadOperationCount; internal ulong WriteOperationCount; internal ulong OtherOperationCount; internal ulong ReadTransferCount; internal ulong WriteTransferCount; internal ulong OtherTransferCount; }
    [StructLayout(LayoutKind.Sequential)] private struct ExtendedLimits { internal BasicLimits BasicLimitInformation; internal IoCounters IoInfo; internal UIntPtr ProcessMemoryLimit; internal UIntPtr JobMemoryLimit; internal UIntPtr PeakProcessMemoryUsed; internal UIntPtr PeakJobMemoryUsed; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimits information, uint length);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
    internal McpChildJob(Process process)
    {
        handle = CreateJobObject(IntPtr.Zero, null);
        ExtendedLimits limits = new ExtendedLimits(); limits.BasicLimitInformation.LimitFlags = 0x2000;
        if (handle == IntPtr.Zero || !SetInformationJobObject(handle, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits))) || !AssignProcessToJobObject(handle, process.Handle))
        { Dispose(); throw new IOException("Windows could not establish the companion's process lifetime."); }
    }
    public void Dispose() { if (handle != IntPtr.Zero) { CloseHandle(handle); handle = IntPtr.Zero; } }
}
