# Dockge 家庭服务器部署与迁移手册

本文是 `linbmv/dockge` 的长期运行手册。目标是只保留 Dockge 一个
Compose 管理器，同时维持以下网络合同：

- 应用容器和容器化 cloudflared 通过 external 网络 `D_Home` 通信；
- 容器之间使用唯一的服务名或网络别名加内部端口；内部端口可以重复；
- Tailnet 设备使用 `Docker宿主机的MagicDNS名称:唯一发布端口`；
- 所有由分配器生成的发布端口只绑定宿主机的 Tailscale IPv4；
- Dockge 在服务加入 `D_Home` 后自动分配未占用的固定内部 IP；不把 `D_Home`
  整段子网发布到 Tailnet。

当前这台主机是原位升级，不应照搬第 1 节的全新安装目录。实际接管步骤见
第 10 节。

## 1. 首次部署 Dockge fork

以下目录约定与仓库自带的 `compose.yaml` 一致：

```sh
mkdir -p /opt/dockge /opt/stacks
git clone https://github.com/linbmv/dockge.git /opt/dockge
cd /opt/dockge
```

设置 `DOCKGE_DEFAULT_EXTERNAL_NETWORK=D_Home` 后，Dockge 启动时会检查共享
网络；不存在时自动创建，已存在时保持不变。也可以手工创建并检查：

```sh
docker network create --driver bridge D_Home
docker network inspect D_Home
```

取得宿主机的 Tailscale IPv4，并写入 Dockge 的全局环境文件：

```sh
tailscale ip -4
```

创建 `/opt/stacks/global.env`，内容如下：

```env
TS_HOST_IP=100.x.y.z
```

该文件可能还会保存其他 Stack 的共享变量，应限制读取权限：

```sh
chmod 600 /opt/stacks/global.env
```

让管理 Dockge 自身的 Compose 也复用同一份值，避免维护第二份 IP：

```sh
ln -s /opt/stacks/global.env /opt/dockge/.env
```

然后在 fork 根目录本地构建并启动：

```sh
cd /opt/dockge
docker compose build --pull dockge
docker compose up -d
docker compose ps
```

仓库自带的配置将 Dockge 的 `5001` 也只绑定到 `TS_HOST_IP`。Tailnet
设备访问 `http://Docker宿主机MagicDNS名称:5001`。若主机防火墙启用，仍需由
管理员仅对 Tailscale 接口或 Tailnet 来源放行所需端口；Dockge 不修改防火墙或
Tailscale ACL。

更新 fork：

```sh
cd /opt/dockge
git pull --ff-only
docker compose build --pull dockge
docker compose up -d
```

## 2. `D_Home` 的正确用法

新建 Stack 时，Dockge 会给未设置 `network_mode` 的服务加上：

```yaml
services:
  app:
    image: example/app
    networks:
      D_Home:
        aliases:
          - myapp-web

networks:
  D_Home:
    external: true
```

cloudflared 自己也必须加入同一个 external 网络。即使它位于另一个 Stack，
也能把 Tunnel 的源站配置成 `http://myapp-web:8080`。这里的 `8080` 是容器内部
端口，无需发布到宿主机。

在多个 Stack 共用 `D_Home` 时，不要重复使用通用别名（例如都叫 `web`、
`db`）。Docker DNS 对重复别名可能返回多个地址。长期运行应为跨 Stack 调用
声明全局唯一的网络别名，例如 `immich-web`、`paperless-db`。仅在同一个
Compose Stack 内调用时，可以直接使用服务名。

`expose:` 只具有说明/元数据作用，既不会发布宿主机端口，也不是容器互通的
前提。`D_Home` 上的容器默认可以直接访问对方监听的内部端口。

服务保存或部署时，Dockge 会根据 `D_Home` 的实际 IPv4 子网，按
`.100-.253`、再到 `.2-.99` 的顺序分配未占用地址，并把
`ipv4_address` 写入 Compose；`.254` 保留。容器卡片会显示该内部 IP。已有
`ipv4_address` 的服务保持不变。

