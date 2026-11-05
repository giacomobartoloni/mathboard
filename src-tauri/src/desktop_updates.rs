// MathBoard
// Copyright (C) 2026 Giacomo Bartoloni
// SPDX-License-Identifier: AGPL-3.0-or-later

use serde::Deserialize;
use std::sync::{
    Mutex,
    atomic::{AtomicBool, Ordering},
};
use std::time::Duration;
use tauri::Manager;
use tauri::menu::{MenuItem, Submenu};

pub const CHECK_MENU_ID: &str = "mathboard-check-updates";
pub const OPEN_MENU_ID: &str = "mathboard-open-update-release";
const RELEASES_API: &str =
    "https://api.github.com/repos/giacomobartoloni/mathboard/releases?per_page=100";
const RELEASE_PAGE: &str = "https://github.com/giacomobartoloni/mathboard/releases/tag/";
const CHECK_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);

struct UpdateMenu {
    submenu: Submenu<tauri::Wry>,
    check: MenuItem<tauri::Wry>,
    release: MenuItem<tauri::Wry>,
    release_url: Mutex<Option<String>>,
    checking: AtomicBool,
}

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

#[derive(Debug, Clone, PartialEq, Eq)]
struct AvailableUpdate {
    version: String,
    release_url: String,
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

// Public desktop releases use vMAJOR.MINOR.PATCH. Packaging RCs are not updates.
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

fn newest_release(
    releases: &[GithubRelease],
    installed_version: &str,
    platform: Platform,
) -> Option<AvailableUpdate> {
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
                || !release
                    .assets
                    .iter()
                    .any(|asset| asset.name == "SHA256SUMS.txt")
                || !release
                    .assets
                    .iter()
                    .any(|asset| expected.iter().any(|name| *name == asset.name))
            {
                return None;
            }
            Some((
                parsed,
                AvailableUpdate {
                    version: version.to_owned(),
                    release_url: format!("{RELEASE_PAGE}{}", release.tag_name),
                },
            ))
        })
        .max_by_key(|(version, _)| *version)
        .map(|(_, update)| update)
}

async fn find_update(installed_version: &str) -> Result<Option<AvailableUpdate>, ()> {
    let platform = Platform::current();
    if parse_version(installed_version).is_none() || platform == Platform::Unsupported {
        return Err(());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| ())?;
    let response = client
        .get(RELEASES_API)
        .header(
            reqwest::header::USER_AGENT,
            "MathBoard-Desktop-Update-Discovery",
        )
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|_| ())?;
    if !response.status().is_success() {
        return Err(());
    }
    let body = response.text().await.map_err(|_| ())?;
    let releases: Vec<GithubRelease> = serde_json::from_str(&body).map_err(|_| ())?;
    Ok(newest_release(&releases, installed_version, platform))
}

/// Install native-only actions; nothing is exposed through Tauri IPC.
pub fn menu(handle: &tauri::AppHandle) -> tauri::Result<Submenu<tauri::Wry>> {
    let check = MenuItem::with_id(
        handle,
        CHECK_MENU_ID,
        "Check for Updates…",
        true,
        None::<&str>,
    )?;
    let release = MenuItem::with_id(handle, OPEN_MENU_ID, "Not checked yet", false, None::<&str>)?;
    let submenu = Submenu::with_items(handle, "Updates", true, &[&check, &release])?;
    handle.manage(UpdateMenu {
        submenu: submenu.clone(),
        check,
        release,
        release_url: Mutex::new(None),
        checking: AtomicBool::new(false),
    });
    Ok(submenu)
}

