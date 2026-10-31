use serde::Serialize;
use std::{collections::VecDeque, fs::{File, OpenOptions}, io::{BufRead, BufReader, Write}, path::PathBuf, process::{Child, Command, Stdio}, sync::{mpsc, Arc, Mutex}, time::{Duration, Instant}};
use tauri::Manager;

#[derive(Clone, Serialize)]
pub struct Connection { api_origin: String, data_dir: String }

pub struct Backend {
    child: Mutex<Option<Child>>,
    connection: Result<Connection, String>,
}

impl Backend {
    pub fn start(app: &tauri::AppHandle) -> Self {
        let log_path = app.path().app_log_dir().map(|path| path.join("backend.log"));
        let result = log_path.map_err(|e| e.to_string()).and_then(|path| {
            let diagnostics = Diagnostics::open(path)?;
            Self::spawn(app, diagnostics)
        });
        match result {
            Ok((child, connection)) => Self { child: Mutex::new(Some(child)), connection: Ok(connection) },
            Err(error) => Self { child: Mutex::new(None), connection: Err(error) },
        }
    }

    fn spawn(app: &tauri::AppHandle, diagnostics: Diagnostics) -> Result<(Child, Connection), String> {
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
        command.arg("--data-dir").arg(&data_dir);
        launch(command, data_dir, diagnostics, Duration::from_secs(30))
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

#[derive(Clone)]
struct Diagnostics { path: PathBuf, file: Arc<Mutex<File>>, tail: Arc<Mutex<VecDeque<String>>> }

impl Diagnostics {
    fn open(path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).map_err(|e| format!("无法创建日志目录 {}: {e}", parent.display()))?; }
        let file = OpenOptions::new().create(true).append(true).open(&path).map_err(|e| format!("无法写入日志 {}: {e}", path.display()))?;
        Ok(Self { path, file: Arc::new(Mutex::new(file)), tail: Arc::new(Mutex::new(VecDeque::new())) })
    }
    fn write(&self, line: &str) {
        if let Ok(mut file) = self.file.lock() { let _ = writeln!(file, "{line}"); let _ = file.flush(); }
        if let Ok(mut tail) = self.tail.lock() { if tail.len() >= 12 { tail.pop_front(); } tail.push_back(line.into()); }
    }
    fn failure(&self, reason: &str) -> String {
        self.write(reason);
        let tail = self.tail.lock().map(|lines| lines.iter().cloned().collect::<Vec<_>>().join("\n")).unwrap_or_default();
        format!("{reason}\n{tail}\n日志：{}", self.path.display())
    }
}

fn launch(mut command: Command, data_dir: PathBuf, diagnostics: Diagnostics, timeout: Duration) -> Result<(Child, Connection), String> {
        diagnostics.write(&format!("启动后端；数据目录：{}；命令：{:?}", data_dir.display(), command.get_program()));
        command.env("PYTHONIOENCODING", "utf-8").stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        #[cfg(windows)] {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().map_err(|e| diagnostics.failure(&format!("后端无法启动: {e}")))?;
        let stdout = child.stdout.take().ok_or("无法读取后端启动状态")?;
        let stderr = child.stderr.take().ok_or("无法读取后端错误")?;
        let (sender, receiver) = mpsc::channel();
        let stdout_log = diagnostics.clone();
        let stdout_thread = std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                stdout_log.write(&format!("stdout: {line}"));
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
                    if value["event"] == "bemo_backend_ready" { let _ = sender.send(value); continue; }
                }
                log::info!("backend: {}", line);
            }
        });
        let stderr_log = diagnostics.clone();
        let stderr_thread = std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) { stderr_log.write(&format!("stderr: {line}")); log::warn!("backend: {}", line); }
        });
        if let Ok(value) = receiver.recv_timeout(timeout) {
            let origin = value["api_origin"].as_str().unwrap_or("");
            if origin.starts_with("http://127.0.0.1:") {
                return Ok((child, Connection { api_origin: origin.into(), data_dir: data_dir.to_string_lossy().into() }));
            }
        }
        let exit_status = child.try_wait().ok().flatten();
        let _ = child.kill(); let _ = child.wait();
        let _ = stdout_thread.join(); let _ = stderr_thread.join();
        Err(diagnostics.failure(&format!("后端未能就绪；退出状态：{exit_status:?}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn startup_failure_retains_stderr_and_log_path() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../backend/tests/.tmp").join(format!("rust-log-{}", std::process::id()));
        let path = dir.join("backend.log");
        let diagnostics = Diagnostics::open(path.clone()).unwrap();
        let mut command = Command::new("cmd.exe");
        command.args(["/C", "echo controlled startup failure 1>&2 & exit /b 23"]);
        let error = match launch(command, dir, diagnostics, Duration::from_secs(3)) { Err(error) => error, Ok(_) => panic!("expected failure") };
        assert!(error.contains("controlled startup failure"));
        assert!(error.contains(&path.to_string_lossy().to_string()));
        assert!(std::fs::read_to_string(path).unwrap().contains("controlled startup failure"));
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
