$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public class WinDiag {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
}
"@

$rows = New-Object System.Collections.Generic.List[object]

$callback = [WinDiag+EnumWindowsProc]{
  param([IntPtr]$hwnd, [IntPtr]$lparam)

  [uint32]$windowPid = 0
  [void][WinDiag]::GetWindowThreadProcessId($hwnd, [ref]$windowPid)

  $title = New-Object System.Text.StringBuilder 512
  [void][WinDiag]::GetWindowText($hwnd, $title, $title.Capacity)

  $className = New-Object System.Text.StringBuilder 256
  [void][WinDiag]::GetClassName($hwnd, $className, $className.Capacity)

  $rect = New-Object WinDiag+RECT
  [void][WinDiag]::GetWindowRect($hwnd, [ref]$rect)

  $process = Get-Process -Id ([int]$windowPid) -ErrorAction SilentlyContinue
  $visible = [WinDiag]::IsWindowVisible($hwnd)
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top

  if ($visible -or $title.Length -gt 0 -or ($process -and $process.ProcessName -match "Feishu|Lark")) {
    $rows.Add([pscustomobject]@{
      Hwnd = ("0x{0:X}" -f $hwnd.ToInt64())
      Pid = [int]$windowPid
      ProcessName = $process.ProcessName
      Title = $title.ToString()
      ClassName = $className.ToString()
      Visible = $visible
      Left = $rect.Left
      Top = $rect.Top
      Width = $width
      Height = $height
    }) | Out-Null
  }

  return $true
}

[void][WinDiag]::EnumWindows($callback, [IntPtr]::Zero)

$rows |
  Sort-Object @{ Expression = { if ($_.ProcessName -match "Feishu|Lark") { 0 } else { 1 } } }, ProcessName, Title |
  ForEach-Object { $_ | ConvertTo-Json -Compress -Depth 4 }
