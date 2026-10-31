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
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
// Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

use app_lib::mcp_native::safe_board_error;

#[test]
fn untrusted_webview_error_codes_never_become_tool_visible_text() {
    assert_eq!(safe_board_error("capture_too_large"), "capture_too_large");
    assert_eq!(
        safe_board_error("confirmation_required"),
        "invalid_tool_arguments"
    );
    assert_eq!(
        safe_board_error("/Users/alice/private-board.json"),
        "internal_error"
    );
    assert_eq!(safe_board_error("secret-formula"), "internal_error");
}

#[test]
fn expected_domain_errors_preserve_safe_codes() {
    for code in [
        "invalid_object_spec",
        "invalid_object_patch",
        "object_not_found",
        "board_not_found",
        "board_archived",
        "board_not_archived",
        "invalid_board_title",
        "edit_in_progress",
    ] {
        assert_eq!(safe_board_error(code), code);
    }
    assert_eq!(
        safe_board_error("confirmation_required"),
        "invalid_tool_arguments"
    );
    assert_eq!(
        safe_board_error("/Users/private/board.json"),
        "internal_error"
    );
}