共享 PostgreSQL 也是可行的：让 PostgreSQL 加入 `D_Home`，为每个应用创建
独立数据库和独立账号，再通过唯一 DNS 名称连接。它可以减少重复数据库实例，
但也扩大故障影响范围，因此必须单独备份数据卷，并确认各应用支持相同的
PostgreSQL 主版本。

## 3. Tailnet 发布端口

在容器编辑区输入目标内部端口并选择 TCP 或 UDP，点击“分配 Tailnet 端口”。
Dockge 会从配置区间中选择第一个空闲端口，并写入类似配置：

```yaml
ports:
  - "${TS_HOST_IP:-100.x.y.z}:20001:8080"
```

`${TS_HOST_IP:-100.x.y.z}` 是 Docker Compose 标准默认值：Shell 或 Stack
`.env` 中的 `TS_HOST_IP` 仍然优先；变量缺失时使用生成映射时的当前 Tailnet
地址。即使以后不再使用 Dockge，直接在 Stack 目录执行
`docker compose up -d` 也不会依赖父目录的 `global.env`，更不会退化为绑定所有网卡。
如果该主机的 Tailnet 地址发生变化，应更新变量或映射中的默认值。

分配时会检查：

- 所有运行中和已停止 Docker 容器的发布端口；
- `/opt/stacks` 内所有已保存 Stack；
- 当前编辑器尚未保存的端口；
- 10 分钟内刚分配但尚未保存的端口。

TCP 与 UDP 分开计算，因此同一数字可以分别用于 TCP 和 UDP。最终部署时的
Docker bind 仍是权威检查；Dockge 容器无法完整看见宿主机网络命名空间中的
所有原生进程监听端口。

两个应用都监听内部 `8080` 没有冲突，例如：

```text
app-a: 100.x.y.z:20001 -> app-a:8080
app-b: 100.x.y.z:20002 -> app-b:8080
```

Tailnet 设备分别访问 `docker-host:20001` 和 `docker-host:20002`。不要把内部
端口改成唯一值；唯一性只需要发生在宿主机发布端口层。

## 4. 宿主机应用如何访问容器

Docker 的服务名解析由 Docker 内置 DNS 提供，只对加入相同 Docker 网络的
容器有效。宿主机原生进程以及其他 Tailnet 设备不能直接把 Compose 服务名
当作 DNS 名称使用。

宿主机原生程序可以直接使用固定内部 IP 加容器内部端口，例如
`172.18.0.115:5000`，不需要发布端口。也可以使用以下两种方式：

1. 宿主机原生程序使用 `宿主机MagicDNS名称:已发布端口`（或
   `TS_HOST_IP:已发布端口`）；
2. 如果必须使用 `服务名:内部端口`，把该程序也容器化并加入 `D_Home`。

同一个内部端口可以被多个容器重复使用，因为它们拥有不同的固定内部 IP；只有
需要从宿主机或 Tailnet 通过宿主机地址访问时，才需要唯一的发布端口。

## 5. 为什么默认不使用 Tailscale subnet router

subnet router 可以把 `D_Home` 的 Docker 子网发布到 Tailnet，但它不能让其他
Tailnet 设备自动解析 Docker 服务名，还会把整个共享网络暴露面扩大到 ACL 和
路由管理。容器地址变化、Docker 子网重建及与其他站点网段重叠也会增加维护
成本。

因此默认方案是 MagicDNS 宿主机名加唯一发布端口。只有确实需要让 Tailnet
设备直接访问容器 IP、并且愿意维护路由批准、ACL、转发和防火墙时，才把
subnet routing 作为独立的高级运维项目启用；Dockge 不自动执行这些操作。

## 6. Git 拉取与本地构建

