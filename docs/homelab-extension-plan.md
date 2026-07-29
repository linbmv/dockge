# Dockge Homelab Extension Plan

## Objective

Use `linbmv/dockge` as the only Docker Compose manager and retire ComposeMgt
after migration. Preserve the small set of ComposeMgt behaviours that are
valuable for this single-host homelab without turning Dockge into a second CI
platform or network controller.

Deployment and migration runbook: [homelab-deployment.zh-CN.md](homelab-deployment.zh-CN.md).

## Implementation status (2026-07-29)

- [x] Phase 1: Git pull and local build action.
- [x] Phase 2: configurable external-network defaults.
- [x] Phase 3: collision-aware persistent published-port allocation.
- [x] Phase 4: migration runbook and automated implementation verification.
- [x] Operator rollout 0: read-only inventory of the current Docker host.
- [ ] Operator rollout 1: publish the tested fork and create rollback copies.
- [ ] Operator rollout 2: upgrade the existing Dockge deployment and preserve
  its database plus the existing `reader` Stack.
- [ ] Operator rollout 3: let Dockge recognise the existing `docker` Compose
  project without changing application containers.
- [ ] Operator rollout 4: retire ComposeMgt, then migrate remaining standalone
  projects one at a time.

## Current-host rollout contract

The read-only inventory found three existing Compose projects:

- `dockge`, deployed from `/root/data/docker/dockge/compose.yaml`, with its
  persistent database in `/root/data/docker/dockge/data`;
- `docker`, deployed from `/root/data/docker/compose.yml`, containing the
  shared PostgreSQL, cloudflared, applications and ComposeMgt;
- `webmusic`, deployed from
  `/root/data/docker/webmusic/docker-compose.yml`.

The existing Dockge Stack directory also contains a stopped or independently
managed `reader` Stack under `/opt/stacks/reader`. `D_Home` already exists as
an external `172.18.0.0/16` bridge and must not be recreated during rollout.

The adopted host layout is:

```text
/root/data/
├── global.env                       # TS_HOST_IP only
├── reader/                          # copied from /opt/stacks/reader
├── webmusic/                        # later standalone-project migration
└── docker/
    ├── compose.yml                  # existing project name: docker
    ├── .env                         # project-only variables
    └── dockge/
        ├── compose.yaml             # Dockge's own deployment
        ├── data/                    # preserve exactly
        └── source/                  # linbmv/dockge checkout
```

Dockge will mount `/root/data:/root/data` and use
`DOCKGE_STACKS_DIR=/root/data`. This makes `/root/data/docker/compose.yml` a
managed Stack named `docker` while preserving its working directory, relative
bind mounts and existing Compose project identity. Dockge itself remains a
separate self-hosted project and is upgraded from the command line.

Rollout gates, in order:

1. Push the exact tested source commit. Record current container labels,
   images, mounts, networks, health and published ports.
2. Create a stopped, consistent backup of Dockge's database and copy the
   existing `reader` Stack without deleting `/opt/stacks`.
3. Create `/root/data/global.env`, clone the fork into `dockge/source`, build
   the local image and render the replacement Dockge Compose configuration.
4. Recreate only the `dockge` project. Verify login, database state, `reader`,
   the managed `docker` Stack, Docker socket operations and the Tailnet-only
   `5001` binding. Roll back the image/config/data together on failure.
5. Give inactive application definitions an explicit disabled profile so a
   whole-project `up` cannot start them accidentally. Give ComposeMgt a legacy
   profile, then stop its container without deleting it.
6. Run a no-change `docker compose config`/`ps` inspection through the same
   paths Dockge uses. Only then allow Dockge to perform lifecycle operations on
   project `docker`.
7. Observe the applications, PostgreSQL, `D_Home` DNS, cloudflared origins and
   Tailnet endpoints before moving `webmusic` or splitting another service.

Forbidden rollout actions are `down -v`, volume deletion, network recreation,
force-push, and simultaneous ComposeMgt/Dockge writes to project `docker`.

## Verification evidence (2026-07-29)

- Clean dependency install completed from `package-lock.json`.
- Five focused port-format, collision-selection, protocol and preview tests
  pass.
- TypeScript check and full ESLint run pass; ESLint reports 63 pre-existing
  warnings and no errors.
- Production frontend build passes and cleans stale hashed assets.
- Dockerfile static validation, full image build, container startup and HTTP
  smoke test pass; the temporary test container and image tag were removed.
- Compose config resolves the Tailscale host binding when `TS_HOST_IP` is set
  and fails closed when it is absent.
- `npm audit --omit=dev` was reduced from 24 to 15 findings by compatible lock
  updates plus Express/YAML updates. The remaining 2 low, 12 high and 1
  critical transitive findings require separate compatibility work; no
  forced downgrade or breaking dependency rewrite was applied.

## Adopted network contract

- `D_Home` is a pre-existing Docker external network shared by application
  containers and the containerised Cloudflare Tunnel.
