fn main() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();

    if target_os == "windows" {
        // Tell tauri-build to embed only the icon & version info (without a `1 24` manifest)
        // so we can link a SINGLE Common Controls v6 manifest across BOTH the app binary and
        // `cargo test --lib` unit-test binaries (preventing both GNU `.rsrc merge failure`
        // duplicate-manifest warnings and `STATUS_ENTRYPOINT_NOT_FOUND` on `TaskDialogIndirect`).
        tauri_build::try_build(
            tauri_build::Attributes::new()
                .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest()),
        )
        .expect("failed to run tauri-build");

        if target_env == "msvc" {
            println!("cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'");
        } else if target_env == "gnu" {
            let out_dir = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap());
            let manifest_path = out_dir.join("common_controls.manifest");
            let rc_path = out_dir.join("common_controls.rc");
            let obj_path = out_dir.join("common_controls.o");

            let manifest_content = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        type="win32"
        name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0"
        processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df"
        language="*"
      />
    </dependentAssembly>
  </dependency>
</assembly>
"#;
            let _ = std::fs::write(&manifest_path, manifest_content);
            let rc_content = format!(
                "1 24 \"{}\"",
                manifest_path.to_str().unwrap().replace('\\', "/")
            );
            let _ = std::fs::write(&rc_path, rc_content);

            if std::process::Command::new("windres")
                .arg(&rc_path)
                .arg("-o")
                .arg(&obj_path)
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
            {
                println!(
                    "cargo:rustc-link-arg={}",
                    obj_path.to_str().unwrap().replace('\\', "/")
                );
            }
        }
    } else {
        tauri_build::build();
    }
}
