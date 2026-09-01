use serde::Serialize;
use std::{io::{BufRead, BufReader, Write}, path::PathBuf, process::{Child, Command, Stdio}, sync::{mpsc, Mutex}, time::{Duration, Instant}};
use tauri::Manager;

#[derive(Clone, Serialize)]
pub struct Connection { api_origin: String, data_dir: String }

pub struct Backend {
    child: Mutex<Option<Child>>,
    connection: Result<Connection, String>,
}

impl Backend {
    pub fn start(app: &tauri::AppHandle) -> Self {
        match Self::spawn(app) {
            Ok((child, connection)) => Self { child: Mutex::new(Some(child)), connection: Ok(connection) },
            Err(error) => Self { child: Mutex::new(None), connection: Err(error) },
        }
    }

    fn spawn(app: &tauri::AppHandle) -> Result<(Child, Connection), String> {
        let data_dir = match std::env::var_os("BEMO_DATA_DIR") {
            Some(value) => PathBuf::from(value),
            None => app.path().app_data_dir().map_err(|e| e.to_string())?,
        };
        std::fs::create_dir_all(&data_dir).map_err(|e| format!("无法创建数据目录: {e}"))?;
        let data_dir = data_dir.canonicalize().map_err(|e| e.to_string())?;
        let mut command;
        if cfg!(debug_assertions) {
            command = Command::new(std::env::var_os("BEMO_PYTHON").unwrap_or_else(|| "python".into()));
            command.arg(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../backend/desktop_server.py"));
        } else {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            command = Command::new(exe.with_file_name(if cfg!(windows) { "bemo-api.exe" } else { "bemo-api" }));
        }
        command.arg("--data-dir").arg(&data_dir).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        #[cfg(windows)] {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().map_err(|e| format!("后端无法启动，请检查运行环境: {e}"))?;
        let stdout = child.stdout.take().ok_or("无法读取后端启动状态")?;
        let stderr = child.stderr.take().ok_or("无法读取后端错误")?;
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
                    if value["event"] == "bemo_backend_ready" { let _ = sender.send(value); continue; }
                }
                log::info!("backend: {}", line);
            }
        });
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) { log::warn!("backend: {}", line); }
        });
        if let Ok(value) = receiver.recv_timeout(Duration::from_secs(30)) {
            let origin = value["api_origin"].as_str().unwrap_or("");
            if origin.starts_with("http://127.0.0.1:") {
                return Ok((child, Connection { api_origin: origin.into(), data_dir: data_dir.to_string_lossy().into() }));
            }
        }
        let _ = child.kill();
        let _ = child.wait();
        Err("后端未能就绪，请检查运行环境和数据目录权限".into())
    }

    pub fn stop(&self) {
        if let Ok(mut slot) = self.child.lock() {
            if let Some(mut child) = slot.take() {
                if let Some(mut stdin) = child.stdin.take() { let _ = stdin.write_all(b"shutdown\n"); }
                let deadline = Instant::now() + Duration::from_secs(3);
                while Instant::now() < deadline {
                    if matches!(child.try_wait(), Ok(Some(_))) { return; }
                    std::thread::sleep(Duration::from_millis(30));
                }
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[tauri::command]
pub fn backend_connection(state: tauri::State<'_, Backend>) -> Result<Connection, String> {
    let mut slot = state.child.lock().map_err(|e| e.to_string())?;
    if let Some(child) = slot.as_mut() {
        if child.try_wait().map_err(|e| e.to_string())?.is_some() { return Err("后端已经退出，请重启应用".into()); }
    }
    state.connection.clone()
}
