/*
  scripts/patch-android.js

  Run after `npx cap add android` / `npx cap sync android` in CI.
  Fixes what the earlier sed-based approach got wrong: sed doesn't know
  Capacitor's template already sets android:allowBackup="true" by
  default, so a blind text insertion created a *second*
  android:allowBackup attribute on the same <application> tag — invalid
  XML, which is exactly what made ManifestMerger2 fail to parse the file.

  This script checks whether each attribute already exists and replaces
  its value in place if so, only inserting a new attribute when it's
  genuinely absent. Safe to run multiple times (idempotent).
*/
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const varsPath = path.join(root, 'android', 'variables.gradle');
const xmlDir = path.join(root, 'android', 'app', 'src', 'main', 'res', 'xml');
const xmlPath = path.join(xmlDir, 'data_extraction_rules.xml');

if (!fs.existsSync(manifestPath)) {
  console.error(`AndroidManifest.xml not found at ${manifestPath} — did "cap add android" run first?`);
  process.exit(1);
}

// ---------- 1. data_extraction_rules.xml ----------
// Required by capacitor-community/sqlite because it uses SQLCipher even
// for unencrypted databases; Android's auto-backup can otherwise touch
// the DB file in ways the plugin doesn't expect.
fs.mkdirSync(xmlDir, { recursive: true });
fs.writeFileSync(xmlPath, `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="root" />
        <exclude domain="database" />
        <exclude domain="sharedpref" />
        <exclude domain="external" />
    </cloud-backup>
    <device-transfer>
        <exclude domain="root" />
        <exclude domain="database" />
        <exclude domain="sharedpref" />
        <exclude domain="external" />
    </device-transfer>
</data-extraction-rules>
`);
console.log('Wrote res/xml/data_extraction_rules.xml');

// ---------- 2. AndroidManifest.xml ----------
let manifest = fs.readFileSync(manifestPath, 'utf8');

function setAttribute(xml, attrName, attrValue) {
  const attrRegex = new RegExp(`${attrName}="[^"]*"`);
  if (attrRegex.test(xml)) {
    return xml.replace(attrRegex, `${attrName}="${attrValue}"`);
  }
  // Not present yet — insert right after the opening <application tag.
  return xml.replace(/<application/, `<application\n        ${attrName}="${attrValue}"`);
}

manifest = setAttribute(manifest, 'android:allowBackup', 'false');
manifest = setAttribute(manifest, 'android:fullBackupContent', 'false');
manifest = setAttribute(manifest, 'android:dataExtractionRules', '@xml/data_extraction_rules');

const permissions = [
  'android.permission.CAMERA',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_EXTERNAL_STORAGE'
];
permissions.forEach(perm => {
  if (!manifest.includes(perm)) {
    manifest = manifest.replace(
      /<application/,
      `<uses-permission android:name="${perm}" />\n\n    <application`
    );
  }
});

fs.writeFileSync(manifestPath, manifest);
console.log('Patched AndroidManifest.xml');

// ---------- 3. variables.gradle ----------
let vars = fs.readFileSync(varsPath, 'utf8');
vars = vars.replace(/minSdkVersion\s*=\s*\d+/, 'minSdkVersion = 23');
vars = vars.replace(/compileSdkVersion\s*=\s*\d+/, 'compileSdkVersion = 35');
vars = vars.replace(/targetSdkVersion\s*=\s*\d+/, 'targetSdkVersion = 35');
fs.writeFileSync(varsPath, vars);
console.log('Patched variables.gradle');

console.log('\n----- AndroidManifest.xml (final) -----');
console.log(manifest);
console.log('----- variables.gradle (final) -----');
console.log(vars);