“新建 Stack”页面先选择部署来源。镜像型或需要手工编排的 Stack 使用“镜像 /
Compose”；本地源码项目使用“本地构建”。VPS 上已有源码时，输入服务器项目的
绝对路径并点击“读取项目”；Dockge 会自动读取根目录中的标准 Compose 文件、
`.env`，并用目录名填写 Stack 名称，确认编辑器内容后点击“创建并部署”即可。

服务器路径必须由管理员显式开放。将项目父目录以相同绝对路径只读挂载进 Dockge，
并设置允许的根目录：

```yaml
services:
  dockge:
    volumes:
      - /root/data/docker:/root/data/docker:ro
    environment:
      - DOCKGE_PROJECTS_DIR=/root/data/docker
```

网页只能读取该根目录的子目录；相对路径、根目录本身、越界路径和通过符号链接
跳出根目录的路径都会被拒绝。创建时项目会先复制到隐藏临时目录，再原子发布到
Stacks 目录，因此原项目不会被 Dockge 修改。

如果手工编辑的 Compose 使用相对构建上下文，例如 `build: .` 或
`build.context: ./app`，目录选择也会自动出现。所选目录必须包含 Compose、
Dockerfile 和全部源码。Dockge 会把普通文件分块上传到所选 Agent 的隐藏临时
目录，完整接收后再原子发布为 Stack 目录；页面编辑器中的 Compose 和 `.env`
是最终版本，会覆盖所选目录中的同名配置。单次导入上限为 5,000 个文件和
100 MiB。

“从当前电脑上传”仍作为备用方式。浏览器目录选择不保留符号链接和 POSIX
可执行位；服务器路径导入会保留这些文件属性，但仍只能读取管理员挂载并通过
`DOCKGE_PROJECTS_DIR` 开放的目录。

每次由 Dockge 执行 `docker compose up` 前，Dockge 都会先解析最终 Compose
配置并检查 bind mount 的宿主机源路径。源路径缺失时不会让 Docker 静默创建
目录，而是在页面列出源路径、服务和容器目标路径，要求确认创建为“文件”或
“目录”。扩展名和 `Dockerfile`、`Caddyfile` 等常见名称只用于默认选择，用户
仍可切换；文件还可填写可选的初始内容。Dockge 只代建当前 Stack 目录内的
相对路径，并拒绝覆盖已有对象或通过符号链接跳出 Stack。Stack 外的绝对路径
必须由管理员在服务器上手动创建后再部署。

Git 仓库必须以 Stack 目录为工作树根，例如：

```text
/opt/stacks/myapp/
├── .git/
├── compose.yaml
├── Dockerfile
└── src/
```

Git worktree 的 `.git` 文件也受支持。若 `.git` 只存在于
`/opt/stacks/myapp` 的父目录，Dockge 不显示该操作。可使用“一仓库一 Stack”
布局，或为 Stack 建立独立 Git worktree。

“拉取 Git 并构建”固定执行：

```sh
git -c safe.directory="$PWD" pull --ff-only
docker compose up -d --build --remove-orphans
```

它不接受浏览器传入的命令、路径或凭据，不会 merge、rebase、reset，也不会在
冲突时自动处理。SSH 密码、私钥口令和未知主机确认均不会进入交互等待；配置
不完整时会直接失败，拉取失败后不会继续部署。

`safe.directory` 只对本次命令的当前 Stack 目录生效，用于处理 bind mount 内
仓库所有者与 Dockge 进程用户不同的常见情况；不会设置危险的全局
`safe.directory=*`。

公共仓库无需凭据。私有 GitHub 仓库建议使用仓库级只读 Deploy Key：

1. 在宿主机准备 `/opt/dockge/ssh`，私钥权限设为 `0600`；
2. 在 GitHub 仓库设置中添加对应公钥，并且不要授予写权限；
3. 放入经过官方指纹核验的 `known_hosts`，启用严格主机密钥检查；
4. 取消 `compose.yaml` 中
   `/opt/dockge/ssh:/root/.ssh:ro` 的注释后重建 Dockge；
5. 使用 `git@github.com:owner/repository.git` 形式的 remote。

