using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

/** A USB-root icon with a build-time relative target; never stores a drive letter. */
internal static class PortableEntry
{
    [STAThread]
    private static int Main(string[] args)
    {
        bool quiet = Array.IndexOf(args, "--no-ui") >= 0 || Array.IndexOf(args, "--stop") >= 0;
        try
        {
            string root = Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory);
            string target = Path.GetFullPath(Path.Combine(root, PortableTarget.RelativePath));
            if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase) || Path.GetFileName(target) != "Canvas Live MCP.exe" || !File.Exists(target))
                throw new IOException("The Canvas Live portable folder could not be found. Keep this icon and its Canvas Live folder on the same drive.");
            string arguments = Array.IndexOf(args, "--stop") >= 0 ? "--stop" : Array.IndexOf(args, "--no-ui") >= 0 ? "--no-ui" : "";
            Process.Start(new ProcessStartInfo(target, arguments) { WorkingDirectory = Path.GetDirectoryName(target), UseShellExecute = false, CreateNoWindow = true });
            return 0;
        }
        catch (Exception error)
        {
            if (!quiet) MessageBox.Show(error.Message, "Canvas Live MCP", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
