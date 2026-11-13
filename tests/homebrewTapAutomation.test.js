// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  compareVersions, latestPublishedRelease, parseCask, updateCask,
  parseChecksums, expectedAssets, verifiedReleaseHashes, listPublicReleases,
  assertAutomationBranchOwnership
} from "../tools/homebrew-tap/update-cask.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const arm = Buffer.from("published ARM installer");
const intel = Buffer.from("published Intel installer");
const cask = [
  '# SPDX-License-Identifier: AGPL-3.0-or-later',
  'cask "mathboard" do',
  '  arch arm: "aarch64", intel: "x64"',
  '',
  '  version "1.11.0"',
  '  sha256 arm:   "' + "a".repeat(64) + '",',
  '         intel: "' + "b".repeat(64) + '"',
  '',
  '  url "https://github.com/giacomobartoloni/mathboard/releases/download/v#{version}/MathBoard_#{version}_#{arch}.dmg"',
  '  app "MathBoard.app"',
  '  caveats <<~EOS',
  '    Unsigned public beta',
  '  EOS',
  'end',
  ''
].join("\n");

function makeRelease(version = "1.12.0") {
  const root = "https://github.com/giacomobartoloni/mathboard/releases/download/v" +
    version + "/";
  const entries = [
    ["MathBoard_" + version + "_aarch64.dmg", arm],
    ["MathBoard_" + version + "_x64.dmg", intel]
  ];
  const manifest = Buffer.from(entries.map(([name, bytes]) =>
    sha(bytes) + "  " + name).join("\n") + "\n");
  entries.push(["SHA256SUMS.txt", manifest]);
  const assets = entries.map(([name, bytes]) => ({
    name, size: bytes.length, state: "uploaded", digest: "sha256:" + sha(bytes),
    browser_download_url: root + name
  }));
  const bodies = new Map(entries.map(([name, bytes]) => [root + name, bytes]));
  return {
    release: { tag_name: "v" + version, published_at: "2026-11-09T10:35:25Z",
      draft: false, prerelease: true, assets,
      html_url: "https://github.com/giacomobartoloni/mathboard/releases/tag/v" + version },
    bodies
  };
}

const fixtureFetch = (bodies) => async (url) =>
  new Response(bodies.get(url) || "Not found", { status: bodies.has(url) ? 200 : 404 });

test("numeric SemVer comparison prevents lexicographic downgrades", () => {
  assert.equal(compareVersions("1.12.0", "1.9.0"), 1);
  assert.equal(compareVersions("1.9.0", "1.12.0"), -1);
  assert.equal(compareVersions("1.12.0", "1.12.0"), 0);
  assert.equal(compareVersions("2.0.0", "1.999.999"), 1);
  assert.throws(() => compareVersions("01.12.0", "1.12.0"));
});

test("only canonical published releases are eligible; newest wins", () => {
  const releases = [
    { tag_name: "v1.9.0", published_at: "x", draft: false },
    { tag_name: "desktop-v1.99.0-rc.1", published_at: "x", draft: false },
    { tag_name: "v1.13.0", published_at: null, draft: true },
    { tag_name: "v1.12.0", published_at: "x", draft: false, prerelease: true },
    { tag_name: "v.1.50.0", published_at: "x", draft: false }
  ];
  assert.equal(latestPublishedRelease(releases).tag_name, "v1.12.0");
  assert.throws(() => latestPublishedRelease([...releases, releases[3]]), /Duplicate/);
  assert.throws(() => latestPublishedRelease([]), /No eligible/);
});

test("cask renderer changes exactly three literals and is idempotent", () => {
  const updated = updateCask(cask, "1.12.0", sha(arm), sha(intel));
  assert.deepEqual(parseCask(updated), {
    version: "1.12.0", arm: sha(arm), intel: sha(intel)
  });
  assert.equal(updateCask(updated, "1.12.0", sha(arm), sha(intel)), updated);
  assert.equal(updated.includes("Unsigned public beta"), true);
  assert.equal(updated.includes('app "MathBoard.app"'), true);
  assert.throws(() => updateCask(cask.replace("arch arm:", "arch apple:"), "1.12.0",
    sha(arm), sha(intel)), /structure/);
});

test("manifest rejects malformed lines and duplicate filenames", () => {
  assert.equal(parseChecksums(sha(arm) + "  arm.dmg\n").get("arm.dmg"), sha(arm));
  assert.throws(() => parseChecksums("not a manifest"), /Malformed/);
  assert.throws(() => parseChecksums(
    sha(arm) + "  arm.dmg\n" + sha(arm) + "  arm.dmg\n"
  ), /Duplicate/);
});

test("published asset names must be unique, nonempty and canonical", () => {
  const { release } = makeRelease();
  assert.equal(expectedAssets(release).arm.name, "MathBoard_1.12.0_aarch64.dmg");
  assert.throws(() => expectedAssets({ ...release,
    assets: release.assets.filter((a) => !a.name.endsWith("_x64.dmg")) }), /Missing/);
  assert.throws(() => expectedAssets({ ...release,
    assets: [...release.assets, release.assets[0]] }), /duplicate/);
  assert.throws(() => expectedAssets({ ...release,
    assets: [{ ...release.assets[0], browser_download_url: "https://example.com/file" },
      ...release.assets.slice(1)] }), /Invalid/);
});

test("download both DMGs and verify manifest plus metadata digests", async () => {
  const { release, bodies } = makeRelease();
  const hashes = await verifiedReleaseHashes(release, fixtureFetch(bodies));
  assert.deepEqual(hashes, { arm: sha(arm), intel: sha(intel) });
});

test("checksum mismatch or corrupt payload aborts the update", async () => {
  const { release, bodies } = makeRelease();
  const bad = new Map(bodies);
  bad.set(release.assets[1].browser_download_url, Buffer.from("tampered"));
  await assert.rejects(verifiedReleaseHashes(release, fixtureFetch(bad)), /checksum mismatch/);
  const missing = new Map(bodies);
  missing.delete(release.assets[0].browser_download_url);
  await assert.rejects(verifiedReleaseHashes(release, fixtureFetch(missing)), /download failed/);
});

test("catalog pagination fails closed on API errors", async () => {
  const good = async () => new Response(JSON.stringify([{ tag_name: "v1.12.0" }]),
    { status: 200, headers: { "Content-Type": "application/json" } });
  assert.equal((await listPublicReleases("", good)).length, 1);
  const broken = async () => new Response("Not available", { status: 503 });
  await assert.rejects(listPublicReleases("", broken), /GitHub API request failed/);
});

test("existing automation branch cannot be hijacked", async () => {
  const missingBranch = async () => new Response("Not found", { status: 404 });
  await assert.doesNotReject(assertAutomationBranchOwnership("token", "mathboard-bot",
    missingBranch));
  const wrongPr = async (url) => new Response(JSON.stringify(
    url.includes("/pulls?") ?
      [{ user: { login: "someone-else" }, head: { ref: "automation/update-mathboard" },
        base: { ref: "main" } }] : {}
  ), { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(assertAutomationBranchOwnership("token", "mathboard-bot",
    wrongPr), /unexpected owner/);
});
