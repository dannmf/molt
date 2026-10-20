//! Binário de apoio ao `just fixtures-demo`: monta um HOME falso em `/tmp/molt-demo`
//! com projetos e caches de exemplo, para testar a UI manualmente.

use std::path::PathBuf;

use molt_lib::testkit;

fn main() {
    let home = PathBuf::from("/tmp/molt-demo");
    let _ = std::fs::remove_dir_all(&home);
    std::fs::create_dir_all(&home).expect("criar HOME falso");

    testkit::fixture_node_project(&home, "node-app", 180).expect("fixture node");
    testkit::fixture_rust_project(&home, "rust-app", 900).expect("fixture rust");
    testkit::fixture_expo_project(&home, "expo-app", 250).expect("fixture expo");
    testkit::fixture_flutter_project(&home, "flutter-app", 400).expect("fixture flutter");
    testkit::fixture_git_dirty_repo(&home, "dirty-repo").expect("fixture git dirty");
    testkit::fixture_hardlinked_store(&home).expect("fixture hardlinked store");
    testkit::fixture_symlink_loop(&home, "looped-project").expect("fixture symlink loop");
    testkit::fixture_fake_caches(&home).expect("fixture fake caches");

    println!("HOME falso criado em {}", home.display());
}
