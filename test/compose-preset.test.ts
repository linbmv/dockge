import assert from "node:assert/strict";
import test from "node:test";
import { parseDocument } from "yaml";
import {
    applyDefaultExternalNetwork,
    applyDefaultExternalNetworkToDoc,
    applyPortRewrites,
    applyPortRewritesToDoc,
    collectReservedPublishedPorts,
    getRelativeBuildContexts,
    hasBuildServices,
    planDefaultExternalNetwork,
    planPortPreset
} from "../common/compose-preset";

const HOST_IP_VARIABLE = "TS_HOST_IP";
const HOST_IP_EXPRESSION = "${TS_HOST_IP:?Set TS_HOST_IP in Dockge Global Variables}";

function parse(yaml : string) {
    return parseDocument(yaml).toJS();
}

test("detects services that need image builds", () => {
    assert.equal(hasBuildServices(parse(`
services:
  local:
    build: .
  image_only:
    image: nginx
`)), true);
    assert.equal(hasBuildServices(parse(`
services:
  image_only:
    image: nginx
`)), false);
});

test("collects only relative build contexts that need project files", () => {
    const config = parse(`
services:
  root:
    build: .
  nested:
    build:
      context: ./apps/api
  implicit:
    build:
      dockerfile: Dockerfile.dev
  remote_http:
    build: https://github.com/example/project.git
  remote_ssh:
    build: git@example.com:project/repository.git
  mounted_absolute:
    build: /workspace/project
`);

    assert.deepEqual(getRelativeBuildContexts(config), [ ".", "./apps/api" ]);
});

test("plans a rewrite for a wildcard published port", () => {
    const config = parse(`
services:
  web:
    image: nginx
    ports:
      - "8080:80"
`);
    const plan = planPortPreset(config, HOST_IP_VARIABLE);

    assert.equal(plan.skipped.length, 0);
    assert.deepEqual(plan.rewritable, [
        {
            serviceName: "web",
            index: 0,
            original: "8080:80",
            target: "80",
            protocol: "tcp",
            publishedPort: 8080,
            hostIP: undefined,
        },
    ]);
});

test("never publishes expose-only services", () => {
    const config = parse(`
services:
  db:
    image: postgres
    expose:
      - "5432"
`);
    const plan = planPortPreset(config, HOST_IP_VARIABLE);

    assert.deepEqual(plan.rewritable, []);
    assert.deepEqual(plan.skipped, []);
});

test("keeps a deliberate host IP binding", () => {
    const config = parse(`
services:
  web:
    ports:
      - "127.0.0.1:8080:80"
`);
    const plan = planPortPreset(config, HOST_IP_VARIABLE);

    assert.deepEqual(plan.rewritable, []);
    assert.equal(plan.skipped.length, 1);
    assert.equal(plan.skipped[0].skipReason, "explicitHostIP");
    assert.equal(plan.skipped[0].hostIP, "127.0.0.1");
    assert.equal(plan.skipped[0].publishedPort, 8080);
});

test("treats an already managed mapping as nothing to do", () => {
    const config = parse(`
services:
  web:
    ports:
      - "${HOST_IP_EXPRESSION}:20001:80"
`);
    const plan = planPortPreset(config, HOST_IP_VARIABLE);

    assert.deepEqual(plan.rewritable, []);
    assert.equal(plan.skipped.length, 1);
    assert.equal(plan.skipped[0].skipReason, "alreadyManaged");
    assert.equal(plan.skipped[0].publishedPort, 20001);
});

test("refuses to reassign port ranges and interpolated ports", () => {
    const config = parse(`
services:
  web:
    ports:
      - "8000-8002:8000-8002"
      - "\${WEB_PORT}:80"
`);
    const plan = planPortPreset(config, HOST_IP_VARIABLE);

    assert.deepEqual(plan.rewritable, []);
    assert.deepEqual(plan.skipped.map(entry => entry.skipReason), [
        "notLiteral",
        "notLiteral",
    ]);
});

test("recognizes variable ports with default values as rewritable", () => {
    const config = parse(`
services:
  web:
    ports:
      - "\${READER_PORT:-18080}:80"
`);
    const plan = planPortPreset(config, HOST_IP_VARIABLE);

    assert.equal(plan.skipped.length, 0);
    assert.equal(plan.rewritable.length, 1);
    assert.equal(plan.rewritable[0].serviceName, "web");
    assert.equal(plan.rewritable[0].target, "80");
    assert.equal(plan.rewritable[0].publishedPort, 18080);
    assert.equal(plan.rewritable[0].protocol, "tcp");
});

