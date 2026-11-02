// MathBoard
// Copyright (C) 2026 Giacomo Bartoloni
// SPDX-License-Identifier: AGPL-3.0-or-later

use serde::{Deserialize, Serialize};
use std::time::Duration;

const RELEASES_API: &str =
    "https://api.github.com/repos/giacomobartoloni/mathboard/releases?per_page=30";
const RELEASE_PAGE: &str = "https://github.com/giacomobartoloni/mathboard/releases/tag/";

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    draft: bool,
    published_at: Option<String>,
    assets: Vec<GithubAsset>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Platform {
    MacArm64,
    MacX64,
    WindowsX64,
    LinuxX64,
    Unsupported,
}

impl Platform {
    fn current() -> Self {
        match (std::env::consts::OS, std::env::consts::ARCH) {
            ("macos", "aarch64") => Self::MacArm64,
            ("macos", "x86_64") => Self::MacX64,
            ("windows", "x86_64") => Self::WindowsX64,
            ("linux", "x86_64") => Self::LinuxX64,
            _ => Self::Unsupported,
        }
    }

    fn expected_assets(self, version: &str) -> Vec<String> {
        let prefix = format!("MathBoard_{version}_");
        match self {
            Self::MacArm64 => vec![format!("{prefix}aarch64.dmg")],
            Self::MacX64 => vec![format!("{prefix}x64.dmg")],
            Self::WindowsX64 => vec![format!("{prefix}x64-setup.exe")],
            Self::LinuxX64 => vec![
                format!("{prefix}amd64.AppImage"),
                format!("{prefix}amd64.deb"),
            ],
            Self::Unsupported => vec![],
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopUpdate {
    installed_version: String,
    latest_version: Option<String>,
    release_url: Option<String>,
}

// The desktop beta release channel uses published vMAJOR.MINOR.PATCH tags.
// Never treat a draft, RC, or arbitrary GitHub tag as an installable update.
fn parse_version(value: &str) -> Option<[u64; 3]> {
    let fields: Vec<_> = value.split('.').collect();
    if fields.len() != 3 {
        return None;
    }
    let mut numbers = [0_u64; 3];
    for (index, field) in fields.iter().enumerate() {
        let number = field.parse::<u64>().ok()?;
        if number.to_string() != *field {
            return None;
        }
        numbers[index] = number;
    }
    Some(numbers)
}

fn newest_release<'a>(
    releases: &'a [GithubRelease],
    installed_version: &str,
    platform: Platform,
) -> Option<&'a GithubRelease> {
    let installed = parse_version(installed_version)?;
    releases
        .iter()
        .filter_map(|release| {
            if release.draft || release.published_at.is_none() {
                return None;
            }
            let version = release.tag_name.strip_prefix('v')?;
            let parsed = parse_version(version)?;
            if parsed <= installed {
                return None;
            }
            let expected = platform.expected_assets(version);
            if expected.is_empty()
                || !release.assets.iter().any(|asset| asset.name == "SHA256SUMS.txt")
                || !release
                    .assets
                    .iter()
                    .any(|asset| expected.iter().any(|name| *name == asset.name))
            {
                return None;
            }
            Some((parsed, release))
        })
        .max_by_key(|(version, _)| *version)
        .map(|(_, release)| release)
}

fn select_update(
    releases: &[GithubRelease],
    installed_version: &str,
    platform: Platform,
) -> DesktopUpdate {
    let latest = newest_release(releases, installed_version, platform);
    DesktopUpdate {
        installed_version: installed_version.to_owned(),
        latest_version: latest.map(|release| release.tag_name[1..].to_owned()),
        release_url: latest.map(|release| format!("{RELEASE_PAGE}{}", release.tag_name)),
    }
}

fn main_webview(label: &str) -> bool {
    label == "main"
}

#[tauri::command]
pub async fn check_desktop_update(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<DesktopUpdate, String> {
    use tauri::Manager;

    if !main_webview(window.label()) {
        return Err("Update discovery is not permitted from this window".into());
    }
    let platform = Platform::current();
    if platform == Platform::Unsupported {
        return Err("Update discovery is unavailable for this platform".into());
    }

    // The Tauri package version comes from tauri.conf.json -> package.json,
    // not from Cargo's separately maintained package version.
    let installed_version = app.package_info().version.to_string();
    if parse_version(&installed_version).is_none() {
        return Err("The installed version is not a supported release version".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Could not initialize the update check")?;
    let response = client
        .get(RELEASES_API)
        .header(reqwest::header::USER_AGENT, "MathBoard-Desktop-Update-Discovery")
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|_| "Could not contact GitHub Releases")?;
    if !response.status().is_success() {
        return Err("GitHub Releases is unavailable; try again later".into());
    }
    let releases = response
        .text()
        .await
        .ok()
        .and_then(|body| serde_json::from_str::<Vec<GithubRelease>>(&body).ok())
        .ok_or("Could not read the GitHub release catalog")?;

    Ok(select_update(&releases, &installed_version, platform))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release(version: &str, draft: bool, published: bool, asset_names: &[&str]) -> GithubRelease {
        GithubRelease {
            tag_name: version.to_owned(),
            draft,
            published_at: published.then_some("2026-11-02T00:00:00Z".into()),
            assets: asset_names
                .iter()
                .map(|name| GithubAsset {
                    name: (*name).to_owned(),
                })
                .collect(),
        }
    }

    #[test]
    fn version_parser_rejects_invalid_tags_and_prereleases() {
        assert_eq!(parse_version("1.10.0"), Some([1, 10, 0]));
        for value in ["01.2.3", "1.2", "1.2.3-rc.1", "v1.2.3", "1.2.3.4", "1.x.3"] {
            assert_eq!(parse_version(value), None, "{value}");
        }
    }

    #[test]
    fn ignores_drafts_invalid_tags_missing_assets_and_downgrades() {
        let releases = vec![
            release("v9.0.0", true, false, &["MathBoard_9.0.0_aarch64.dmg", "SHA256SUMS.txt"]),
            release("desktop-v3.0.0-rc.1", false, true, &["SHA256SUMS.txt"]),
            release("v2.4.0", false, true, &["MathBoard_2.4.0_x64.dmg", "SHA256SUMS.txt"]),
            release("v2.3.0", false, true, &["MathBoard_2.3.0_aarch64.dmg"]),
            release("v2.2.0", false, true, &["MathBoard_2.2.0_aarch64.dmg", "SHA256SUMS.txt"]),
            release("v2.0.0", false, true, &["MathBoard_2.0.0_aarch64.dmg", "SHA256SUMS.txt"]),
        ];
        let update = select_update(&releases, "2.1.0", Platform::MacArm64);
        assert_eq!(update.latest_version.as_deref(), Some("2.2.0"));
        assert_eq!(
            update.release_url.as_deref(),
            Some("https://github.com/giacomobartoloni/mathboard/releases/tag/v2.2.0")
        );
        assert!(select_update(&releases, "2.2.0", Platform::MacArm64)
            .latest_version
            .is_none());
    }

    #[test]
    fn picks_highest_published_version_not_api_order() {
        let releases = vec![
            release("v1.9.0", false, true, &["MathBoard_1.9.0_amd64.deb", "SHA256SUMS.txt"]),
            release("v1.11.0", false, true, &["MathBoard_1.11.0_amd64.AppImage", "SHA256SUMS.txt"]),
            release("v1.10.0", false, true, &["MathBoard_1.10.0_amd64.deb", "SHA256SUMS.txt"]),
        ];
        assert_eq!(
            select_update(&releases, "1.8.0", Platform::LinuxX64)
                .latest_version
                .as_deref(),
            Some("1.11.0")
        );
        assert!(select_update(&releases, "1.11.0", Platform::LinuxX64)
            .latest_version
            .is_none());
    }

    #[test]
    fn windows_requires_its_own_installer_and_main_window() {
        let releases = vec![release(
            "v1.12.0",
            false,
            true,
            &["MathBoard_1.12.0_amd64.AppImage", "SHA256SUMS.txt"],
        )];
        assert!(select_update(&releases, "1.11.0", Platform::WindowsX64)
            .latest_version
            .is_none());
        assert!(main_webview("main"));
        assert!(!main_webview("mcp-settings"));
    }
}
