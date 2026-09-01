mod native_http;
#[cfg(not(mobile))]
mod backend;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      #[cfg(not(mobile))]
      {
        app.manage(backend::Backend::start(app.handle()));
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
    .invoke_handler({
      #[cfg(not(mobile))]
      { tauri::generate_handler![native_http::native_http_request, backend::backend_connection] }
      #[cfg(mobile)]
      { tauri::generate_handler![native_http::native_http_request] }
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      #[cfg(not(mobile))]
      if matches!(event, tauri::RunEvent::Exit) { app.state::<backend::Backend>().stop(); }
    });
}
