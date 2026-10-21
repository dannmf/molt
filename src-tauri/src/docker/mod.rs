//! Catálogo de recursos Docker reclamáveis (imagens penduradas, containers
//! parados, volumes órfãos, build cache), separado do catálogo de caches de
//! dev em `caches/`. Containers em execução são listados só para visibilidade,
//! sem nenhuma ação de limpeza associada.

mod system;

use crate::model::{CacheEntry, CacheRisk, CleanStrategy, DockerContainerInfo, DockerSummary};
use system::{
    BinaryResolver, CommandRunner, PathBinaryResolver, TimeoutCommandRunner, DEFAULT_TIMEOUT,
};

/// Monta o catálogo Docker usando o binário e o executor reais do sistema.
pub fn docker_summary() -> DockerSummary {
    docker_summary_with(&PathBinaryResolver, &TimeoutCommandRunner)
}

fn empty_summary() -> DockerSummary {
    DockerSummary {
        available: false,
        dangling_images: Vec::new(),
        stopped_containers: Vec::new(),
        running_containers: Vec::new(),
        orphan_volumes: Vec::new(),
        build_cache: None,
    }
}

fn docker_summary_with(resolver: &dyn BinaryResolver, runner: &dyn CommandRunner) -> DockerSummary {
    let Some(docker) = resolver.resolve("docker") else {
        return empty_summary();
    };

    let Some(ps_output) = runner.run(
        &docker,
        &["ps", "-a", "--size", "--format", "{{json .}}"],
        DEFAULT_TIMEOUT,
    ) else {
        return empty_summary();
    };

    let (running_containers, stopped_containers) = parse_containers(&ps_output);

    let dangling_images = runner
        .run(
            &docker,
            &["images", "-f", "dangling=true", "--format", "{{json .}}"],
            DEFAULT_TIMEOUT,
        )
        .map(|output| parse_dangling_images(&output))
        .unwrap_or_default();

    let orphan_volumes = runner
        .run(
            &docker,
            &[
                "volume",
                "ls",
                "-f",
                "dangling=true",
                "--format",
                "{{json .}}",
            ],
            DEFAULT_TIMEOUT,
        )
        .map(|output| parse_orphan_volumes(&output))
        .unwrap_or_default();

    let build_cache = runner
        .run(
            &docker,
            &["system", "df", "--format", "{{json .}}"],
            DEFAULT_TIMEOUT,
        )
        .and_then(|output| parse_build_cache(&output));

    DockerSummary {
        available: true,
        dangling_images,
        stopped_containers,
        running_containers,
        orphan_volumes,
        build_cache,
    }
}

fn json_lines(output: &str) -> impl Iterator<Item = serde_json::Value> + '_ {
    output
        .lines()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
}

