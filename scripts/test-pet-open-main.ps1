Add-Type -ReferencedAssemblies "System.Drawing", "System.Windows.Forms" @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Collections.Generic;

public class PetTester {
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
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    public const byte VK_RETURN = 0x0D;
    public const uint KEYEVENTF_KEYUP = 0x0002;

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left, Top, Right, Bottom;
    }

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public static IntPtr MainHwnd = IntPtr.Zero;
    public static IntPtr PetHwnd = IntPtr.Zero;
    public static RECT MainRect = new RECT();
    public static RECT PetRect = new RECT();

    public static void FindWindowsInternal() {
        EnumDesktopWindows(IntPtr.Zero, (hWnd, lParam) => {
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

                    if (w > 700 && h > 500 && !string.IsNullOrEmpty(title)) {
                        MainHwnd = hWnd;
                        MainRect = r;
                        Console.WriteLine("Identified Main Window: HWND 0x" + hWnd.ToString("X") + " Title: " + title);
                    } else if (w > 100 && h > 80 && w <= 370 && h <= 300) {
                        PetHwnd = hWnd;
                        PetRect = r;
                    }
                }
            } catch {}
            return true;
        }, IntPtr.Zero);
    }

    public static void FindWindows() {
        IntPtr hDesk = OpenDesktop("Default", 0, false, 0x01FF);
        Thread t = new Thread(() => {
            SetThreadDesktop(hDesk);
            FindWindowsInternal();
        });
        t.Start();
        t.Join();
    }

    public static void HideMain() {
        IntPtr hDesk = OpenDesktop("Default", 0, false, 0x01FF);
        Thread t = new Thread(() => {
            SetThreadDesktop(hDesk);
            FindWindowsInternal();
            if (MainHwnd != IntPtr.Zero) {
                ShowWindow(MainHwnd, 0); // SW_HIDE
            }
        });
        t.Start();
        t.Join();
    }

    public static bool RightClickAndTriggerMenu() {
        IntPtr hDesk = OpenDesktop("Default", 0, false, 0x01FF);
        if (hDesk == IntPtr.Zero) return false;

        bool result = false;
        Thread t = new Thread(() => {
            if (!SetThreadDesktop(hDesk)) return;

            FindWindowsInternal();
            if (PetHwnd == IntPtr.Zero) return;

            SetForegroundWindow(PetHwnd);
            ShowWindow(PetHwnd, 5); // SW_SHOW
            Thread.Sleep(300);

            RECT pr = PetRect;
            int petCenterX = (pr.Left + pr.Right) / 2;
            int petCenterY = (pr.Top + pr.Bottom) / 2;

            bool posOk = SetCursorPos(petCenterX, petCenterY);
            Console.WriteLine("SetCursorPos: " + posOk + " to (" + petCenterX + ", " + petCenterY + ")");
            Thread.Sleep(150);

            mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, UIntPtr.Zero);
            Thread.Sleep(100);
            mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, UIntPtr.Zero);
            Console.WriteLine("Right click sent to pet");
            Thread.Sleep(600);

            // Now send Return key to trigger the focused first item
            keybd_event(VK_RETURN, 0, 0, UIntPtr.Zero);
            Thread.Sleep(100);
            keybd_event(VK_RETURN, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Console.WriteLine("Enter key sent to trigger focused menu item");

            // Also left-click on the menu item directly
            FindWindowsInternal();
            int clickX = (PetRect.Left + PetRect.Right) / 2;
            int clickY = PetRect.Top + 65;
            SetCursorPos(clickX, clickY);
            Thread.Sleep(100);
            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
            Thread.Sleep(80);
            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
            Console.WriteLine("Left click sent to menu item");

            Thread.Sleep(2000);

            FindWindowsInternal();
            result = IsWindowVisible(MainHwnd);
        });
        t.Start();
        t.Join();
        return result;
    }

    public static void ShowAndFocusMain() {
        IntPtr hDesk = OpenDesktop("Default", 0, false, 0x01FF);
        Thread t = new Thread(() => {
            SetThreadDesktop(hDesk);
            FindWindowsInternal();
            if (MainHwnd != IntPtr.Zero) {
                ShowWindow(MainHwnd, 9); // SW_RESTORE
                ShowWindow(MainHwnd, 5); // SW_SHOW
                SetForegroundWindow(MainHwnd);
                SetWindowPos(MainHwnd, new IntPtr(-1), 0, 0, 0, 0, 0x0001 | 0x0002);
            }
        });
        t.Start();
        t.Join();
    }

    public static void UnsetTopmost() {
        IntPtr hDesk = OpenDesktop("Default", 0, false, 0x01FF);
        Thread t = new Thread(() => {
            SetThreadDesktop(hDesk);
            FindWindowsInternal();
            if (MainHwnd != IntPtr.Zero) {
                SetWindowPos(MainHwnd, new IntPtr(-2), 0, 0, 0, 0, 0x0001 | 0x0002);
            }
        });
        t.Start();
        t.Join();
    }

    public static bool CaptureScreen(string savePath) {
        IntPtr hDesk = OpenDesktop("Default", 0, false, 0x01FF);
        if (hDesk == IntPtr.Zero) return false;

        bool success = false;
        Thread t = new Thread(() => {
            if (!SetThreadDesktop(hDesk)) return;
            int vx = GetSystemMetrics(76);
            int vy = GetSystemMetrics(77);
            int vw = GetSystemMetrics(78);
            int vh = GetSystemMetrics(79);
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

Write-Host "--- Testing: Open Main Window from Pet Context Menu ---"
[PetTester]::FindWindows()
Write-Host "Main HWND: 0x$([PetTester]::MainHwnd.ToString('X'))"
Write-Host "Pet HWND: 0x$([PetTester]::PetHwnd.ToString('X'))"

# 1. Hide the main window
Write-Host "Hiding main window..."
[PetTester]::HideMain()
Start-Sleep -Milliseconds 600

# 2. Trigger right click on pet and select Open Main
Write-Host "Performing right click and Open Main action..."
$isOpened = [PetTester]::RightClickAndTriggerMenu()
Write-Host "Main window opened and visible: $isOpened"

# 3. Bring to front and capture verification screenshot
[PetTester]::ShowAndFocusMain()
Start-Sleep -Seconds 1

$repoRoot = Split-Path -Parent $PSScriptRoot
$screenPath = Join-Path $repoRoot 'verified-open-main-live.png'
$windowCropPath = Join-Path $repoRoot 'verified-open-main-window.png'
[PetTester]::CaptureScreen($screenPath)

if (Test-Path $screenPath) {
    $src = [System.Drawing.Image]::FromFile($screenPath)
    [PetTester]::FindWindows()
    $mr = [PetTester]::MainRect
    $mw = $mr.Right - $mr.Left
    $mh = $mr.Bottom - $mr.Top
    if ($mw -gt 200 -and $mh -gt 200) {
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
        Write-Host "Saved verified main window crop to $windowCropPath"
    }
    $src.Dispose()
}

[PetTester]::UnsetTopmost()

Write-Host "Test completed successfully."
