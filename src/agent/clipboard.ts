import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function saveClipboardImage(destPath: string): Promise<boolean> {
  if (process.platform === "linux") return saveWithXclip(destPath);
  if (process.platform === "darwin") return saveWithPngpaste(destPath);
  if (process.platform !== "win32") return false;

  const escapedPath = destPath.replace(/'/g, "''");
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
  $img = [System.Windows.Forms.Clipboard]::GetImage()
  $img.Save('${escapedPath}', [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output "OK"
} else {
  Write-Output "NO_IMAGE"
}`;

  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
  return stdout.trim() === "OK";
}

async function saveWithXclip(destPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "xclip",
      ["-selection", "clipboard", "-t", "image/png", "-o"],
      { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
    );
    if (stdout.length === 0) return false;
    await writeFile(destPath, stdout);
    return true;
  } catch {
    return false;
  }
}

async function saveWithPngpaste(destPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "pngpaste",
      ["-"],
      { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
    );
    if (stdout.length === 0) return false;
    await writeFile(destPath, stdout);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
  }

  const escapedPath = destPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `
set imageData to the clipboard as «class PNGf»
set outputFile to open for access POSIX file "${escapedPath}" with write permission
try
  set eof outputFile to 0
  write imageData to outputFile
  close access outputFile
on error errorMessage number errorNumber
  close access outputFile
  error errorMessage number errorNumber
end try`;

  try {
    await execFileAsync("osascript", ["-e", script]);
    return true;
  } catch {
    return false;
  }
}
