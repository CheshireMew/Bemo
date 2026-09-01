"""Desktop backend with an explicit data directory and parent-owned lifetime."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import socket
import sys
import threading


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', required=True)
    args = parser.parse_args()
    data_dir = str(Path(args.data_dir).resolve())
    os.environ['BEMO_DATA_DIR'] = data_dir
    os.environ['BEMO_CORS_ORIGINS'] = 'tauri://localhost,http://tauri.localhost,https://tauri.localhost,http://localhost:5173,http://127.0.0.1:5173'
    # Paths are evaluated during import, so configuration must come first.
    import uvicorn
    from app_factory import create_app
    server = uvicorn.Server(uvicorn.Config(create_app('desktop'), host='127.0.0.1', port=0,
                                           log_level='warning', access_log=False))
    stopped = threading.Event()

    def watch_parent():
        # Explicit shutdown and EOF (including parent crash) both stop the server.
        for line in sys.stdin:
            if line.strip() == 'shutdown':
                break
        stopped.set()
        server.should_exit = True

    threading.Thread(target=watch_parent, daemon=True).start()

    async def serve():
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(('127.0.0.1', 0))
            listener.listen(128)
            listener.setblocking(False)
            port = listener.getsockname()[1]
            task = asyncio.create_task(server.serve(sockets=[listener]))
            while not server.started and not task.done():
                await asyncio.sleep(0.02)
            if server.started and not stopped.is_set():
                print(json.dumps({'event': 'bemo_backend_ready', 'api_origin': f'http://127.0.0.1:{port}',
                                  'data_dir': data_dir, 'pid': os.getpid()}), flush=True)
            await task

    asyncio.run(serve())


if __name__ == '__main__':
    main()
