import pathlib
import sys
import unittest


def main() -> int:
    backend_dir = pathlib.Path(__file__).resolve().parent
    suite = unittest.defaultTestLoader.discover(str(backend_dir / "_archive_legacy" / "tests"))
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
