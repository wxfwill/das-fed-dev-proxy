# das-fed-dev-proxy

面向本地应用的同源开发代理，不依赖特定 CLI。它会将配置的 URL 前缀转发到本机回环地址上的开发服务器，并将其他请求转发到明确指定的备用主机。支持 HTTP、WebSocket 升级，以及包装现有开发命令。

## 环境要求

- Node.js 18 或更高版本
- 使用 pnpm 运行仓库测试和示例

## 安装与运行

```sh
pnpm add -D das-fed-dev-proxy
das-dev-proxy serve --config ./dev-proxy.config.json
das-dev-proxy run --config ./dev-proxy.config.json -- npm run dev
```

`serve` 只启动代理。`run` 会启动代理以及 `--` 后面的命令；代理或命令任一退出时，都会停止子进程。本包不依赖 `@das-fed/upf-cli`。

## 配置

```json
{
  "listen": { "host": "127.0.0.1", "port": 8101 },
  "fallback": "http://127.0.0.1:8102",
  "routes": [{ "prefix": "/demo/", "target": "http://127.0.0.1:5173" }],
  "devServer": { "port": 5173, "base": "/demo/" }
}
```

- 监听地址和本地路由目标必须使用本机回环地址。
- 未匹配的路径会转发到 `fallback`。匹配多个路由时，采用最长的路由前缀；路径按区分大小写的路径段边界进行匹配。
- 如果匹配到的本地路由不可用，代理会返回 `502`，而不会回退到主机页面。
- `devServer.port` 必须与某个本地路由目标的端口一致。如果设置了 `devServer.base`，它必须与对应的路由前缀一致。
- 不要在公开配置或示例中放入凭据和私有环境的服务地址。

## 本地示例

此示例会启动一个模拟的备用主机和一个 Vite 子应用，不需要 BasicApplication 或 UPF。在仓库根目录下安装两组依赖：

```sh
pnpm install
pnpm --dir examples/vite-subapp install
pnpm run build
```

在一个终端中启动备用主机：

```sh
node examples/local-host/server.js
```

在另一个终端中，通过已安装的本包 CLI 启动构建后的 Vite 子应用：

```sh
pnpm --dir examples/vite-subapp run demo
```

打开 `http://127.0.0.1:8101/`。主机页面中的链接指向 `/demo/`，该路径会被转发到构建后的 Vite 应用。子应用会向备用主机请求 `/api/health`。

运行 `pnpm test` 执行本包测试。公开 API 的导出项见 `src/index.js`。

## 构建与发布

根目录中的 npm 包会通过 Vite 打包到 `dist`。`pnpm run build` 还会构建 Vite 示例，并通过代理验证已安装包的 API、CLI、静态示例资源和备用 API。npm 包的文件白名单仅包含 `bin` 和 `dist`（以及 npm 默认包含的包元数据、README 和许可证文件）。

```sh
pnpm install
pnpm run build
pnpm run publish
```

发布时默认按 SemVer 规则递增 patch 版本。也可以指定 `patch`、`minor`、`major`，或一个更高的确切 SemVer 版本号：

```sh
pnpm run publish -- minor
pnpm run publish -- 2.0.0
```
