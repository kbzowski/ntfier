#!/usr/bin/env node

// Signed release from the author's PC: pnpm release <version> [--prerelease] [--dry-run].

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BUNDLE_DIR = path.join(ROOT, "src-tauri", "target", "release", "bundle");

const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith("--"));
const prerelease = args.includes("--prerelease");
const dryRun = args.includes("--dry-run");
const tag = `v${version}`;

function fail(message) {
	console.error(`\n[release] ERROR: ${message}`);
	process.exit(1);
}

function log(message) {
	console.log(`[release] ${message}`);
}

function out(cmd, cmdArgs, allowFail = false) {
	const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: "utf8" });
	if (r.error) fail(`${cmd} not found: ${r.error.message}`);
	if (r.status !== 0 && !allowFail) fail(`${cmd} ${cmdArgs.join(" ")} failed:\n${r.stderr || r.stdout}`);
	return { ok: r.status === 0, text: (r.stdout || "").trim() };
}

// Async so the sign server's log keeps streaming during the build.
function run(cmdLine, env = {}) {
	return new Promise((resolve) => {
		// shell: pnpm is a .cmd shim on Windows; every argument here comes from this script.
		const child = spawn(cmdLine, { cwd: ROOT, stdio: "inherit", shell: true, env: { ...process.env, ...env } });
		child.on("exit", (code) => (code === 0 ? resolve() : fail(`"${cmdLine}" exited with ${code}`)));
	});
}

function askHidden(prompt) {
	if (!process.stdin.isTTY) fail("no terminal for the password prompt; set TAURI_SIGNING_PRIVATE_KEY_PASSWORD");
	return new Promise((resolve) => {
		process.stdout.write(prompt);
		process.stdin.setRawMode(true);
		process.stdin.setEncoding("utf8");
		process.stdin.resume();
		let value = "";
		const onData = (chunk) => {
			for (const c of chunk) {
				if (c === "\u0003") {
					process.stdout.write("\n");
					process.exit(130);
				}
				if (c === "\r" || c === "\n") {
					process.stdin.setRawMode(false);
					process.stdin.pause();
					process.stdin.off("data", onData);
					process.stdout.write("\n");
					return resolve(value);
				}
				value = c === "\b" || c === "\u007f" ? value.slice(0, -1) : value + c;
			}
		};
		process.stdin.on("data", onData);
	});
}

function startSignServer() {
	return new Promise((resolve) => {
		const server = spawn("pwsh", ["-NoProfile", "-File", path.join(__dirname, "sign-server.ps1")], {
			cwd: ROOT,
			stdio: ["ignore", "pipe", "inherit"],
		});
		// Kill the server however the release ends, so the cached PIN can't be used afterwards.
		process.on("exit", () => server.kill());
		server.on("error", (e) => fail(`cannot start pwsh: ${e.message}`));
		server.on("exit", (code) => fail(`sign server stopped (exit ${code})`));
		let buffer = "";
		server.stdout.setEncoding("utf8");
		server.stdout.on("data", (chunk) => {
			process.stdout.write(chunk);
			buffer += chunk;
			if (buffer.includes("[sign-server] ready")) resolve(server);
		});
	});
}

function findSigntool() {
	if (process.env.TAURI_WINDOWS_SIGNTOOL_PATH) return process.env.TAURI_WINDOWS_SIGNTOOL_PATH;
	const kits = path.join(process.env["ProgramFiles(x86)"] || "", "Windows Kits", "10", "bin");
	const versions = fs.existsSync(kits) ? fs.readdirSync(kits).filter((v) => /^\d+(\.\d+)*$/.test(v)) : [];
	versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	const found = versions.map((v) => path.join(kits, v, "x64", "signtool.exe")).filter((p) => fs.existsSync(p));
	if (!found.length) fail("signtool.exe not found (install the Windows SDK or set TAURI_WINDOWS_SIGNTOOL_PATH)");
	return found.at(-1);
}

