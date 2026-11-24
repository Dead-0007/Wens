Add-Type -ReferencedAssemblies "System.Drawing", "System.Windows.Forms" @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Threading;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class ScreenShooter2 {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    public static bool Capture(string savePath) {
        IntPtr hDesk = OpenDesktop("Default", 0, false, 0x01FF);
        if (hDesk == IntPtr.Zero) return false;

        bool success = false;
        Thread t = new Thread(() => {
            if (!SetThreadDesktop(hDesk)) return;

            int vx = GetSystemMetrics(76); // SM_XVIRTUALSCREEN
            int vy = GetSystemMetrics(77); // SM_YVIRTUALSCREEN
            int vw = GetSystemMetrics(78); // SM_CXVIRTUALSCREEN
            int vh = GetSystemMetrics(79); // SM_CYVIRTUALSCREEN

            if (vw <= 0) vw = GetSystemMetrics(0);
            if (vh <= 0) vh = GetSystemMetrics(1);

            try {
                using (Bitmap bmp = new Bitmap(vw, vh, PixelFormat.Format32bppArgb)) {
                    using (Graphics g = Graphics.FromImage(bmp)) {
                        g.CopyFromScreen(vx, vy, 0, 0, new Size(vw, vh), CopyPixelOperation.SourceCopy);
                    }
                    bmp.Save(savePath, ImageFormat.Png);
                    success = true;
                }
            } catch (Exception ex) {
                Console.WriteLine("Capture error: " + ex.Message);
            }
        });
        t.Start();
        t.Join();
        return success;
    }
}
'@

$outPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'live-desktop-screen.png'
$res = [ScreenShooter2]::Capture($outPath)
Write-Host "Screenshot captured: $res"
if (Test-Path $outPath) {
    $info = Get-Item $outPath
    Write-Host "File size: $($info.Length) bytes, LastWrite: $($info.LastWriteTime)"
}