test("pins a lone container port, which Docker would otherwise publish randomly", () => {
    // "80" alone means "publish 80 on a random host port, on every interface".
    // That is the exposure the preset exists to remove, so it is rewritten.
    const config = parse("services:\n  web:\n    ports:\n      - \"80\"\n");
    const plan = planPortPreset(config, HOST_IP_VARIABLE);

    assert.equal(plan.skipped.length, 0);
    assert.equal(plan.rewritable.length, 1);
    assert.equal(plan.rewritable[0].target, "80");
    assert.equal(plan.rewritable[0].publishedPort, undefined);

    applyPortRewrites(config, plan, [
        {
            serviceName: "web",
            index: 0,
            publishedPort: 20001
        },
    ], HOST_IP_VARIABLE);
    assert.deepEqual(config.services.web.ports, [ `${HOST_IP_EXPRESSION}:20001:80` ]);
});

test("reports long-syntax port mappings instead of rewriting them", () => {
    const config = parse(`
services:
  web:
    ports:
      - target: 80
        published: 8080
        protocol: tcp
`);
    const plan = planPortPreset(config, HOST_IP_VARIABLE);

    assert.deepEqual(plan.rewritable, []);
    assert.equal(plan.skipped.length, 1);
    assert.equal(plan.skipped[0].skipReason, "unparsable");
});

test("collects every host port the file already claims", () => {
    const config = parse(`
services:
  web:
    ports:
      - "8080:80"
      - "127.0.0.1:8443:443"
      - "5353:53/udp"
`);
    const plan = planPortPreset(config, HOST_IP_VARIABLE);

    assert.deepEqual(collectReservedPublishedPorts(plan), new Set([
        "tcp:8080",
        "tcp:8443",
        "udp:5353",
    ]));
});

test("applies rewrites and preserves the protocol suffix", () => {
    const config = parse(`
services:
  web:
    ports:
      - "8080:80"
  dns:
    ports:
      - "5353:53/udp"
`);
    const plan = planPortPreset(config, HOST_IP_VARIABLE);
    const changed = applyPortRewrites(config, plan, [
        {
            serviceName: "web",
            index: 0,
            publishedPort: 20001
        },
        {
            serviceName: "dns",
            index: 0,
            publishedPort: 20002
        },
    ], HOST_IP_VARIABLE);

    assert.equal(changed, 2);
    assert.deepEqual(config.services.web.ports, [ `${HOST_IP_EXPRESSION}:20001:80` ]);
    assert.deepEqual(config.services.dns.ports, [ `${HOST_IP_EXPRESSION}:20002:53/udp` ]);
});

test("a stale plan does not clobber an edit made in the editor", () => {
    const config = parse("services:\n  web:\n    ports:\n      - \"8080:80\"\n");
    const plan = planPortPreset(config, HOST_IP_VARIABLE);

    config.services.web.ports[0] = "9090:90";
    const changed = applyPortRewrites(config, plan, [
        {
            serviceName: "web",
            index: 0,
            publishedPort: 20001
        },
    ], HOST_IP_VARIABLE);

    assert.equal(changed, 0);
    assert.deepEqual(config.services.web.ports, [ "9090:90" ]);
});

test("attaches services to the shared external network and declares it", () => {
    const config = parse(`
services:
  web:
    image: nginx
  db:
    image: postgres
    networks:
      - backend
networks:
  backend: {}
`);
    assert.deepEqual(planDefaultExternalNetwork(config, "D_Home"), [ "web", "db" ]);
    assert.equal(applyDefaultExternalNetwork(config, "D_Home"), 2);

    assert.deepEqual(config.services.web.networks, [ "D_Home" ]);
    assert.deepEqual(config.services.db.networks, [ "backend", "D_Home" ]);
    assert.deepEqual(config.networks.D_Home, { external: true });
    assert.deepEqual(config.networks.backend, {});
    assert.deepEqual(planDefaultExternalNetwork(config, "D_Home"), []);
});

test("leaves network_mode services alone because Compose rejects both", () => {
    const config = parse(`
services:
  host_app:
    network_mode: host
`);
    assert.deepEqual(planDefaultExternalNetwork(config, "D_Home"), []);
    assert.equal(applyDefaultExternalNetwork(config, "D_Home"), 0);
    assert.equal(config.networks, undefined);
});