fn row_str(row: &serde_json::Value, field: &str) -> String {
    row.get(field)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

fn parse_containers(output: &str) -> (Vec<DockerContainerInfo>, Vec<CacheEntry>) {
    let mut running = Vec::new();
    let mut stopped = Vec::new();

    for row in json_lines(output) {
        let id = row_str(&row, "ID");
        if id.is_empty() {
            continue;
        }
        let name = row_str(&row, "Names");
        let image = row_str(&row, "Image");
        let status = row_str(&row, "Status");
        let state = row_str(&row, "State");

        if state == "running" {
            running.push(DockerContainerInfo {
                id,
                name,
                image,
                status,
            });
            continue;
        }

        let bytes = system::parse_decimal_size(&row_str(&row, "Size")).unwrap_or(0);
        stopped.push(CacheEntry {
            id: format!("docker-container-{id}"),
            label: format!("{name} ({image})"),
            tool: "Docker".to_string(),
            paths: Vec::new(),
            bytes,
            risk: CacheRisk::Caution,
            strategy: CleanStrategy::Command {
                program: "docker".to_string(),
                args: vec!["rm".to_string(), id],
            },
            description: format!("Container parado — {status}"),
        });
    }

    (running, stopped)
}

fn parse_dangling_images(output: &str) -> Vec<CacheEntry> {
    json_lines(output)
        .filter_map(|row| {
            let id = row_str(&row, "ID");
            if id.is_empty() {
                return None;
            }
            let repository = row_str(&row, "Repository");
            let tag = row_str(&row, "Tag");
            let bytes = system::parse_decimal_size(&row_str(&row, "Size")).unwrap_or(0);
            Some(CacheEntry {
                id: format!("docker-image-{id}"),
                label: format!("{repository}:{tag}"),
                tool: "Docker".to_string(),
                paths: Vec::new(),
                bytes,
                risk: CacheRisk::Rebuildable,
                strategy: CleanStrategy::Command {
                    program: "docker".to_string(),
                    args: vec!["rmi".to_string(), id],
                },
                description: "Imagem sem tag, não referenciada por nenhum container".to_string(),
            })
        })
        .collect()
}

fn parse_orphan_volumes(output: &str) -> Vec<CacheEntry> {
    json_lines(output)
        .filter_map(|row| {
            let name = row_str(&row, "Name");
            if name.is_empty() {
                return None;
            }
            Some(CacheEntry {
                id: format!("docker-volume-{name}"),
                label: name.clone(),
                tool: "Docker".to_string(),
                paths: Vec::new(),
                bytes: 0,
                risk: CacheRisk::Caution,
                strategy: CleanStrategy::Command {
                    program: "docker".to_string(),
                    args: vec!["volume".to_string(), "rm".to_string(), name],
                },
                description: "Volume não referenciado por nenhum container".to_string(),
            })
        })
        .collect()
}

fn parse_build_cache(output: &str) -> Option<CacheEntry> {
    let bytes: u64 = json_lines(output)
        .filter(|row| row_str(row, "Type") == "Build Cache")
        .filter_map(|row| system::parse_decimal_size(&row_str(&row, "Reclaimable")))
        .sum();

    if bytes == 0 {
        return None;
    }

    Some(CacheEntry {
        id: "docker-build-cache".to_string(),
        label: "Build cache do Docker".to_string(),
        tool: "Docker".to_string(),
        paths: Vec::new(),
        bytes,
        risk: CacheRisk::Safe,
        strategy: CleanStrategy::Command {
            program: "docker".to_string(),
            args: vec!["builder".to_string(), "prune".to_string(), "-f".to_string()],
        },
        description:
            "Camadas intermediárias de build, reconstruídas automaticamente quando necessário"
                .to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use system::fakes::{FakeBinaryResolver, FakeCommandRunner};

    #[test]
    fn unavailable_without_binary() {
        let resolver = FakeBinaryResolver::new();
        let runner = FakeCommandRunner::new();
        let summary = docker_summary_with(&resolver, &runner);
        assert!(!summary.available);
    }

    #[test]
    fn unavailable_when_daemon_does_not_respond() {
        let resolver = FakeBinaryResolver::new().with("docker");
        let runner = FakeCommandRunner::new();
        let summary = docker_summary_with(&resolver, &runner);
        assert!(!summary.available);
    }

    #[test]
    fn splits_running_and_stopped_containers() {
        let resolver = FakeBinaryResolver::new().with("docker");
        let ps = concat!(
            r#"{"ID":"abc123","Names":"web","Image":"nginx","Status":"Up 2 hours","State":"running","Size":"0B (virtual 142MB)"}"#,
            "\n",
            r#"{"ID":"def456","Names":"old-job","Image":"busybox","Status":"Exited (0) 3 days ago","State":"exited","Size":"12MB (virtual 5MB)"}"#,
        );
        let runner = FakeCommandRunner::new().with_output("ps -a --size --format {{json .}}", ps);
        let summary = docker_summary_with(&resolver, &runner);

        assert!(summary.available);
        assert_eq!(summary.running_containers.len(), 1);
        assert_eq!(summary.running_containers[0].id, "abc123");
        assert_eq!(summary.stopped_containers.len(), 1);
        assert_eq!(summary.stopped_containers[0].bytes, 12_000_000);
        assert_eq!(summary.stopped_containers[0].id, "docker-container-def456");
    }

    #[test]
    fn parses_dangling_images() {
        let resolver = FakeBinaryResolver::new().with("docker");
        let ps =
            r#"{"ID":"x","Names":"n","Image":"i","Status":"Up","State":"running","Size":"0B"}"#;
        let images = r#"{"ID":"img1","Repository":"<none>","Tag":"<none>","Size":"500MB"}"#;
        let runner = FakeCommandRunner::new()
            .with_output("ps -a --size --format {{json .}}", ps)
            .with_output("images -f dangling=true --format {{json .}}", images);
        let summary = docker_summary_with(&resolver, &runner);

        assert_eq!(summary.dangling_images.len(), 1);
        assert_eq!(summary.dangling_images[0].bytes, 500_000_000);
        assert_eq!(summary.dangling_images[0].id, "docker-image-img1");
    }

    #[test]
    fn parses_orphan_volumes_without_size() {
        let resolver = FakeBinaryResolver::new().with("docker");
        let ps =
            r#"{"ID":"x","Names":"n","Image":"i","Status":"Up","State":"running","Size":"0B"}"#;
        let volumes = r#"{"Name":"orphan-vol","Driver":"local"}"#;
        let runner = FakeCommandRunner::new()
            .with_output("ps -a --size --format {{json .}}", ps)
            .with_output("volume ls -f dangling=true --format {{json .}}", volumes);
        let summary = docker_summary_with(&resolver, &runner);

        assert_eq!(summary.orphan_volumes.len(), 1);
        assert_eq!(summary.orphan_volumes[0].id, "docker-volume-orphan-vol");
    }

    #[test]
    fn parses_build_cache_reclaimable_bytes() {
        let resolver = FakeBinaryResolver::new().with("docker");
        let ps =
            r#"{"ID":"x","Names":"n","Image":"i","Status":"Up","State":"running","Size":"0B"}"#;
        let df = concat!(
            r#"{"Type":"Images","Reclaimable":"1GB"}"#,
            "\n",
            r#"{"Type":"Build Cache","Reclaimable":"2.5GB"}"#,
        );
        let runner = FakeCommandRunner::new()
            .with_output("ps -a --size --format {{json .}}", ps)
            .with_output("system df --format {{json .}}", df);
        let summary = docker_summary_with(&resolver, &runner);

        let build_cache = summary.build_cache.expect("esperava build cache presente");
        assert_eq!(build_cache.bytes, 2_500_000_000);
    }

    #[test]
    fn build_cache_absent_when_reclaimable_is_zero() {
        let resolver = FakeBinaryResolver::new().with("docker");
        let ps =
            r#"{"ID":"x","Names":"n","Image":"i","Status":"Up","State":"running","Size":"0B"}"#;
        let df = r#"{"Type":"Build Cache","Reclaimable":"0B"}"#;
        let runner = FakeCommandRunner::new()
            .with_output("ps -a --size --format {{json .}}", ps)
            .with_output("system df --format {{json .}}", df);
        let summary = docker_summary_with(&resolver, &runner);

        assert!(summary.build_cache.is_none());
    }
}
