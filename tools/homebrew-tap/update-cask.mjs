// SPDX-License-Identifier: AGPL-3.0-or-later
// Prepare a reviewed Homebrew update from the latest published desktop release.
import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SOURCE = "giacomobartoloni/mathboard";
const TAP = "giacomobartoloni/homebrew-tap";
const BRANCH = "automation/update-mathboard";
const API = "https://api.github.com/repos/";
const TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const HASH = /^[a-f0-9]{64}$/;
const CASK_VERSION = /^([ \t]*version[ \t]+")([0-9]+\.[0-9]+\.[0-9]+)("[ \t]*)$/gm;
const CASK_HASHES = /^([ \t]*sha256 arm:[ \t]*")([a-f0-9]{64})(",[ \t]*\r?\n[ \t]*intel:[ \t]*")([a-f0-9]{64})("[ \t]*)$/gm;
const URL_TEMPLATE = 'url "https://github.com/giacomobartoloni/mathboard/releases/download/v#{version}/MathBoard_#{version}_#{arch}.dmg"';

function assert(condition, reason) {
  if (!condition) throw new Error(reason);
}

export function compareVersions(a, b) {
  assert(VERSION.test(a) && VERSION.test(b), "Invalid canonical version");
  const left = a.split(".").map(BigInt);
  const right = b.split(".").map(BigInt);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] > right[i]) return 1;
    if (left[i] < right[i]) return -1;
  }
  return 0;
}

export function latestPublishedRelease(releases) {
  assert(Array.isArray(releases), "GitHub releases response is not an array");
  const eligible = releases.filter((item) =>
    item && !item.draft && item.published_at && TAG.test(item.tag_name)
  );
  assert(eligible.length > 0, "No eligible published canonical releases");
  const seen = new Set();
  for (const item of eligible) {
    assert(!seen.has(item.tag_name), "Duplicate public release tag: " + item.tag_name);
    seen.add(item.tag_name);
  }
  eligible.sort((a, b) =>
    compareVersions(b.tag_name.slice(1), a.tag_name.slice(1))
  );
  return eligible[0];
}

export function parseCask(content) {
  assert(content.includes('cask "mathboard"') &&
    content.includes('arch arm: "aarch64", intel: "x64"') &&
    content.includes(URL_TEMPLATE), "Unexpected MathBoard cask structure");
  const versions = [...content.matchAll(CASK_VERSION)];
  const hashes = [...content.matchAll(CASK_HASHES)];
  assert(versions.length === 1 && hashes.length === 1,
    "Expected exactly one version and one pair of cask checksums");
  const version = versions[0][2];
  assert(VERSION.test(version), "Noncanonical cask version");
  return { version, arm: hashes[0][2], intel: hashes[0][4] };
}

export function updateCask(content, version, arm, intel) {
  assert(VERSION.test(version) && HASH.test(arm) && HASH.test(intel),
    "Invalid version or SHA-256 checksum");
  parseCask(content);
  const updatedVersion = content.replace(CASK_VERSION, (_full, before, _old, after) =>
    before + version + after
  );
  const updated = updatedVersion.replace(CASK_HASHES, (
    _full, armPrefix, _oldArm, middle, _oldIntel, suffix
  ) => armPrefix + arm + middle + intel + suffix);
  const parsed = parseCask(updated);
  assert(parsed.version === version && parsed.arm === arm && parsed.intel === intel,
    "Cask output failed verification");
  return updated;
}

export function parseChecksums(content) {
  const entries = new Map();
  for (const line of content.trimEnd().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})  (\S+)$/.exec(line);
    assert(match, "Malformed SHA256SUMS.txt entry");
    assert(!entries.has(match[2]), "Duplicate manifest asset: " + match[2]);
    entries.set(match[2], match[1]);
  }
  return entries;
}

export function expectedAssets(release) {
  const version = release.tag_name.slice(1);
  const names = {
    arm: "MathBoard_" + version + "_aarch64.dmg",
    intel: "MathBoard_" + version + "_x64.dmg",
    manifest: "SHA256SUMS.txt"
  };
  assert(Array.isArray(release.assets), "Missing release asset list");
  const selected = {};
  for (const [key, name] of Object.entries(names)) {
    const found = release.assets.filter((item) => item.name === name);
    assert(found.length === 1, "Missing or duplicate release asset: " + name);
    const asset = found[0];
    const expectedUrl = "https://github.com/" + SOURCE + "/releases/download/" +
      release.tag_name + "/" + name;
    assert(asset.browser_download_url === expectedUrl &&
      Number.isSafeInteger(asset.size) && asset.size > 0 &&
      (!asset.state || asset.state === "uploaded"),
    "Invalid release asset metadata: " + name);
    selected[key] = asset;
  }
  return selected;
}

async function getJson(path, token, fetcher = fetch) {
  const url = API + path;
  const response = await fetcher(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "mathboard-homebrew-tap-updater",
      ...(token ? { Authorization: "Bearer " + token } : {})
    },
    signal: AbortSignal.timeout(30000)
  });
  assert(response.ok, "GitHub API request failed: " + response.status + " " + path);
  return response.json();
}

