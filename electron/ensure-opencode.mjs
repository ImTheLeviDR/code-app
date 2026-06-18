import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const platformMap = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'windows',
};

const archMap = {
  x64: 'x64',
  arm64: 'arm64',
  arm: 'arm',
};

const platform = platformMap[os.platform()] ?? os.platform();
const arch = archMap[os.arch()] ?? os.arch();
const base = `opencode-${platform}-${arch}`;
const sourceBinary = platform === 'windows' ? 'opencode.exe' : 'opencode';

export function resolveAppRoot() {
  try {
    const { app } = require('electron');
    if (app.isPackaged) {
      const unpackedRoot = path.join(process.resourcesPath, 'app.asar.unpacked');
      if (fs.existsSync(path.join(unpackedRoot, 'node_modules'))) {
        return unpackedRoot;
      }
    }
  } catch {
    /* ignore */
  }

  return path.join(__dirname, '..');
}

function getTargetBinary(appRoot) {
  return path.join(appRoot, 'node_modules', 'opencode-ai', 'bin', sourceBinary);
}

function supportsAvx2() {
  if (arch !== 'x64') return false;

  if (platform === 'linux') {
    try {
      return /(^|\s)avx2(\s|$)/i.test(fs.readFileSync('/proc/cpuinfo', 'utf8'));
    } catch {
      return false;
    }
  }

  if (platform === 'darwin') {
    try {
      const result = childProcess.spawnSync('sysctl', ['-n', 'hw.optional.avx2_0'], {
        encoding: 'utf8',
        timeout: 1500,
      });
      if (result.status !== 0) return false;
      return (result.stdout || '').trim() === '1';
    } catch {
      return false;
    }
  }

  if (platform === 'windows') {
    const command =
      '(Add-Type -MemberDefinition "[DllImport(""kernel32.dll"")] public static extern bool IsProcessorFeaturePresent(int ProcessorFeature);" -Name Kernel32 -Namespace Win32 -PassThru)::IsProcessorFeaturePresent(40)';

    for (const executable of ['powershell.exe', 'pwsh.exe', 'pwsh', 'powershell']) {
      try {
        const result = childProcess.spawnSync(executable, ['-NoProfile', '-NonInteractive', '-Command', command], {
          encoding: 'utf8',
          timeout: 3000,
          windowsHide: true,
        });
        if (result.status !== 0) continue;
        const output = (result.stdout || '').trim().toLowerCase();
        if (output === 'true' || output === '1') return true;
        if (output === 'false' || output === '0') return false;
      } catch {
        continue;
      }
    }
  }

  return false;
}

function isMusl() {
  if (platform !== 'linux') return false;

  try {
    if (fs.existsSync('/etc/alpine-release')) return true;
  } catch {
    /* ignore */
  }

  try {
    const result = childProcess.spawnSync('ldd', ['--version'], { encoding: 'utf8' });
    return `${result.stdout || ''}${result.stderr || ''}`.toLowerCase().includes('musl');
  } catch {
    return false;
  }
}

function platformPackageNames() {
  const baseline = arch === 'x64' && !supportsAvx2();

  if (platform === 'linux') {
    if (isMusl()) {
      if (arch === 'x64') {
        return baseline
          ? [`${base}-baseline-musl`, `${base}-musl`, `${base}-baseline`, base]
          : [`${base}-musl`, `${base}-baseline-musl`, base, `${base}-baseline`];
      }
      return [`${base}-musl`, base];
    }

    if (arch === 'x64') {
      return baseline
        ? [`${base}-baseline`, base, `${base}-baseline-musl`, `${base}-musl`]
        : [base, `${base}-baseline`, `${base}-musl`, `${base}-baseline-musl`];
    }
    return [base, `${base}-musl`];
  }

  if (arch === 'x64') return baseline ? [`${base}-baseline`, base] : [base, `${base}-baseline`];
  return [base];
}

function readOpencodeVersion(appRoot) {
  try {
    const pkgPath = path.join(appRoot, 'node_modules', 'opencode-ai', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version || null;
  } catch {
    return null;
  }
}

function copyBinary(source, target) {
  if (!fs.existsSync(source)) {
    throw new Error(`Binary not found at ${source}`);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) fs.unlinkSync(target);

  try {
    fs.linkSync(source, target);
  } catch {
    fs.copyFileSync(source, target);
  }

  if (platform !== 'windows') {
    fs.chmodSync(target, 0o755);
  }
}

function verifyBinary(binaryPath) {
  if (!fs.existsSync(binaryPath)) return false;

  const result = childProcess.spawnSync(binaryPath, ['--version'], {
    encoding: 'utf8',
    stdio: 'ignore',
    windowsHide: true,
    timeout: 15000,
  });

  return result.status === 0;
}

function resolvePlatformBinary(appRoot, packageName) {
  const candidate = path.join(appRoot, 'node_modules', packageName, 'bin', sourceBinary);
  if (fs.existsSync(candidate)) return candidate;

  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`, { paths: [appRoot] });
    const resolvedCandidate = path.join(path.dirname(packageJsonPath), 'bin', sourceBinary);
    if (fs.existsSync(resolvedCandidate)) return resolvedCandidate;
  } catch {
    /* ignore */
  }

  return null;
}

function installPlatformPackage(packageName, version, target) {
  if (!version) return false;

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-install-'));
  try {
    const result = childProcess.spawnSync(
      'npm',
      ['install', '--ignore-scripts', '--no-save', '--loglevel=error', '--prefix', temp, `${packageName}@${version}`],
      { stdio: 'ignore', windowsHide: true },
    );
    if (result.status !== 0) return false;

    const source = path.join(temp, 'node_modules', packageName, 'bin', sourceBinary);
    copyBinary(source, target);
    return verifyBinary(target);
  } catch {
    return false;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

export async function ensureOpencodeInstalled() {
  const appRoot = resolveAppRoot();
  const target = getTargetBinary(appRoot);

  if (verifyBinary(target)) {
    return { ok: true, path: target, installed: false };
  }

  const version = readOpencodeVersion(appRoot);

  for (const packageName of platformPackageNames()) {
    const source = resolvePlatformBinary(appRoot, packageName);
    if (!source) continue;

    try {
      copyBinary(source, target);
      if (verifyBinary(target)) {
        return { ok: true, path: target, installed: true, source: packageName };
      }
    } catch {
      /* try next package */
    }
  }

  for (const packageName of platformPackageNames()) {
    if (installPlatformPackage(packageName, version, target)) {
      return { ok: true, path: target, installed: true, source: packageName, downloaded: true };
    }
  }

  throw new Error(
    `OpenCode CLI is missing. Expected ${target}. Reinstall the app or run npm install in the project root.`,
  );
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  ensureOpencodeInstalled()
    .then((result) => {
      if (result.installed) {
        console.log(`OpenCode installed at ${result.path}`);
      }
    })
    .catch((error) => {
      console.error(error.message || error);
      process.exit(1);
    });
}
