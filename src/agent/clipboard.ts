import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { unlink } from "node:fs/promises";

const execFileAsync = promisify(execFile);

async function saveClipboardImageWindows(destPath: string): Promise<boolean> {
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

/**
 * Ne postoji ugrađen Node/OS API za sliku sa clipboard-a na macOS-u, ali
 * AppleScript ume da upiše sirove podatke sa clipboard-a direktno u fajl —
 * bez trećih alata (pngpaste i sl.). Aplikacije obično stave PNG na
 * clipboard; screenshot alati i neki editori stave TIFF, pa se u tom
 * slučaju konvertuje u PNG preko `sips` (takođe ugrađen u macOS).
 */
async function saveClipboardImageMac(destPath: string): Promise<boolean> {
  const escapedDest = destPath.replace(/"/g, '\\"');
  const tmpTiff = `${destPath}.tmp.tiff`;
  const escapedTmpTiff = tmpTiff.replace(/"/g, '\\"');
  const script = `
try
  set imgData to the clipboard as «class PNGf»
  set fileRef to open for access (POSIX file "${escapedDest}") with write permission
  set eof of fileRef to 0
  write imgData to fileRef
  close access fileRef
  return "OK"
on error
  try
    set imgData to the clipboard as «class TIFF»
    set fileRef to open for access (POSIX file "${escapedTmpTiff}") with write permission
    set eof of fileRef to 0
    write imgData to fileRef
    close access fileRef
    return "TIFF"
  on error
    return "NO_IMAGE"
  end try
end try`;

  const { stdout } = await execFileAsync("osascript", ["-e", script]);
  const result = stdout.trim();
  if (result === "NO_IMAGE") return false;
  if (result === "TIFF") {
    await execFileAsync("sips", ["-s", "format", "png", tmpTiff, "--out", destPath]);
    await unlink(tmpTiff).catch(() => {});
  }
  return true;
}

type BinaryResult = { kind: "data"; buf: Buffer } | { kind: "empty" } | { kind: "not-found" };

/** Čita binarni stdout komande; razlikuje "komanda ne postoji" od "nema šta da vrati". */
function readBinaryStdout(cmd: string, args: string[]): Promise<BinaryResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    const chunks: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.on("error", (err) => {
      resolve((err as NodeJS.ErrnoException).code === "ENOENT" ? { kind: "not-found" } : { kind: "empty" });
    });
    child.on("close", (code) => {
      if (code !== 0 || chunks.length === 0) resolve({ kind: "empty" });
      else resolve({ kind: "data", buf: Buffer.concat(chunks) });
    });
  });
}

/**
 * Linux nema jedinstven clipboard API — bira se alat prema session tipu:
 * `wl-paste` (wl-clipboard) na Wayland-u, `xclip` na X11. Nijedan nije
 * garantovano instaliran; jasna greška upućuje korisnika koji paket da doda.
 */
async function saveClipboardImageLinux(destPath: string): Promise<boolean> {
  const isWayland = Boolean(process.env["WAYLAND_DISPLAY"]);
  const cmd = isWayland ? "wl-paste" : "xclip";
  const args = isWayland
    ? ["--type", "image/png", "--no-newline"]
    : ["-selection", "clipboard", "-t", "image/png", "-o"];

  const result = await readBinaryStdout(cmd, args);
  if (result.kind === "not-found") {
    const hint = isWayland
      ? "Instaliraj wl-clipboard (npr. sudo apt install wl-clipboard)."
      : "Instaliraj xclip (npr. sudo apt install xclip).";
    throw new Error(`Komanda "${cmd}" nije pronađena. ${hint}`);
  }
  if (result.kind === "empty") return false;

  const { writeFile } = await import("node:fs/promises");
  await writeFile(destPath, result.buf);
  return true;
}

export async function saveClipboardImage(destPath: string): Promise<boolean> {
  switch (process.platform) {
    case "win32":
      return saveClipboardImageWindows(destPath);
    case "darwin":
      return saveClipboardImageMac(destPath);
    case "linux":
      return saveClipboardImageLinux(destPath);
    default:
      throw new Error(`Clipboard paste slike nije podržan na platformi "${process.platform}".`);
  }
}