test("supports the mapping form of service networks", () => {
    const config = parse(`
services:
  web:
    networks:
      backend:
        aliases:
          - web
`);
    assert.equal(applyDefaultExternalNetwork(config, "D_Home"), 1);
    assert.deepEqual(config.services.web.networks.D_Home, {});
    assert.deepEqual(config.services.web.networks.backend.aliases, [ "web" ]);
});

test("is idempotent across repeated preset runs", () => {
    const config = parse("services:\n  web:\n    ports:\n      - \"8080:80\"\n");

    applyDefaultExternalNetwork(config, "D_Home");
    const firstPlan = planPortPreset(config, HOST_IP_VARIABLE);
    applyPortRewrites(config, firstPlan, [
        {
            serviceName: "web",
            index: 0,
            publishedPort: 20001
        },
    ], HOST_IP_VARIABLE);

    const before = JSON.stringify(config);
    applyDefaultExternalNetwork(config, "D_Home");
    const secondPlan = planPortPreset(config, HOST_IP_VARIABLE);
    assert.deepEqual(secondPlan.rewritable, []);
    applyPortRewrites(config, secondPlan, [], HOST_IP_VARIABLE);

    assert.equal(JSON.stringify(config), before);
});

test("document rewrites keep comments, quoting and key order", () => {
    const doc = parseDocument(`# my stack
services:
  web:
    image: 'nginx:latest'   # pinned on purpose
    ports:
      - "8080:80"
    environment:
      TZ: Asia/Shanghai
`);

    assert.equal(applyDefaultExternalNetworkToDoc(doc, "D_Home"), 1);
    const plan = planPortPreset(doc.toJS(), HOST_IP_VARIABLE);
    assert.equal(applyPortRewritesToDoc(doc, plan, [
        {
            serviceName: "web",
            index: 0,
            publishedPort: 20001
        },
    ], HOST_IP_VARIABLE), 1);

    const output = doc.toString();
    assert.match(output, /^# my stack/);
    assert.match(output, /# pinned on purpose/);
    assert.match(output, /image: 'nginx:latest'/);
    assert.match(output, /TZ: Asia\/Shanghai/);
    assert.match(output, /\$\{TS_HOST_IP:\?[^}]*\}:20001:80/);
    assert.match(output, /networks:\n {6}- D_Home/);
    assert.match(output, /^networks:\n {2}D_Home:\n {4}external: true$/m);
});

test("document network preset supports the mapping form and is idempotent", () => {
    const doc = parseDocument(`services:
  web:
    networks:
      backend:
        aliases:
          - web
  host_app:
    network_mode: host
`);

    assert.equal(applyDefaultExternalNetworkToDoc(doc, "D_Home"), 1);
    const config = doc.toJS();
    assert.deepEqual(config.services.web.networks.D_Home, {});
    assert.deepEqual(config.services.web.networks.backend.aliases, [ "web" ]);
    assert.equal(config.services.host_app.networks, undefined);

    const before = doc.toString();
    assert.equal(applyDefaultExternalNetworkToDoc(doc, "D_Home"), 0);
    assert.equal(doc.toString(), before);
});

test("a stale document plan does not clobber a later editor edit", () => {
    const doc = parseDocument("services:\n  web:\n    ports:\n      - \"8080:80\"\n");
    const plan = planPortPreset(doc.toJS(), HOST_IP_VARIABLE);

    doc.setIn([ "services", "web", "ports", 0 ], "9090:90");
    assert.equal(applyPortRewritesToDoc(doc, plan, [
        {
            serviceName: "web",
            index: 0,
            publishedPort: 20001
        },
    ], HOST_IP_VARIABLE), 0);
    assert.deepEqual(doc.toJS().services.web.ports, [ "9090:90" ]);
});

test("document preset never publishes an expose-only service", () => {
    const doc = parseDocument(`services:
  db:
    image: postgres
    expose:
      - "5432"
`);

    applyDefaultExternalNetworkToDoc(doc, "D_Home");
    const plan = planPortPreset(doc.toJS(), HOST_IP_VARIABLE);
    applyPortRewritesToDoc(doc, plan, [], HOST_IP_VARIABLE);

    const config = doc.toJS();
    assert.equal(config.services.db.ports, undefined);
    assert.deepEqual(config.services.db.expose, [ "5432" ]);
});
