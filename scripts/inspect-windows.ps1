Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public class WinInspector2 {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);
    [DllImport("user32.dll")] public static extern bool EnumDesktopWindows(IntPtr hDesktop, EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public static void Inspect(int targetPid) {
        IntPtr hDesk = OpenDesktop("Default", 0, false, 0x01FF);
        Thread t = new Thread(() => {
            SetThreadDesktop(hDesk);
            EnumDesktopWindows(hDesk, (hWnd, lParam) => {
                uint pid;
                GetWindowThreadProcessId(hWnd, out pid);
                if (pid == targetPid) {
                    RECT r;
                    GetWindowRect(hWnd, out r);
                    StringBuilder sbText = new StringBuilder(256);
                    GetWindowText(hWnd, sbText, 256);
                    StringBuilder sbClass = new StringBuilder(256);
                    GetClassName(hWnd, sbClass, 256);
                    bool vis = IsWindowVisible(hWnd);
                    Console.WriteLine("HWND: 0x" + hWnd.ToString("X") + " Class: " + sbClass.ToString() + " Vis: " + vis + " Rect: [" + r.Left + "," + r.Top + "," + r.Right + "," + r.Bottom + "] (" + (r.Right-r.Left) + "x" + (r.Bottom-r.Top) + ") Title: " + sbText.ToString());
                }
                return true;
            }, IntPtr.Zero);
        });
        t.Start();
        t.Join();
    }
}
'@

Get-Process | Where-Object { $_.ProcessName -like "*wens*" } | ForEach-Object {
    Write-Host "Process $($_.ProcessName) PID $($_.Id)"
    [WinInspector2]::Inspect($_.Id)
}
