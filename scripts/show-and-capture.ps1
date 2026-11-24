Add-Type -ReferencedAssemblies "System.Drawing" @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Collections.Generic;

public class WinBringer {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    public static extern bool EnumDesktopWindows(IntPtr hDesktop, EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left, Top, Right, Bottom;
    }

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public static List<IntPtr> TopmostHwnds = new List<IntPtr>();
    public static RECT MainRect = new RECT();
    public static RECT PetRect = new RECT();
    public static bool FoundMain = false;
    public static bool FoundPet = false;

    public static void BringWensToFront() {
        TopmostHwnds.Clear();
        FoundMain = false;
        FoundPet = false;

        IntPtr hDesk = OpenDesktop("Default", 0, false, 0x01FF);
        Thread t = new Thread(() => {
            SetThreadDesktop(hDesk);
            EnumDesktopWindows(hDesk, (hWnd, lParam) => {
                uint pid;
                GetWindowThreadProcessId(hWnd, out pid);
                try {
                    var proc = System.Diagnostics.Process.GetProcessById((int)pid);
                    if (proc.ProcessName.IndexOf("wens", StringComparison.OrdinalIgnoreCase) >= 0) {
                        RECT r;
                        GetWindowRect(hWnd, out r);
                        int w = r.Right - r.Left;
                        int h = r.Bottom - r.Top;
                        StringBuilder sb = new StringBuilder(256);
                        GetWindowText(hWnd, sb, 256);
                        string title = sb.ToString();

                        if (w > 700 && h > 500) {
                            Console.WriteLine("Bringing main window to front: HWND 0x" + hWnd.ToString("X") + " (" + w + "x" + h + ") Title: " + title);
                            ShowWindow(hWnd, 9); // SW_RESTORE
                            ShowWindow(hWnd, 5); // SW_SHOW
                            SetForegroundWindow(hWnd);
                            SetWindowPos(hWnd, new IntPtr(-1), 0, 0, 0, 0, 0x0001 | 0x0002); // HWND_TOPMOST
                            TopmostHwnds.Add(hWnd);
                            MainRect = r;
                            FoundMain = true;
                        } else if (w > 100 && h > 80 && w < 700 && h < 500) {
                            Console.WriteLine("Found companion/pet window: HWND 0x" + hWnd.ToString("X") + " (" + w + "x" + h + ") Title: " + title);
                            SetWindowPos(hWnd, new IntPtr(-1), 0, 0, 0, 0, 0x0001 | 0x0002); // HWND_TOPMOST
                            TopmostHwnds.Add(hWnd);
                            PetRect = r;
                            FoundPet = true;
                        }
                    }
                } catch {}
                return true;
            }, IntPtr.Zero);
        });
        t.Start();
        t.Join();
    }

    public static void RestoreTopmost() {
        IntPtr hDesk = OpenDesktop("Default", 0, false, 0x01FF);
        Thread t = new Thread(() => {
            SetThreadDesktop(hDesk);
            foreach (var hWnd in TopmostHwnds) {
                try {
                    SetWindowPos(hWnd, new IntPtr(-2), 0, 0, 0, 0, 0x0001 | 0x0002); // HWND_NOTOPMOST
                } catch {}
            }
        });
        t.Start();
        t.Join();
    }
}
'@

[WinBringer]::BringWensToFront()
Start-Sleep -Seconds 2

$repoRoot = Split-Path -Parent $PSScriptRoot
$windowCropPath = Join-Path $repoRoot 'live-wens-window.png'
$badgeCropPath = Join-Path $repoRoot 'today-companion-badge-zoomed.png'
& (Join-Path $PSScriptRoot 'capture-screen.ps1')

# Now crop the regions
$fullBmpPath = Join-Path $repoRoot 'live-desktop-screen.png'
if (Test-Path $fullBmpPath) {
    Add-Type -AssemblyName System.Drawing
    $src = [System.Drawing.Image]::FromFile($fullBmpPath)

    if ([WinBringer]::FoundMain) {
        $mr = [WinBringer]::MainRect
        $mw = $mr.Right - $mr.Left
        $mh = $mr.Bottom - $mr.Top

        # 1. Full Wens window crop
        if ($mw -gt 100 -and $mh -gt 100) {
            $cl = [Math]::Max(0, $mr.Left)
            $ct = [Math]::Max(0, $mr.Top)
            $cw = [Math]::Min($src.Width - $cl, $mw)
            $ch = [Math]::Min($src.Height - $ct, $mh)
            $mainCrop = New-Object System.Drawing.Rectangle($cl, $ct, $cw, $ch)
            $destMain = New-Object System.Drawing.Bitmap($mainCrop.Width, $mainCrop.Height)
            $gm = [System.Drawing.Graphics]::FromImage($destMain)
            $gm.DrawImage($src, 0, 0, $mainCrop, [System.Drawing.GraphicsUnit]::Pixel)
            $gm.Dispose()
            $destMain.Save($windowCropPath, [System.Drawing.Imaging.ImageFormat]::Png)
            $destMain.Dispose()
            Write-Host "Saved main window to live-wens-window.png ($cw x $ch)"
        }

        # 2. Zoomed reflection block and companion badge in TodayView
        # Located near top-left of window: x offset ~35-45, y offset ~70-80, width ~280, height ~180
        $rx = [Math]::Max(0, $mr.Left + 40)
        $ry = [Math]::Max(0, $mr.Top + 75)
        $rw = [Math]::Min(300, $src.Width - $rx)
        $rh = [Math]::Min(190, $src.Height - $ry)
        $cropRect = New-Object System.Drawing.Rectangle($rx, $ry, $rw, $rh)
        $dest = New-Object System.Drawing.Bitmap($cropRect.Width, $cropRect.Height)
        $g = [System.Drawing.Graphics]::FromImage($dest)
        $g.DrawImage($src, 0, 0, $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
        $g.Dispose()
        $dest.Save($badgeCropPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $dest.Dispose()
        Write-Host "Saved zoomed reflection badge to today-companion-badge-zoomed.png"
    } else {
        # Fallback to standard crop
        $cropRect = New-Object System.Drawing.Rectangle(170, 205, 290, 180)
        $dest = New-Object System.Drawing.Bitmap($cropRect.Width, $cropRect.Height)
        $g = [System.Drawing.Graphics]::FromImage($dest)
        $g.DrawImage($src, 0, 0, $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
        $g.Dispose()
        $dest.Save($badgeCropPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $dest.Dispose()
        Write-Host "Saved fallback cropped badge to today-companion-badge-zoomed.png"
    }

    $src.Dispose()
}

# Release topmost state
[WinBringer]::RestoreTopmost()
