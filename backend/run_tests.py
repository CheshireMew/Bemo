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
    parser.add_argument("--pattern", help="Discover only the selected test file pattern.")
    parser.add_argument("--list", action="store_true", help="List unique test IDs without running them.")
    args = parser.parse_args(argv)

    backend_dir = pathlib.Path(__file__).resolve().parent
    tests_dir = backend_dir / "tests"
    if args.pattern:
        suite = unittest.defaultTestLoader.discover(str(tests_dir), pattern=args.pattern)
    elif args.all:
        suite = unittest.defaultTestLoader.discover(str(tests_dir))
    else:
        suite = unittest.defaultTestLoader.discover(str(tests_dir), pattern="test_api_*.py")
    if args.list:
        def collect(node):
            if isinstance(node, unittest.TestSuite):
                for child in node:
                    yield from collect(child)
            else:
                yield node.id()
        identities = list(collect(suite))
        if not identities or len(identities) != len(set(identities)):
            raise RuntimeError("Test discovery must be nonempty and unique")
        print("\n".join(identities))
        return 0
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
