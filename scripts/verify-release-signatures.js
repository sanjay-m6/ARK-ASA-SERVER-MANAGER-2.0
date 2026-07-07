import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function getPublicKey() {
  const tauriConfPath = path.join(process.cwd(), 'src-tauri', 'tauri.conf.json');
  if (!fs.existsSync(tauriConfPath)) {
    throw new Error(`Tauri config not found at ${tauriConfPath}`);
  }
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
  const pubkeyB64 = tauriConf.plugins?.updater?.pubkey;
  if (!pubkeyB64) {
    throw new Error('plugins.updater.pubkey is missing in tauri.conf.json');
  }

  const pubkeyFileContent = Buffer.from(pubkeyB64, 'base64').toString('utf-8');
  const pubkeyLines = pubkeyFileContent.trim().split('\n');
  if (pubkeyLines.length < 2) {
    throw new Error('Invalid public key format in tauri.conf.json');
  }
  const pubkeyBytes = Buffer.from(pubkeyLines[1], 'base64');
  if (pubkeyBytes.length < 42) {
    throw new Error('Decoded public key is too short');
  }
  return pubkeyBytes.slice(10, 42); // 32 bytes raw public key
}

function verifyFileSignature(filePath, sigFilePath, publicKeyRaw) {
  console.log(`Verifying: ${path.basename(filePath)}`);
  console.log(`Using signature: ${path.basename(sigFilePath)}`);

  const fileContent = fs.readFileSync(filePath);
  const sigB64 = fs.readFileSync(sigFilePath, 'utf8').trim();

  // Decode signature file content (minisign structure)
  const sigFileContent = Buffer.from(sigB64, 'base64').toString('utf-8');
  const sigLines = sigFileContent.trim().split('\n');
  if (sigLines.length < 4) {
    throw new Error(`Invalid signature format in ${sigFilePath}`);
  }

  const sigBytes = Buffer.from(sigLines[1], 'base64');
  const sigAlgStr = sigBytes.slice(0, 2).toString('utf8');
  const pureSig = sigBytes.slice(10, 74); // 64 bytes raw signature

  // Wrap raw public key in DER SPKI format
  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  const spkiDer = Buffer.concat([spkiPrefix, publicKeyRaw]);
  const publicKey = crypto.createPublicKey({
    key: spkiDer,
    format: 'der',
    type: 'spki',
  });

  let messageToVerify = fileContent;
  if (sigAlgStr === 'ED') {
    // Prehashed mode: verify signature against BLAKE2b hash of file content
    messageToVerify = crypto.createHash('blake2b512').update(fileContent).digest();
  }

  // 1. Verify primary signature (file contents)
  const verified = crypto.verify(null, messageToVerify, publicKey, pureSig);
  if (!verified) {
    throw new Error(`Signature verification FAILED for ${filePath}`);
  }
  console.log(`✅ Primary signature verification PASSED for ${filePath}`);

  // 2. Verify trusted comment & global signature
  const trustedComment = sigLines[2].trim();
  if (!trustedComment.startsWith('trusted comment: ')) {
    throw new Error(`Invalid trusted comment format in ${sigFilePath}`);
  }
  const commentPayload = trustedComment.slice(17);

  const globalSigB64 = sigLines[3].trim();
  const globalSig = Buffer.from(globalSigB64, 'base64');
  if (globalSig.length !== 64) {
    throw new Error(`Invalid global signature length in ${sigFilePath}`);
  }

  const globalMessage = Buffer.concat([
    pureSig,
    Buffer.from(commentPayload, 'utf-8')
  ]);

  const globalVerified = crypto.verify(null, globalMessage, publicKey, globalSig);
  if (!globalVerified) {
    throw new Error(`Global signature (trusted comment) verification FAILED for ${filePath}`);
  }
  console.log(`✅ Global signature (trusted comment) verification PASSED for ${filePath}`);
}

function main() {
  try {
    const publicKeyRaw = getPublicKey();
    console.log(`Loaded public key successfully.`);

    // Search in src-tauri/target/release/bundle/ for target files and their .sig files
    const bundleDir = path.join(process.cwd(), 'src-tauri', 'target', 'release', 'bundle');
    if (!fs.existsSync(bundleDir)) {
      console.warn(`⚠️ Bundle directory not found at ${bundleDir}. Skipping signature verification.`);
      return;
    }

    // Recursively scan directory for files
    const walk = (dir) => {
      let results = [];
      const list = fs.readdirSync(dir);
      list.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(walk(fullPath));
        } else {
          results.push(fullPath);
        }
      });
      return results;
    };

    const files = walk(bundleDir);
    const signatureFiles = files.filter(f => f.endsWith('.sig'));

    if (signatureFiles.length === 0) {
      console.log('No signature (.sig) files found to verify.');
      return;
    }

    let verifiedCount = 0;
    for (const sigFile of signatureFiles) {
      // Find the corresponding target file (e.g. file.msi for file.msi.sig)
      // Tauri CLI generates signature files as "<filename>.sig"
      const targetFile = sigFile.slice(0, -4);
      if (fs.existsSync(targetFile)) {
        verifyFileSignature(targetFile, sigFile, publicKeyRaw);
        verifiedCount++;
      } else {
        console.warn(`⚠️ Warning: Signature file found but target file does not exist: ${targetFile}`);
      }
    }

    console.log(`\nSuccessfully verified ${verifiedCount} release signatures.`);
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
