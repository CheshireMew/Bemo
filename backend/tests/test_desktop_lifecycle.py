import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.request


class DesktopLifecycleTests(unittest.TestCase):
    def test_006_ready_persistence_and_parent_pipe_shutdown(self):
        root = Path(__file__).resolve().parents[1]
        temporary_root = root / 'tests' / '.tmp'
        temporary_root.mkdir(parents=True, exist_ok=True)
        data = tempfile.mkdtemp(prefix='desktop-', dir=temporary_root)

        def start():
            process = subprocess.Popen([sys.executable, str(root / 'desktop_server.py'), '--data-dir', data],
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       text=True, encoding='utf-8', cwd=root)
            self.addCleanup(lambda: self.stop(process))
            lines = queue.Queue()
            threading.Thread(target=lambda: lines.put(process.stdout.readline()), daemon=True).start()
            line = lines.get(timeout=20)
            self.assertTrue(line, 'Desktop entry must remain alive and publish readiness')
            ready = json.loads(line)
            self.assertEqual(ready['event'], 'bemo_backend_ready')
            self.assertEqual(ready['data_dir'], os.path.abspath(data))
            return process, ready['api_origin']

        process, origin = start()
        body = json.dumps({'content': 'desktop restart proof', 'tags': []}).encode()
        request = urllib.request.Request(origin + '/api/app/notes/', data=body, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=5) as response:
            note = json.load(response)
        process.stdin.close()  # Parent disappearing must also stop the server.
        self.assertEqual(process.wait(timeout=10), 0)
        process, origin = start()
        with urllib.request.urlopen(origin + '/api/app/notes/', timeout=5) as response:
            result = json.load(response)
        self.assertTrue(any(item['note_id'] == note['note_id'] for item in result))
        process.stdin.write('shutdown\n')
        process.stdin.flush()
        self.assertEqual(process.wait(timeout=10), 0)

    @staticmethod
    def stop(process):
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream and not stream.closed:
                stream.close()
