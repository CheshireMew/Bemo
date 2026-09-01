import { spawnSync } from 'node:child_process';
const result = spawnSync(process.env.BEMO_PYTHON || 'python', ['../backend/prepare_sidecar.py'], { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
