//! reqwest is built with `rustls-no-provider`, so `Client::build()` panics unless a
//! crypto provider was installed first. `lib.rs::run()` installs ring at startup; this
//! locks in that the two stay compatible. Neither `cargo build` nor clippy catches a
//! regression here - it only shows up as a panic on the first HTTPS request.

#[test]
#[allow(clippy::expect_used)]
fn reqwest_client_builds_after_ring_provider_install() {
    let _ = rustls::crypto::ring::default_provider().install_default();

    reqwest::Client::builder()
        .build()
        .expect("reqwest Client failed to build");
}