async fn check_updates(app: &tauri::AppHandle) {
    let Some(menu) = app.try_state::<UpdateMenu>() else {
        return;
    };
    if menu.checking.swap(true, Ordering::AcqRel) {
        return;
    }
    let _ = menu.check.set_enabled(false);
    let _ = menu.release.set_text("Checking for updates…");
    let _ = menu.release.set_enabled(false);

    let version = app.package_info().version.to_string();
    let result = find_update(&version).await;
    let (label, submenu_label, url) = match result {
        Ok(Some(update)) => (
            format!("Version {} available — View release…", update.version),
            "Updates (new version)",
            Some(update.release_url),
        ),
        Ok(None) => ("Up to date".to_owned(), "Updates", None),
        Err(()) => ("Could not check updates".to_owned(), "Updates", None),
    };
    if let Ok(mut release_url) = menu.release_url.lock() {
        *release_url = url.clone();
    }
    let _ = menu.release.set_text(label);
    let _ = menu.release.set_enabled(url.is_some());
    let _ = menu.submenu.set_text(submenu_label);
    let _ = menu.check.set_enabled(true);
    menu.checking.store(false, Ordering::Release);
}

pub fn check_now(app: &tauri::AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        check_updates(&app).await;
    });
}

pub fn open_release(app: &tauri::AppHandle) {
    use tauri_plugin_opener::OpenerExt;

    let Some(menu) = app.try_state::<UpdateMenu>() else {
        return;
    };
    let url = menu.release_url.lock().ok().and_then(|value| value.clone());
    if let Some(url) = url {
        if let Err(error) = app.opener().open_url(url, None::<&str>) {
            eprintln!("Could not open MathBoard release page: {error}");
        }
    }
}

pub fn start(app: &tauri::AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        check_updates(&app).await;
        let mut interval = tokio::time::interval(CHECK_INTERVAL);
        interval.tick().await;
        loop {
            interval.tick().await;
            check_updates(&app).await;
        }
    });
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
            release(
                "v9.0.0",
                true,
                false,
                &["MathBoard_9.0.0_aarch64.dmg", "SHA256SUMS.txt"],
            ),
            release("desktop-v3.0.0-rc.1", false, true, &["SHA256SUMS.txt"]),
            release(
                "v2.4.0",
                false,
                true,
                &["MathBoard_2.4.0_x64.dmg", "SHA256SUMS.txt"],
            ),
            release("v2.3.0", false, true, &["MathBoard_2.3.0_aarch64.dmg"]),
            release(
                "v2.2.0",
                false,
                true,
                &["MathBoard_2.2.0_aarch64.dmg", "SHA256SUMS.txt"],
            ),
            release(
                "v2.0.0",
                false,
                true,
                &["MathBoard_2.0.0_aarch64.dmg", "SHA256SUMS.txt"],
            ),
        ];
        let update = newest_release(&releases, "2.1.0", Platform::MacArm64)
            .expect("2.2.0 should be the newest eligible release");
        assert_eq!(update.version, "2.2.0");
        assert_eq!(
            update.release_url,
            "https://github.com/giacomobartoloni/mathboard/releases/tag/v2.2.0"
        );
        assert!(newest_release(&releases, "2.2.0", Platform::MacArm64).is_none());
    }

    #[test]
    fn picks_highest_published_version_not_api_order() {
        let releases = vec![
            release(
                "v1.9.0",
                false,
                true,
                &["MathBoard_1.9.0_amd64.deb", "SHA256SUMS.txt"],
            ),
            release(
                "v1.11.0",
                false,
                true,
                &["MathBoard_1.11.0_amd64.AppImage", "SHA256SUMS.txt"],
            ),
            release(
                "v1.10.0",
                false,
                true,
                &["MathBoard_1.10.0_amd64.deb", "SHA256SUMS.txt"],
            ),
        ];
        assert_eq!(
            newest_release(&releases, "1.8.0", Platform::LinuxX64).map(|update| update.version),
            Some("1.11.0".into())
        );
        assert!(newest_release(&releases, "1.11.0", Platform::LinuxX64).is_none());
    }

    #[test]
    fn windows_requires_its_own_installer() {
        let releases = vec![release(
            "v1.12.0",
            false,
            true,
            &["MathBoard_1.12.0_amd64.AppImage", "SHA256SUMS.txt"],
        )];
        assert!(newest_release(&releases, "1.11.0", Platform::WindowsX64).is_none());
    }
}
