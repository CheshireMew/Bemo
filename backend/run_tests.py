import argparse
import pathlib
import sys
import unittest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run backend test suites.")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Run all legacy backend tests, not just sync-server coverage.",
    )
    args = parser.parse_args(argv)

    backend_dir = pathlib.Path(__file__).resolve().parent
    tests_dir = backend_dir / "tests"
    if args.all:
        suite = unittest.defaultTestLoader.discover(str(tests_dir))
    else:
        suite = unittest.defaultTestLoader.discover(str(tests_dir), pattern="test_api_*.py")
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
