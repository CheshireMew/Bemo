mod native_http;

use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      #[cfg(not(mobile))]
      {
        let sidecar_command = app.shell().sidecar("bemo-api").expect("failed to setup sidecar");
        let (_receiver, _child) = sidecar_command.spawn().expect("failed to spawn sidecar");
        println!("🚀 Bemo Backend Sidecar started!");
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![native_http::native_http_request])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
