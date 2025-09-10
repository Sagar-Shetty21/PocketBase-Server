// server.js
"use strict";

const { spawn } = require("child_process");
const { existsSync, chmodSync } = require("fs");
const path = require("path");

function resolveBinary() {
    // 1) Highest priority: explicit env var
    const envBin = process.env.PB_BINARY;
    if (envBin && existsSync(envBin)) return envBin;

    const isWin = process.platform === "win32";
    const binName = isWin ? "pocketbase.exe" : "pocketbase";

    // 2) Common locations inside the project
    const candidates = [
        path.join(__dirname, binName), // ./pocketbase(.exe)
        path.join(__dirname, "pocketbase", binName), // ./pocketbase/pocketbase(.exe)
        path.join(__dirname, "bin", binName), // ./bin/pocketbase(.exe)
        path.join(
            __dirname,
            "bin",
            `${process.platform}-${process.arch}`,
            binName
        ), // ./bin/<platform-arch>/pocketbase(.exe)
    ];

    // If on Windows but user has a non-.exe (e.g., WSL or renamed), try without extension too
    if (isWin) {
        candidates.push(path.join(__dirname, "pocketbase"));
        candidates.push(path.join(__dirname, "bin", "pocketbase"));
    }

    for (const p of candidates) {
        if (existsSync(p)) return p;
    }

    return null;
}

function ensureExecutable(binPath) {
    // On Unix, ensure +x to avoid EACCES
    if (process.platform !== "win32") {
        try {
            chmodSync(binPath, 0o755);
        } catch (err) {
            // best effort; if it fails we'll surface the exec error later
        }
    }
}

function buildArgs(mode, passthroughArgs) {
    const args = ["serve"];

    if (mode === "start") {
        const port = process.env.PORT || "8090";
        const host = process.env.HOST || "0.0.0.0";
        args.push(`--http=${host}:${port}`);
    }

    // Allow user to append any PocketBase flags, e.g.
    // node server.js start --dir pb_data --encryptionEnv=PB_ENC_KEY
    if (Array.isArray(passthroughArgs) && passthroughArgs.length > 0) {
        args.push(...passthroughArgs);
    }

    return args;
}

function printMissingBinaryHelp() {
    const plat = process.platform;
    const arch = process.arch;

    console.error("\n[Error] PocketBase binary not found.");
    console.error("Place the PocketBase binary in one of these locations:");
    console.error("  - ./pocketbase (or pocketbase.exe on Windows)");
    console.error("  - ./pocketbase/pocketbase");
    console.error("  - ./bin/pocketbase");
    console.error(`  - ./bin/${plat}-${arch}/pocketbase`);
    console.error(
        "\nAlternatively, set an absolute path via the PB_BINARY environment variable."
    );
    console.error(
        'Example:\n  PB_BINARY="/abs/path/to/pocketbase" node server.js start'
    );
    console.error("\nOn macOS/Linux, make it executable:");
    console.error("  chmod +x ./pocketbase");
    console.error(
        "\nTip: Download the correct PocketBase binary for your OS/CPU from the official releases,"
    );
    console.error(
        "place/rename it as noted above, then re-run your command.\n"
    );
}

async function main() {
    const mode = (process.argv[2] || "dev").toLowerCase(); // "dev" or "start"
    const passthroughArgs = process.argv.slice(3);

    const binPath = resolveBinary();
    if (!binPath) {
        printMissingBinaryHelp();
        process.exit(1);
        return;
    }

    ensureExecutable(binPath);
    const args = buildArgs(mode, passthroughArgs);

    console.log(`[pocketbase] launching: ${binPath} ${args.join(" ")}`);

    const child = spawn(binPath, args, {
        stdio: "inherit",
        env: process.env,
        windowsHide: true,
    });

    const shutdown = (signal) => {
        console.log(
            `\n[server.js] received ${signal}, shutting down PocketBase...`
        );
        // Try graceful stop first
        if (child && !child.killed) {
            child.kill("SIGINT");
            // Force kill after a timeout if it hangs
            setTimeout(() => {
                if (!child.killed) child.kill("SIGKILL");
            }, 5000);
        }
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    child.on("exit", (code, signal) => {
        if (signal) {
            console.log(`[pocketbase] exited due to signal: ${signal}`);
            process.exit(0);
        } else {
            console.log(`[pocketbase] exited with code: ${code}`);
            process.exit(code ?? 0);
        }
    });

    child.on("error", (err) => {
        console.error("[pocketbase] failed to start:", err);
        if (err.code === "ENOENT") {
            printMissingBinaryHelp();
        }
        process.exit(1);
    });
}

main().catch((err) => {
    console.error("[server.js] fatal error:", err);
    process.exit(1);
});