- Containers communicate over Docker DNS (`service-name:container-port`).
  Internal container ports may repeat across services.
- Tailnet clients use the Docker host's MagicDNS name plus a persistent,
  unique published port.
- Published ports bind only to `${TS_HOST_IP}`. `TS_HOST_IP` is stored once in
  Dockge's `global.env`.
- Advertising the entire `D_Home` subnet through a Tailscale subnet router is
  an optional operator action, not a Dockge default.
- Static container IP allocation is not required by the default design.

Example:

```yaml
services:
  app:
    image: example/app
    networks:
      - D_Home
    ports:
      - "${TS_HOST_IP:?Set TS_HOST_IP in Dockge global.env}:20001:8080"

networks:
  D_Home:
    external: true
```

Cloudflare reaches `http://app:8080`; Tailnet clients reach
`http://docker-host:20001`.

## Phase 1 - Git pull and local build

### Implementation

- Detect a Git worktree at the managed Stack root.
- Show a `Git Pull & Build` action only for eligible Stacks.
- Run the following fixed operation in the existing progress terminal:

  ```sh
  git -c safe.directory="$PWD" pull --ff-only
  docker compose up -d --build --remove-orphans
  ```

- Disable interactive Git credential prompts.
- Trust only the current Stack worktree for that invocation, avoiding a global
  `safe.directory=*` exception when bind-mount ownership differs.
- Install `git` and `openssh-client` in the release image. Public repositories
  require no credentials; private repositories use an operator-mounted,
  read-only deploy key.
- Reuse Dockge's per-Stack terminal lock so two lifecycle operations cannot run
  concurrently.

### Acceptance

- Non-Git Stacks do not show the action and the backend rejects direct calls.
- A failed pull prevents the build/deploy step.
- Pull and build output stream through the normal progress terminal.
- No repository path, shell fragment, token, or credential is accepted from
  the browser.

## Phase 2 - Homelab Stack defaults

### Configuration

The Dockge container accepts:

```env
DOCKGE_DEFAULT_EXTERNAL_NETWORK=D_Home
DOCKGE_PUBLISHED_HOST_IP_VARIABLE=TS_HOST_IP
DOCKGE_PUBLISHED_PORT_START=20000
DOCKGE_PUBLISHED_PORT_END=39999
```

`TS_HOST_IP=<tailscale IPv4>` remains in the Stacks directory's `global.env`.

### Implementation

- Attach the configured external network to services in a newly composed
  Stack, except services using `network_mode`.
- Add the same network to containers subsequently added through the form.
- Never create, delete, or change the subnet of the external network
  implicitly. Deployment must fail clearly if the operator has not created it.

### Acceptance

- Default behaviour remains upstream-compatible when
  `DOCKGE_DEFAULT_EXTERNAL_NETWORK` is unset.
- With the variable set, new services reference `D_Home` and the top-level
  declaration contains `external: true`.
- Existing Stack YAML is not rewritten merely by opening it.

## Phase 3 - Persistent published-port allocation

### Implementation

- The user supplies the container target port and protocol (`tcp` or `udp`).
- The backend chooses the first unused published port in the configured range.
- Collision discovery includes all Docker containers, saved Dockge Stack
  files (including ordinary `.env`/`global.env` substitutions), ports in the
  current unsaved editor, and short-lived in-process reservations.
- Allocation is conservative across host addresses and persists a fail-closed
  Compose mapping such as
  `${TS_HOST_IP:?Set TS_HOST_IP in Dockge global.env}:20001:8080`.
- If a saved Stack cannot be parsed for collision detection, allocation fails
  explicitly instead of guessing that its ports are free.
- Host-native listeners are outside the Dockge container's network namespace;
  Docker's final bind remains the authoritative conflict check.

### Acceptance

- Two services may both target `8080` while receiving distinct published
  ports.
- Stopped containers and saved-but-not-running Stacks reserve their configured
  ports.
- TCP and UDP allocations are tracked independently.
- Invalid target ports, protocols, and ranges are rejected server-side.
- Exhausting the configured range returns an explicit error without changing
  YAML.

## Phase 4 - Migration and verification

- Document `D_Home` creation, `global.env`, public/private Git repository
  layouts, Tailnet access, and the ComposeMgt retirement sequence.
- Preserve explicit named-volume names and project identity before moving a
  running service to a new Dockge Stack.
- Never run ComposeMgt and Dockge as simultaneous writers/controllers for the
  same containers.
- Run lint, TypeScript checks, focused unit tests, and a production frontend
  build.

## Explicitly out of scope

- Storing Git tokens or private keys in Dockge's database.
- Automatic Git merge, rebase, hard reset, or conflict resolution.
- Automatic host firewall, Tailscale ACL, subnet-route, or DNS modification.
- Automatic static container IP allocation.
- Replacing Cloudflare Tunnel, Tailscale, Caddy, or a CI service.
