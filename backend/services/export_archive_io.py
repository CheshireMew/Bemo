import io
import os
import zipfile


def build_zip_buffer() -> io.BytesIO:
    return io.BytesIO()


def write_files_to_archive(
    archive: zipfile.ZipFile,
    source_dir: str,
    archive_prefix: str,
    *,
    predicate=None,
) -> None:
    if not os.path.exists(source_dir):
        return

    for root, _, files in os.walk(source_dir):
        for fname in files:
            filepath = os.path.join(root, fname)
            if predicate and not predicate(filepath, fname):
                continue
            arcname = archive_prefix + os.path.relpath(filepath, source_dir).replace("\\", "/")
            archive.write(filepath, arcname)


def write_named_files_to_archive(
    archive: zipfile.ZipFile,
    files: list[tuple[str, str]],
    *,
    archive_prefix: str = "",
) -> None:
    seen = set()
    for arcname, local_path in files:
        full_arcname = f"{archive_prefix}{arcname}"
        if full_arcname in seen:
            continue
        archive.write(local_path, full_arcname)
        seen.add(full_arcname)
