"""Minimal CLI for health / version (modules land in Phase 1)."""

from __future__ import annotations

import argparse

from quant_lab import __version__
from quant_lab.jobs import MODULE_IDS


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="quant-lab", description="Quant Lab quant package")
    parser.add_argument("--version", action="store_true")
    sub = parser.add_subparsers(dest="cmd")
    sub.add_parser("modules", help="List pipeline module ids")
    args = parser.parse_args(argv)
    if args.version or args.cmd is None:
        print(f"quant-lab-quant {__version__}")
        return 0
    if args.cmd == "modules":
        for mid, jt in MODULE_IDS.items():
            print(f"{mid}\t{jt.value}")
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