Dockge 不保存 Git token 或私钥。不要把私钥、token、`.netrc` 或带凭据的 URL
提交进 Stack 仓库。Git 仓库及其维护者必须是可信的：更新后的 Compose、
Dockerfile 和构建脚本能够通过 Docker socket 获得宿主机级能力，只读 Deploy
Key 只能限制 Dockge 向仓库写入，不能防御上游仓库自身被入侵。

## 7. 从 ComposeMgt 逐个迁移

迁移前先记录每个项目的真实 Compose project name：

```sh
docker compose ls
docker inspect <现有容器名> --format '{{ index .Config.Labels "com.docker.compose.project" }}'
```

移动目录会改变 Compose 默认推导的 project name。为避免容器、网络和隐式命名
卷被当成一套新资源，在迁移后的 `compose.yaml` 顶层明确保留原名称：

```yaml
name: original_project_name
```

如果原项目使用 `COMPOSE_PROJECT_NAME`，也可以原样保留，但顶层 `name` 更直观。
同时逐项记录并备份：

- `compose.yaml`、`.env`、Dockerfile 和构建上下文；
- bind mount 的宿主机绝对路径；
- volume 的真实名称与备份；
- 当前镜像 tag/digest、健康状态和数据库版本；
- Git remote、branch，以及未提交的本地改动。

每次只迁移一个 Stack：

1. 禁止 ComposeMgt 对该 Stack 再执行 pull/up/down；
2. 停止应用，但不要执行 `down -v`，也不要删除卷；
3. 把完整目录（Git 项目必须连同 `.git`）放到
   `/opt/stacks/<stack-name>/`；
4. 确认顶层 project name、显式 volume 名称和 bind mount 路径未变化；
5. 在 Dockge 扫描 Stacks 目录，先检查最终 YAML，再部署；
6. 验证容器标签、卷挂载、`D_Home` DNS、Cloudflare 源站、Tailnet 端口和应用数据；
7. 观察稳定后再迁移下一个 Stack。

迁移期间绝不能让 ComposeMgt 和 Dockge 同时成为同一项目的写入者。所有 Stack
迁移并验证后，先停止 ComposeMgt 管理进程，保留一段只读备份观察期，再删除其
程序；不要在确认前删除 Compose 文件、数据库或应用数据卷。

## 8. 验收清单

- `docker network inspect D_Home` 成功，cloudflared 和目标应用都在该网络；
- `global.env` 中只有一个有效的 `TS_HOST_IP` 来源；新端口映射包含相同地址的
  Compose 默认值，脱离 Dockge 后也能独立解析；
- `docker ps` 显示发布端口绑定为 `100.x.y.z:端口`，而不是
  `0.0.0.0:端口` 或 `[::]:端口`；
- Cloudflare 使用唯一 DNS 名称加内部端口访问应用；
- Tailnet 设备使用宿主机 MagicDNS 名称加发布端口访问应用；
- 宿主机原生程序使用发布端口，容器化程序才使用 Docker 服务名；
- 私有 Git 拉取只使用只读 Deploy Key，失败时不会继续构建；
- ComposeMgt 已停止，不再控制任何已迁移 Stack；
- 已验证备份恢复，而不只是确认备份文件存在。

## 9. 已知依赖风险

本 fork 已在不破坏 API 的范围内更新 Express、YAML、Socket.IO/Engine.IO、
`ws` 等依赖。当前 `npm audit --omit=dev` 仍报告 15 项生产依赖问题：2 low、
12 high、1 critical，主要来自 `@louislam/sqlite3` 的安装工具链，以及
redbean/knex 的 lodash、glob/brace-expansion 依赖。

自动执行 `npm audit fix --force` 会建议把 `@louislam/sqlite3` 从 15.x 换成
6.x、把 redbean-node 从 0.3.x 降到 0.2.x，这不是可接受的无验证修复。本轮没有
强制改写这些核心依赖。长期应单独建立数据库兼容测试后跟随上游替换依赖；在此
之前必须保留 Dockge 登录认证，只把管理界面绑定到 Tailscale IP，不应直接暴露
到公共互联网。

