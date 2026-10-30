// MathBoard
//
// Copyright (C) 2026 Giacomo Bartoloni
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

use std::ffi::{OsStr, OsString};
use std::io::{self, Write};

pub const HTTP_STARTUP_FLAG: &str = "--mathboard-mcp-http";

fn is_http_startup(args: impl IntoIterator<Item = OsString>) -> bool {
    let mut args = args.into_iter();
    args.next().as_deref() == Some(OsStr::new(HTTP_STARTUP_FLAG)) && args.next().is_none()
}

/// The flag is an explicit one-launch exception to MathBoard's default-Off policy.
pub fn http_startup_requested() -> bool {
    is_http_startup(std::env::args_os().skip(1))
}

/// Emit one opt-in machine-readable connection record; never log or persist the secret.
pub fn write_http_startup_record(output: &mut impl Write, token: &str) -> io::Result<()> {
    let record = serde_json::json!({
        "transport": "streamable-http",
        "endpoint": crate::mcp_http::ENDPOINT,
        "token": token,
    });
    writeln!(output, "{record}")?;
    output.flush()
}

/// Stdio is not supported until shutdown acknowledgements can be verified.
fn run_stdio() -> i32 {
    eprintln!("MCP stdio unavailable; use local Streamable HTTP.");
    1
}

/** Dispatches companion-only modes before Tauri initializes its GUI. */
pub fn run_from_args() -> Option<i32> {
    if http_startup_requested() {
        return None;
    }
    let mut args = std::env::args_os().skip(1);
    let first = args.next()?;
    let Some(flag) = first.to_str() else {
        return None;
    };
    match flag {
        "--mathboard-companion-version" if args.next().is_none() => {
            println!("mathboard-companion 1");
            Some(0)
        }
        "--mathboard-mcp-stdio" if args.next().is_none() => Some(run_stdio()),
        #[cfg(feature = "phase-c-verification")]
        "--mathboard-companion-ping" if args.next().is_none() => match crate::ipc_probe::ping() {
            Ok(()) => {
                println!("mathboard-companion pong");
                Some(0)
            }
            Err(error) => {
                eprintln!("Companion IPC probe unavailable: {error}");
                Some(1)
            }
        },
        flag if flag.starts_with("--mathboard-companion-") || flag.starts_with("--mathboard-mcp-") => {
            eprintln!("Invalid MathBoard companion mode or arguments.");
            Some(2)
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn http_startup_requires_one_exact_flag() {
        assert!(is_http_startup([OsString::from(HTTP_STARTUP_FLAG)]));
        assert!(!is_http_startup(Vec::<OsString>::new()));
        assert!(!is_http_startup([OsString::from("--mathboard-mcp-stdio")]));
        assert!(!is_http_startup([
            OsString::from(HTTP_STARTUP_FLAG),
            OsString::from("--unexpected"),
        ]));
    }

    #[test]
    fn startup_record_is_single_line_json_with_new_token_and_endpoint() {
        let mut output = Vec::new();
        write_http_startup_record(&mut output, "fresh-secret").unwrap();
        let text = String::from_utf8(output).unwrap();
        assert_eq!(text.lines().count(), 1);
        let record: serde_json::Value = serde_json::from_str(text.trim()).unwrap();
        assert_eq!(record["transport"], "streamable-http");
        assert_eq!(record["endpoint"], crate::mcp_http::ENDPOINT);
        assert_eq!(record["token"], "fresh-secret");
        assert!(!text.contains("Bearer "));
    }
}
