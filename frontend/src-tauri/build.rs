fn main() {
  println!("cargo:rerun-if-changed=../../backend");
  println!("cargo:rerun-if-changed=binaries");
  println!("cargo:rerun-if-env-changed=BEMO_PYTHON");
  if std::env::var("PROFILE").as_deref() == Ok("release") &&
     std::env::var("TARGET").unwrap_or_default().contains("windows") {
    assert!(std::env::var("TAURI_CONFIG").unwrap_or_default().contains("binaries/bemo-api"),
            "Use npm run build:desktop so the verified backend is included.");
    let python = std::env::var_os("BEMO_PYTHON").unwrap_or_else(|| "python".into());
    let status = std::process::Command::new(python).args(["../../backend/prepare_sidecar.py", "--verify", "--target"])
      .arg(std::env::var("TARGET").unwrap()).status().expect("Cannot verify backend: configure BEMO_PYTHON");
    assert!(status.success(), "Backend source verification failed");
  }
  tauri_build::build()
}
