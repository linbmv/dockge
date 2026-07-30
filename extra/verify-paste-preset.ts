/**
 * Drives the paste → preset → YAML round trip exactly as Compose.vue does:
 * parse the pasted document, apply both presets against the parsed JS config,
 * then re-serialize through the same `Document` path the editor uses.
 */
import { parseDocument } from "yaml";
import {
    applyDefaultExternalNetworkToDoc,
    applyPortRewritesToDoc,
    planPortPreset
} from "../common/compose-preset";

const HOST_IP_VARIABLE = "TS_HOST_IP";

const pasted = `# A real-world stack, pasted verbatim
services:
  app:
    image: ghcr.io/example/app:1.2.3
    restart: unless-stopped
    ports:
      - "8080:80"
      - "8443:443"
    volumes:
      - ./data:/data
      - config:/etc/app
    environment:
      - APP_SECRET=\${APP_SECRET}
      - TZ=Asia/Shanghai
    depends_on:
      - db
  db:
    image: postgres:16
    restart: unless-stopped
    expose:
      - "5432"
    volumes:
      - db:/var/lib/postgresql/data
  dns:
    image: example/dns
    ports:
      - "5353:53/udp"
      - "127.0.0.1:9000:9000"
volumes:
  config:
  db:
`;

const doc = parseDocument(pasted);
if (doc.errors.length > 0) {
    throw doc.errors[0];
}

const attached = applyDefaultExternalNetworkToDoc(doc, "D_Home");
const plan = planPortPreset(doc.toJS(), HOST_IP_VARIABLE);

// Stand in for the backend allocator, which hands back distinct ports.
let next = 20000;
const allocations = plan.rewritable.map(entry => ({
    serviceName: entry.serviceName,
    index: entry.index,
    publishedPort: next++,
}));
const changed = applyPortRewritesToDoc(doc, plan, allocations, HOST_IP_VARIABLE);

const output = doc.toString();

console.log("=== attached services:", attached, "| rewritten ports:", changed);
console.log("=== skipped:", JSON.stringify(plan.skipped.map(e => `${e.serviceName}[${e.index}] ${e.original} -> ${e.skipReason}`), null, 0));
console.log("=== OUTPUT YAML ===");
console.log(output);

// Assertions on what actually matters.
const errors : string[] = [];
const check = (condition : boolean, message : string) => {
    if (!condition) {
        errors.push(message);
    }
};

const reparsed = parseDocument(output).toJS();

check(reparsed.services.app.image === "ghcr.io/example/app:1.2.3", "image was modified");
check(JSON.stringify(reparsed.services.app.volumes) === JSON.stringify([ "./data:/data", "config:/etc/app" ]), "volumes were modified");
check(JSON.stringify(reparsed.services.app.environment) === JSON.stringify([ "APP_SECRET=${APP_SECRET}", "TZ=Asia/Shanghai" ]), "environment was modified");
check(JSON.stringify(reparsed.services.app.depends_on) === JSON.stringify([ "db" ]), "depends_on was modified");
check(reparsed.services.app.restart === "unless-stopped", "restart was modified");
check(JSON.stringify(reparsed.services.db.expose) === JSON.stringify([ "5432" ]), "expose was modified");
check(reparsed.services.db.ports === undefined, "expose was auto-published — SECURITY REGRESSION");
check(JSON.stringify(reparsed.volumes) === JSON.stringify({ config: null,
    db: null }), "top-level volumes were modified");

check(reparsed.networks.D_Home.external === true, "D_Home not declared external");
for (const name of [ "app", "db", "dns" ]) {
    check(reparsed.services[name].networks.includes("D_Home"), `${name} not attached to D_Home`);
}

const appPorts = reparsed.services.app.ports;
check(appPorts.every((p : string) => p.startsWith("${TS_HOST_IP:?")), "app ports not pinned to the host IP variable");
check(appPorts[0].endsWith(":80") && appPorts[1].endsWith(":443"), "app container target ports changed");

const dnsPorts = reparsed.services.dns.ports;
check(dnsPorts[0].startsWith("${TS_HOST_IP:?") && dnsPorts[0].endsWith(":53/udp"), "udp mapping lost its protocol");
check(dnsPorts[1] === "127.0.0.1:9000:9000", "explicit loopback binding was rewritten");

const published = [ ...appPorts, ...dnsPorts ]
    .map((p : string) => p.match(/\}:(\d+):/)?.[1])
    .filter(Boolean);
check(new Set(published).size === published.length, "duplicate published ports allocated");

check(output.includes("# A real-world stack, pasted verbatim"), "leading comment was dropped");

// Second run must be a no-op.
const beforeSecond = doc.toString();
applyDefaultExternalNetworkToDoc(doc, "D_Home");
const secondPlan = planPortPreset(doc.toJS(), HOST_IP_VARIABLE);
check(secondPlan.rewritable.length === 0, "second run wants to rewrite ports again");
check(doc.toString() === beforeSecond, "second run mutated the document");

if (errors.length > 0) {
    console.error("\n=== FAILURES ===");
    for (const error of errors) {
        console.error(" -", error);
    }
    process.exit(1);
}
console.log("=== ALL ROUND-TRIP CHECKS PASSED ===");
