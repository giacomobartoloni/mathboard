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

/** Dispatches companion-only modes before Tauri initializes its GUI. */
pub fn run_from_args() -> Option<i32> {
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
        flag if flag.starts_with("--mathboard-companion-") => {
            eprintln!("Invalid MathBoard companion mode or arguments.");
            Some(2)
        }
        _ => None,
    }
}