## 10. 当前主机的原位接管方案

只读盘点确认当前有三个 Compose project：

- `dockge`：`/root/data/docker/dockge/compose.yaml`，数据库位于同目录的
  `data/`；
- `docker`：`/root/data/docker/compose.yml`，包含 PostgreSQL、cloudflared、
  应用和 ComposeMgt；
- `webmusic`：`/root/data/docker/webmusic/docker-compose.yml`。

旧 Dockge 的 `/opt/stacks` 中还有 `reader`。迁移时必须先复制到
`/root/data/reader` 并核对 `compose.yaml`、`.env` 和具名卷声明；原目录保持不动，
作为回滚来源。

最终目录如下：

```text
/root/data/
├── global.env
├── reader/
├── webmusic/                 # 后续再迁移
└── docker/
    ├── compose.yml
    ├── .env
    └── dockge/
        ├── compose.yaml
        ├── data/
        └── source/           # linbmv/dockge 仓库
```

新 Dockge 使用同路径挂载：

```yaml
services:
  dockge:
    image: linbmv/dockge:local
    build:
      context: ./source
      dockerfile: docker/Dockerfile
      target: release
    ports:
      - "${TS_HOST_IP:?Set TS_HOST_IP in global.env}:5001:5001"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/app/data
      - /root/data:/root/data
    environment:
      - DOCKGE_STACKS_DIR=/root/data
      - DOCKGE_DEFAULT_EXTERNAL_NETWORK=D_Home
      - DOCKGE_PUBLISHED_HOST_IP_VARIABLE=TS_HOST_IP
      - DOCKGE_PUBLISHED_PORT_START=20000
      - DOCKGE_PUBLISHED_PORT_END=39999
    networks:
      - D_Home

networks:
  D_Home:
    external: true
```

这样 Dockge 会把 `/root/data/docker/compose.yml` 识别为名为 `docker` 的已管理
Stack。文件仍在原位置，因此相对 bind mount、默认 project name 和现有容器标签
保持不变。Dockge 自身仍是独立的 `dockge` project，通过命令行升级，避免管理器
重建自身时中断操作页面。

实际切换必须依次通过以下关口：

1. 推送并记录经过测试的 fork commit；记录三个 project 的容器标签、镜像、挂载、
   网络、健康状态和端口；
2. 短暂停止旧 Dockge，制作一致的 `data/`、部署 Compose 和 `.env` 备份；完成后
   可以先启动旧容器，备份动作不触碰应用 project；
3. 复制 `reader`，创建只含 `TS_HOST_IP` 的 `/root/data/global.env`，并将 fork
   clone 到 `dockge/source`；
4. 先执行 `docker compose config`，确认 `5001` 只绑定 Tailnet IP、数据目录和
   Stacks 目录正确，再只重建 `dockge` project；
5. 验证旧账号和设置、`reader`、Stack `docker` 的只读显示、Docker socket、
   `D_Home` 以及 Cloudflare/Tailnet 访问；失败时配置、镜像和数据库必须一起回滚；
6. 给当前未运行的旧服务增加显式禁用 profile，避免 Dockge 对整个 project 执行
   `up` 时意外启动；给 ComposeMgt 增加 legacy profile 后停止其容器，但暂不删除；
7. 使用 Dockge 所采用的相同 env-file 和工作目录运行无变更的 `config`、`ps`
   检查，通过后才允许 Dockge写入 project `docker`；
8. 稳定观察后再把 `webmusic` 移到 `/root/data/webmusic`，显式保留
   `name: webmusic`，逐个拆分其他服务。

全程禁止 `down -v`、删除卷、重建 `D_Home`、同时让 ComposeMgt 和 Dockge 写入
project `docker`。旧 ComposeMgt 容器、配置和备份要保留到恢复演练完成后再清理。
