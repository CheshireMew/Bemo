import importlib
import io
import os
import shutil
import unittest
import uuid
import zipfile
import csv


class FakeUploadFile:
    def __init__(self, filename: str, data: bytes):
        self.filename = filename
        self.file = io.BytesIO(data)


class ImportExportServiceTests(unittest.TestCase):
    def setUp(self):
        self.test_root = os.path.join(os.path.dirname(__file__), ".tmp")
        os.makedirs(self.test_root, exist_ok=True)
        self.temp_dir = os.path.join(self.test_root, f"import-export-{uuid.uuid4().hex}")
        os.makedirs(self.temp_dir, exist_ok=True)
        self.original_data_dir = os.environ.get("BEMO_DATA_DIR")
        os.environ["BEMO_DATA_DIR"] = self.temp_dir

        import core.paths as paths_module
        import api.notes as notes_module
        import services.export_service as export_service_module
        import services.import_service as import_service_module

        importlib.reload(paths_module)
        self.notes_module = importlib.reload(notes_module)
        self.export_service = importlib.reload(export_service_module)
        self.import_service = importlib.reload(import_service_module)

        os.makedirs(self.notes_module.NOTES_DIR, exist_ok=True)
        os.makedirs(self.notes_module.IMAGES_DIR, exist_ok=True)
        os.makedirs(self.notes_module.TRASH_DIR, exist_ok=True)

    def tearDown(self):
        if self.original_data_dir is None:
            os.environ.pop("BEMO_DATA_DIR", None)
        else:
            os.environ["BEMO_DATA_DIR"] = self.original_data_dir
        shutil.rmtree(self.temp_dir, ignore_errors=True)
        shutil.rmtree(self.test_root, ignore_errors=True)

    def test_native_export_then_import_roundtrip(self):
        date_dir = os.path.join(self.notes_module.NOTES_DIR, "2026", "03", "17")
        os.makedirs(date_dir, exist_ok=True)
        note_path = os.path.join(date_dir, "123_test.md")
        with open(note_path, "w", encoding="utf-8") as file:
            file.write(
                self.notes_module._build_frontmatter("2026-03-17T10:00:00+08:00", ["x"], False)
                + "hello\n\n![img](/images/test.png)\n"
            )

        image_path = os.path.join(self.notes_module.IMAGES_DIR, "test.png")
        with open(image_path, "wb") as file:
            file.write(b"png-data")

        archive_buffer, _filename = self.export_service.build_native_export_archive()

        imported_root = os.path.join(self.test_root, f"imported-native-{uuid.uuid4().hex}")
        os.makedirs(imported_root, exist_ok=True)
        self.addCleanup(lambda: shutil.rmtree(imported_root, ignore_errors=True))
        os.environ["BEMO_DATA_DIR"] = imported_root
        import core.paths as paths_module
        importlib.reload(paths_module)
        self.notes_module = importlib.reload(self.notes_module)
        self.import_service = importlib.reload(self.import_service)
        os.makedirs(self.notes_module.NOTES_DIR, exist_ok=True)
        os.makedirs(self.notes_module.IMAGES_DIR, exist_ok=True)
        os.makedirs(self.notes_module.TRASH_DIR, exist_ok=True)

        upload = FakeUploadFile("backup.zip", archive_buffer.getvalue())
        result = self.import_service.import_native_zip(
            filename=upload.filename,
            file_obj=upload.file,
        )

        self.assertEqual(result["imported_notes"], 1)
        self.assertEqual(result["imported_images"], 1)

    def test_flomo_export_and_import_flow(self):
        date_dir = os.path.join(self.notes_module.NOTES_DIR, "2026", "03", "17")
        os.makedirs(date_dir, exist_ok=True)
        note_path = os.path.join(date_dir, "123_test.md")
        with open(note_path, "w", encoding="utf-8") as file:
            file.write(
                self.notes_module._build_frontmatter("2026-03-17T10:00:00+08:00", ["tagged"], False)
                + "flomo line\n\n- item one\n"
            )

        export_buffer, _filename = self.export_service.build_flomo_export_archive()
        csv_text = export_buffer.getvalue().decode("utf-8-sig")
        rows = list(csv.DictReader(io.StringIO(csv_text)))

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["content"], "flomo line\n\n- item one")
        self.assertEqual(rows[0]["created_at"], "2026/3/17 10:00")

        imported_root = os.path.join(self.test_root, f"imported-flomo-{uuid.uuid4().hex}")
        os.makedirs(imported_root, exist_ok=True)
        self.addCleanup(lambda: shutil.rmtree(imported_root, ignore_errors=True))
        os.environ["BEMO_DATA_DIR"] = imported_root
        import core.paths as paths_module
        importlib.reload(paths_module)
        self.notes_module = importlib.reload(self.notes_module)
        self.import_service = importlib.reload(self.import_service)
        os.makedirs(self.notes_module.NOTES_DIR, exist_ok=True)
        os.makedirs(self.notes_module.IMAGES_DIR, exist_ok=True)
        os.makedirs(self.notes_module.TRASH_DIR, exist_ok=True)

        flomo_zip = io.BytesIO()
        with zipfile.ZipFile(flomo_zip, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "memo.html",
                """
                <html><body>
                  <div class="memo">
                    <div class="time">2026-03-17 10:00:00</div>
                    <div class="content"><p>Hello #tag</p><ul><li>Item</li></ul></div>
                    <div class="files"></div>
                  </div>
                </body></html>
                """,
            )

        upload = FakeUploadFile("flomo.zip", flomo_zip.getvalue())
        result = self.import_service.import_flomo_zip(
            filename=upload.filename,
            file_obj=upload.file,
        )
        self.assertEqual(result["imported_count"], 1)

        imported_notes = self.notes_module._collect_notes_recursive(self.notes_module.NOTES_DIR)
        self.assertEqual(len(imported_notes), 1)
        self.assertIn("#tag", imported_notes[0]["content"])
        self.assertIn("- Item", imported_notes[0]["content"])

    def test_flomo_export_omits_attachment_markdown_from_csv(self):
        date_dir = os.path.join(self.notes_module.NOTES_DIR, "2026", "03", "17")
        os.makedirs(date_dir, exist_ok=True)
        note_path = os.path.join(date_dir, "456_attachment_test.md")
        with open(note_path, "w", encoding="utf-8") as file:
            file.write(
                self.notes_module._build_frontmatter("2026-03-17T10:00:00+08:00", ["tagged"], False)
                + "attachment line\n\n"
                + "![img](/images/test.png)\n\n"
                + "[音频附件](/images/voice.mp3)\n\n"
                + "[文件附件](/images/file.pdf)\n"
            )

        for filename, payload in {
            "test.png": b"png-data",
            "voice.mp3": b"mp3-data",
            "file.pdf": b"pdf-data",
        }.items():
            with open(os.path.join(self.notes_module.IMAGES_DIR, filename), "wb") as file:
                file.write(payload)

        export_buffer, _filename = self.export_service.build_flomo_export_archive()
        csv_text = export_buffer.getvalue().decode("utf-8-sig")
        rows = list(csv.DictReader(io.StringIO(csv_text)))

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["content"], "attachment line")
