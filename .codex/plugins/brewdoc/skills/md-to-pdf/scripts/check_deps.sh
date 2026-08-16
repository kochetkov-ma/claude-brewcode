#!/usr/bin/env bash
set -euo pipefail

REPORTLAB_VERSION=5.0.0
WEASYPRINT_VERSION=69.0
MARKDOWN_VERSION=3.10.3
PYGMENTS_VERSION=2.20.0
PANGO_VERSION=1.57.1
CAIRO_VERSION=1.18.4
GDK_PIXBUF_VERSION=2.44.6
LIBFFI_VERSION=3.6.0

usage() { echo "usage: check_deps.sh <check|install|status> [reportlab|weasyprint]"; }
python_version() { python3 -c 'import sys; raise SystemExit(sys.version_info < (3, 8))'; }
package_version() { python3 -c 'from importlib.metadata import version; print(version("'"$1"'"))' 2>/dev/null; }
check_package() { test "$(package_version "$1")" = "$2"; }
brew_version() { brew list --versions "$1" 2>/dev/null | awk '{print $NF}'; }
check_formula() { test "$(brew_version "$1")" = "$2"; }

check_engine() {
  local engine="$1"
  command -v python3 >/dev/null && python_version || { echo "MISSING_PYTHON|requires Python >=3.8"; return 1; }
  case "$engine" in
    reportlab)
      check_package reportlab "$REPORTLAB_VERSION" || { echo "MISSING_OR_WRONG_PIP|reportlab==$REPORTLAB_VERSION"; return 1; }
      ;;
    weasyprint)
      check_package weasyprint "$WEASYPRINT_VERSION" || { echo "MISSING_OR_WRONG_PIP|weasyprint==$WEASYPRINT_VERSION"; return 1; }
      check_package markdown "$MARKDOWN_VERSION" || { echo "MISSING_OR_WRONG_PIP|markdown==$MARKDOWN_VERSION"; return 1; }
      check_package pygments "$PYGMENTS_VERSION" || { echo "MISSING_OR_WRONG_PIP|pygments==$PYGMENTS_VERSION"; return 1; }
      if test "$(uname -s)" = Darwin; then
        check_formula pango "$PANGO_VERSION" || { echo "MISSING_OR_WRONG_SYSTEM|pango==$PANGO_VERSION"; return 1; }
        check_formula cairo "$CAIRO_VERSION" || { echo "MISSING_OR_WRONG_SYSTEM|cairo==$CAIRO_VERSION"; return 1; }
        check_formula gdk-pixbuf "$GDK_PIXBUF_VERSION" || { echo "MISSING_OR_WRONG_SYSTEM|gdk-pixbuf==$GDK_PIXBUF_VERSION"; return 1; }
        check_formula libffi "$LIBFFI_VERSION" || { echo "MISSING_OR_WRONG_SYSTEM|libffi==$LIBFFI_VERSION"; return 1; }
      fi
      ;;
    *) usage >&2; return 2 ;;
  esac
  echo OK
}

install_engine() {
  local engine="$1"
  command -v python3 >/dev/null || { echo "Python >=3.8 is required" >&2; return 1; }
  case "$engine" in
    reportlab)
      python3 -m pip install "reportlab==$REPORTLAB_VERSION"
      ;;
    weasyprint)
      if test "$(uname -s)" = Darwin; then
        for pin in "pango==$PANGO_VERSION" "cairo==$CAIRO_VERSION" "gdk-pixbuf==$GDK_PIXBUF_VERSION" "libffi==$LIBFFI_VERSION"; do
          formula="${pin%%==*}"; version="${pin##*==}"
          check_formula "$formula" "$version" || { echo "Install exact system dependency $pin through an approved pinned package source, then retry." >&2; return 1; }
        done
      fi
      python3 -m pip install "weasyprint==$WEASYPRINT_VERSION" "markdown==$MARKDOWN_VERSION" "pygments==$PYGMENTS_VERSION"
      ;;
    *) usage >&2; return 2 ;;
  esac
  check_engine "$engine"
}

command="${1:-}"; engine="${2:-}"
case "$command" in
  check) test -n "$engine" || { usage >&2; exit 2; }; check_engine "$engine" ;;
  install) test -n "$engine" || { usage >&2; exit 2; }; install_engine "$engine" ;;
  status) check_engine reportlab || true; check_engine weasyprint || true ;;
  help|-h|--help) usage ;;
  *) usage >&2; exit 2 ;;
esac