export async function listPublicReleases(token, fetcher = fetch) {
  const releases = [];
  for (let page = 1; page <= 20; page += 1) {
    const items = await getJson(SOURCE + "/releases?per_page=100&page=" + page,
      token, fetcher);
    assert(Array.isArray(items) && items.length <= 100, "Invalid release page");
    releases.push(...items);
    if (items.length < 100) return releases;
  }
  throw new Error("Release catalog exceeds safe pagination bound");
}

async function download(url, maxBytes, fetcher = fetch) {
  const response = await fetcher(url, {
    redirect: "follow",
    headers: { "User-Agent": "mathboard-homebrew-tap-updater" },
    signal: AbortSignal.timeout(120000)
  });
  assert(response.ok && response.body, "Asset download failed: " + response.status);
  let size = 0;
  const chunks = [];
  const digest = createHash("sha256");
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    assert(size <= maxBytes, "Published asset exceeds size limit");
    digest.update(chunk);
    if (maxBytes <= 1024 * 1024) chunks.push(Buffer.from(chunk));
  }
  assert(size > 0, "Published asset is empty");
  return { digest: digest.digest("hex"), text: Buffer.concat(chunks).toString("utf8") };
}

export async function verifiedReleaseHashes(release, fetcher = fetch) {
  const assets = expectedAssets(release);
  const manifest = await download(assets.manifest.browser_download_url, 1024 * 1024, fetcher);
  if (assets.manifest.digest) {
    assert(assets.manifest.digest === "sha256:" + manifest.digest,
      "Manifest digest differs from GitHub release metadata");
  }
  const sums = parseChecksums(manifest.text);
  const hashes = {};
  for (const key of ["arm", "intel"]) {
    const asset = assets[key];
    const actual = await download(asset.browser_download_url, 256 * 1024 * 1024, fetcher);
    const expected = sums.get(asset.name);
    assert(expected && actual.digest === expected,
      "Downloaded installer checksum mismatch: " + asset.name);
    if (asset.digest) {
      assert(asset.digest === "sha256:" + actual.digest,
        "Installer digest differs from GitHub release metadata: " + asset.name);
    }
    hashes[key] = actual.digest;
  }
  return hashes;
}

export async function assertAutomationBranchOwnership(token, appSlug, fetcher = fetch) {
  assert(token && appSlug && /^[a-z0-9-]+$/i.test(appSlug),
    "Missing GitHub App token or app slug");
  const refPath = TAP + "/git/ref/heads/" + BRANCH;
  const refResponse = await fetcher(API + refPath, {
    headers: { Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "User-Agent": "mathboard-homebrew-tap-updater" },
    signal: AbortSignal.timeout(30000)
  });
  if (refResponse.status === 404) return;
  assert(refResponse.ok, "Cannot verify existing automation branch");
  const query = TAP + "/pulls?state=open&head=" +
    encodeURIComponent("giacomobartoloni:" + BRANCH) + "&per_page=100";
  const pulls = await getJson(query, token, fetcher);
  assert(Array.isArray(pulls) && pulls.length === 1,
    "Automation branch exists without one open owned PR");
  const pr = pulls[0];
  assert(pr.user?.login?.toLowerCase() === (appSlug + "[bot]").toLowerCase() &&
    pr.head?.ref === BRANCH && pr.head?.repo?.full_name === TAP &&
    pr.base?.ref === "main",
  "Existing automation PR has unexpected owner, branch, or base");
  const files = await getJson(TAP + "/pulls/" + pr.number + "/files?per_page=100",
    token, fetcher);
  assert(Array.isArray(files) && files.length === 1 &&
    files[0].filename === "Casks/mathboard.rb",
  "Existing automation PR contains changes outside the cask");
}

async function emitOutputs(values) {
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT,
      Object.entries(values).map(([key, value]) => key + "=" + value).join("\n") + "\n");
  }
}

async function main() {
  if (process.argv[2] === "--guard") {
    await assertAutomationBranchOwnership(
      process.env.TAP_GITHUB_TOKEN, process.env.TAP_APP_SLUG
    );
    console.log("Automation PR ownership check passed");
    return;
  }
  const caskPath = process.argv[2];
  assert(caskPath && !caskPath.startsWith("--"), "Expected cask file path");
  const oldText = await readFile(caskPath, "utf8");
  const pinned = parseCask(oldText);
  const release = latestPublishedRelease(
    await listPublicReleases(process.env.GITHUB_TOKEN)
  );
  const version = release.tag_name.slice(1);
  if (compareVersions(version, pinned.version) <= 0) {
    await emitOutputs({ changed: "false", version, release_url: release.html_url });
    console.log("Cask already pins version " + pinned.version + " or newer; no PR");
    return;
  }
  const hashes = await verifiedReleaseHashes(release);
  const updated = updateCask(oldText, version, hashes.arm, hashes.intel);
  assert(updated !== oldText, "Expected cask update did not change contents");
  await writeFile(caskPath, updated, "utf8");
  await emitOutputs({
    changed: "true", version, release_url: release.html_url,
    arm_sha: hashes.arm, intel_sha: hashes.intel
  });
  console.log("Prepared cask update: " + pinned.version + " -> " + version);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Homebrew tap update failed: " + error.message);
    process.exitCode = 1;
  });
}