// The target cache keeps older bundles, so pick this version's file by name.
function bundleFile(dir, suffix) {
	const full = path.join(BUNDLE_DIR, dir);
	const files = fs.existsSync(full) ? fs.readdirSync(full).filter((f) => f.includes(`_${version}_`) && f.endsWith(suffix)) : [];
	if (files.length !== 1) fail(`expected one *_${version}_*${suffix} in ${full}, found ${files.length}`);
	return path.join(full, files[0]);
}

async function main() {
	if (!version) fail("usage: pnpm release <version> [--prerelease] [--dry-run]");
	if (out("git", ["status", "--porcelain"]).text) fail("working tree is not clean (commit or stash first)");
	const branch = out("git", ["branch", "--show-current"]).text;
	if (branch !== "main") fail(`not on main (current branch: ${branch || "detached HEAD"})`);
	out("git", ["fetch", "origin"]);
	if (out("git", ["rev-parse", "HEAD"]).text !== out("git", ["rev-parse", "origin/main"]).text)
		fail("HEAD differs from origin/main (push or pull first)");
	const confVersion = JSON.parse(fs.readFileSync(path.join(ROOT, "src-tauri", "tauri.conf.json"), "utf8")).version;
	if (version !== confVersion) fail(`version ${version} does not match tauri.conf.json (${confVersion}); bump it in a commit first`);
	if (out("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], true).ok) fail(`tag ${tag} already exists locally`);
	if (out("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`]).text) fail(`tag ${tag} already exists on origin`);
	if (!out("gh", ["auth", "status"], true).ok) fail("gh is not logged in (run gh auth login)");
	const signtool = findSigntool();

	const defaultKey = path.join(os.homedir(), ".tauri", "ntfier.key");
	const env = { TAURI_SIGNING_PRIVATE_KEY: process.env.TAURI_SIGNING_PRIVATE_KEY || defaultKey };
	if (!process.env.TAURI_SIGNING_PRIVATE_KEY && !fs.existsSync(defaultKey)) fail(`minisign key not found: ${defaultKey}`);
	if (!process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = await askHidden("Minisign key password: ");

	process.on("SIGINT", () => fail("interrupted"));
	log("starting sign server...");
	await startSignServer();

	await run("pnpm tauri build --config src-tauri/tauri.signing.conf.json", env);

	const setup = bundleFile("nsis", "-setup.exe");
	const msi = bundleFile("msi", ".msi");
	for (const file of [setup, msi]) {
		const r = spawnSync(signtool, ["verify", "/pa", "/tw", file], { stdio: "inherit" });
		if (r.status !== 0) fail(`signature check failed: ${file}`);
	}

	await run(`pnpm dlx git-cliff --config cliff.toml --unreleased --tag ${tag} --strip header -o changelog.md`);
	await run("node scripts/generate-update-json.js", { TAG_NAME: tag });

	const assets = [setup, `${setup}.sig`, msi, `${msi}.sig`, path.join(ROOT, "update.json")];
	for (const a of assets) if (!fs.existsSync(a)) fail(`missing release file: ${a}`);
	const ghArgs = ["release", "create", tag, "--draft", ...(prerelease ? ["--prerelease"] : [])];
	ghArgs.push("--title", `Ntfier ${tag}`, "--notes-file", "changelog.md", ...assets);
	const ghCommand = `gh ${ghArgs.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`;

	if (dryRun) {
		log(`dry run: would tag ${tag}, push it and run:\n  ${ghCommand}`);
		log("changelog.md:");
		console.log(fs.readFileSync(path.join(ROOT, "changelog.md"), "utf8"));
		process.exit(0);
	}

	out("git", ["tag", "-a", tag, "-m", `Release ${tag}`]);
	if (spawnSync("git", ["push", "origin", tag], { cwd: ROOT, stdio: "inherit" }).status !== 0)
		fail(`git push failed; the tag exists locally only (retry: git push origin ${tag}, or drop it: git tag -d ${tag})`);

	if (spawnSync("gh", ghArgs, { cwd: ROOT, stdio: "inherit" }).status !== 0)
		fail(`gh release create failed after the tag was pushed. Finish by hand:\n  ${ghCommand}`);
	log(`draft release ${tag} created; review and publish it on GitHub`);
	process.exit(0);
}

main();
