import fs from 'fs';
import path from 'path';

function incrementVersion() {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const tauriConfPath = path.join(process.cwd(), 'src-tauri', 'tauri.conf.json');
  const cargoTomlPath = path.join(process.cwd(), 'src-tauri', 'Cargo.toml');
  const versionJsonPath = path.join(process.cwd(), 'src', 'version.json');

  // 1. Read and parse package.json
  if (!fs.existsSync(packageJsonPath)) {
    console.error('package.json not found!');
    process.exit(1);
  }
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const currentVersion = packageJson.version;

  // Split and increment the patch version (e.g. 4.5.5 -> 4.5.6)
  const versionParts = currentVersion.split('.');
  if (versionParts.length !== 3) {
    console.error(`Invalid version format in package.json: ${currentVersion}`);
    process.exit(1);
  }
  const major = parseInt(versionParts[0], 10);
  const minor = parseInt(versionParts[1], 10);
  const patch = parseInt(versionParts[2], 10);
  const newVersion = `${major}.${minor}.${patch + 1}`;

  console.log(`Incrementing version from ${currentVersion} to ${newVersion}...`);

  // 2. Write package.json
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log('Updated package.json');

  // 3. Write tauri.conf.json
  if (fs.existsSync(tauriConfPath)) {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
    tauriConf.version = newVersion;
    fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
    console.log('Updated tauri.conf.json');
  } else {
    console.warn('tauri.conf.json not found, skipping...');
  }

  // 4. Write Cargo.toml (Rust)
  if (fs.existsSync(cargoTomlPath)) {
    let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
    // Replace version = "x.y.z"
    const cargoVersionRegex = /^version\s*=\s*"[^"]*"/m;
    if (cargoVersionRegex.test(cargoToml)) {
      cargoToml = cargoToml.replace(cargoVersionRegex, `version = "${newVersion}"`);
      fs.writeFileSync(cargoTomlPath, cargoToml);
      console.log('Updated Cargo.toml');
    } else {
      console.warn('Could not find version field in Cargo.toml');
    }
  } else {
    console.warn('Cargo.toml not found, skipping...');
  }

  // 5. Create/update src/version.json
  const versionData = { version: newVersion };
  fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2) + '\n');
  console.log('Updated src/version.json');
}

incrementVersion();
