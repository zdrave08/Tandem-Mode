import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const SERVICE_NAME = "TandemMode";
const ACCOUNT_NAME = os.userInfo().username;

const CRED_PATH = path.join(os.homedir(), "AppData", "Local", "TandemMode", "credentials.dat");
// Nije tajna — samo dodatni ulaz pomešan sa DPAPI ključem vezanim za OS nalog,
// koji je stvarna zaštita.
const ENTROPY = "tandem-mode-v1";

/**
 * Windows: DPAPI-šifrovan fajl umesto punog Windows Credential Manager-a — isti
 * mehanizam (samo ovaj OS nalog može dešifrovati), ali direktan .NET poziv
 * bez multi-platform auto-detekcije.
 * macOS: Keychain preko ugrađenog `security` CLI-ja.
 * Linux: Secret Service (gnome-keyring/kwallet) preko `secret-tool` (libsecret).
 *
 * `cross-keychain` je probana prva (M2) i odbačena: 15-18s po pozivu na
 * ovoj mašini čak i sa native bindingom, jer njena detekcija backend-a
 * proba sve platforme redom — otud direktni pozivi po platformi ovde.
 *
 * Ključ se na Windows-u i Linux-u prosleđuje ISKLJUČIVO kroz stdin, nikad
 * kroz argumente komande — argumenti su vidljivi u listi procesa dok proces
 * traje. `security` na macOS-u nema stdin-varijantu za `-w`, pa ključ tu
 * kratkotrajno prolazi kroz argv; poznat i prihvaćen kompromis (isto važi
 * za većinu CLI alata koji wrap-uju Keychain).
 */
function run(cmd: string, args: string[], stdin?: string): Promise<{ stdout: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(`Komanda "${cmd}" nije pronađena. ${MISSING_TOOL_HINT[cmd] ?? ""}`));
      } else {
        reject(err);
      }
    });
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout: stdout.trim(), code });
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim()}`));
    });
    if (stdin !== undefined) child.stdin.write(stdin, "utf8");
    child.stdin.end();
  });
}

const MISSING_TOOL_HINT: Record<string, string> = {
  "secret-tool": "Instaliraj libsecret-tools (Debian/Ubuntu: sudo apt install libsecret-tools) i pokreni gnome-keyring ili drugi Secret Service provider.",
};

function runPs(script: string, stdin?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`powershell exited with code ${code}: ${stderr.trim()}`));
    });
    if (stdin !== undefined) child.stdin.write(stdin, "utf8");
    child.stdin.end();
  });
}

async function getStoredApiKeyWindows(): Promise<string | null> {
  const script = `
Add-Type -AssemblyName System.Security
$path = '${CRED_PATH.replace(/'/g, "''")}'
if (-not (Test-Path $path)) { Write-Output '__NULL__'; exit }
try {
  $protected = [System.IO.File]::ReadAllBytes($path)
  $entropy = [System.Text.Encoding]::UTF8.GetBytes('${ENTROPY}')
  $bytes = [System.Security.Cryptography.ProtectedData]::Unprotect($protected, $entropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
  [System.Text.Encoding]::UTF8.GetString($bytes)
} catch {
  Write-Output '__NULL__'
}`;
  const result = await runPs(script);
  return result === "__NULL__" || result === "" ? null : result;
}

async function setStoredApiKeyWindows(key: string): Promise<void> {
  const dir = path.dirname(CRED_PATH);
  const script = `
Add-Type -AssemblyName System.Security
New-Item -ItemType Directory -Force -Path '${dir.replace(/'/g, "''")}' | Out-Null
$key = [Console]::In.ReadToEnd()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($key)
$entropy = [System.Text.Encoding]::UTF8.GetBytes('${ENTROPY}')
$protected = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[System.IO.File]::WriteAllBytes('${CRED_PATH.replace(/'/g, "''")}', $protected)`;
  await runPs(script, key);
}

async function deleteStoredApiKeyWindows(): Promise<void> {
  const script = `
$path = '${CRED_PATH.replace(/'/g, "''")}'
if (Test-Path $path) { Remove-Item $path -Force }`;
  await runPs(script);
}

async function getStoredApiKeyMac(): Promise<string | null> {
  try {
    const { stdout } = await run("security", ["find-generic-password", "-a", ACCOUNT_NAME, "-s", SERVICE_NAME, "-w"]);
    return stdout === "" ? null : stdout;
  } catch {
    return null;
  }
}

async function setStoredApiKeyMac(key: string): Promise<void> {
  await run("security", [
    "add-generic-password",
    "-a", ACCOUNT_NAME,
    "-s", SERVICE_NAME,
    "-w", key,
    "-U",
  ]);
}

async function deleteStoredApiKeyMac(): Promise<void> {
  try {
    await run("security", ["delete-generic-password", "-a", ACCOUNT_NAME, "-s", SERVICE_NAME]);
  } catch {
    // ništa nije bilo sačuvano — u redu je
  }
}

async function getStoredApiKeyLinux(): Promise<string | null> {
  try {
    const { stdout } = await run("secret-tool", ["lookup", "service", SERVICE_NAME, "account", ACCOUNT_NAME]);
    return stdout === "" ? null : stdout;
  } catch {
    return null;
  }
}

async function setStoredApiKeyLinux(key: string): Promise<void> {
  await run(
    "secret-tool",
    ["store", "--label", "Tandem Mode API key", "service", SERVICE_NAME, "account", ACCOUNT_NAME],
    key,
  );
}

async function deleteStoredApiKeyLinux(): Promise<void> {
  try {
    await run("secret-tool", ["clear", "service", SERVICE_NAME, "account", ACCOUNT_NAME]);
  } catch {
    // ništa nije bilo sačuvano — u redu je
  }
}

export async function getStoredApiKey(): Promise<string | null> {
  switch (process.platform) {
    case "win32":
      return getStoredApiKeyWindows();
    case "darwin":
      return getStoredApiKeyMac();
    case "linux":
      return getStoredApiKeyLinux();
    default:
      throw new Error(`Čuvanje API ključa nije podržano na platformi "${process.platform}".`);
  }
}

export async function setStoredApiKey(key: string): Promise<void> {
  switch (process.platform) {
    case "win32":
      return setStoredApiKeyWindows(key);
    case "darwin":
      return setStoredApiKeyMac(key);
    case "linux":
      return setStoredApiKeyLinux(key);
    default:
      throw new Error(`Čuvanje API ključa nije podržano na platformi "${process.platform}".`);
  }
}

export async function deleteStoredApiKey(): Promise<void> {
  switch (process.platform) {
    case "win32":
      return deleteStoredApiKeyWindows();
    case "darwin":
      return deleteStoredApiKeyMac();
    case "linux":
      return deleteStoredApiKeyLinux();
    default:
      throw new Error(`Čuvanje API ključa nije podržano na platformi "${process.platform}".`);
  }
}
