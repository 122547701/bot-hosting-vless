# Bot-Hosting VLESS 节点部署与加速指南

本项目专为 **Bot-Hosting**（翼龙 Pterodactyl 面板）设计，用于快速部署 VLESS + WS 节点，并结合 **Cloudflare Worker** 实现 CDN 反向代理与优选 IP 加速。

---

## 🚀 一、 快速部署教程

1. **上传项目文件**
   * 将项目文件上传至 Bot-Hosting 面板的文件管理器中。
2. **配置账户 UUID**
   * 打开 `config.json`，找到 `uuid` 字段，填入你自定义的 UUID：
     ```json
     "uuid": "你的自定义UUID"
     ```
3. **启动节点服务**
   * 在 Bot-Hosting 控制台点击 **Start** 或 **Restart**。
   * 启动成功后，控制台日志会自动打印原生节点的域名与分配端口。

---

## ⚙️ 二、 节点参数配置速查表

| 配置参数 | 原生直连节点 | CF Worker 加速节点 (推荐) |
| :--- | :--- | :--- |
| **协议类型 (Protocol)** | VLESS | VLESS |
| **服务器地址 (Address)** | `fi3.bot-hosting.net` *(控制台域名)* | `104.16.160.1` 或 `icook.hk` *(优选 IP/域名)* |
| **端口 (Port)** | 控制台分配端口 (如 `25150`) | `443` |
| **用户 ID (UUID)** | 你的 UUID | 你的 UUID |
| **传输协议 (Network)** | `ws` (WebSocket) | `ws` (WebSocket) |
| **伪装路径 (Path)** | `/vless-ws` | `/vless-ws` |
| **传输层安全 (TLS)** | 关闭 (`none`) | 开启 (`tls`) |
| **伪装域名 (Host)** | *(留空)* | `你的 Worker 域名` |
| **SNI** | *(留空)* | `你的 Worker 域名` |

---

## 🔗 三、 节点快捷连接模板

将下方模板链接中的 `<占位符>` 替换为你自己的实际信息，直接复制并导入客户端（如 v2rayN、Shadowrocket 等）：

### 1. 原生直连节点模板
```text
vless://<你的UUID>@<控制台分配域名>:<控制台分配端口>?encryption=none&security=none&type=ws&path=%2Fvless-ws#原生直连节点
```

### 2. CF Worker 加速节点模板
```text
vless://<你的UUID>@104.16.160.1:443?encryption=none&security=tls&sni=<你的Worker域名>&type=ws&host=<你的Worker域名>&path=%2Fvless-ws#CF-Worker加速节点
```

---

## 🌐 四、 Cloudflare Worker 加速教程与反代代码

因 `*.trycloudflare.com` 临时隧道域名极易被阻断，使用 Cloudflare Worker 自建 WebSocket 反向代理是兼顾稳定与高速的最佳方案。

### 1. 创建 Worker
1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，点击左侧 **Workers 和 Pages**。
2. 选择 **创建应用程序 (Create Application)** -> **创建 Worker (Create Worker)**。
3. 输入任意名称后点击 **部署 (Deploy)**，随后点击 **编辑代码 (Edit Code)**。

### 2. 反向代理脚本代码
清空编辑器原代码，粘贴以下内容（**请将脚本内的域名和端口修改为你实际的原生节点信息**）：

```javascript
export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 填入你的 Bot-Hosting 原生节点地址与分配端口
    url.hostname = 'fi3.bot-hosting.net'; 
    url.port = '25150'; 
    url.protocol = 'http:';

    // 复制并重写请求头
    const newHeaders = new Headers(request.headers);
    newHeaders.set('Host', 'fi3.bot-hosting.net');

    const proxyRequest = new Request(url.toString(), {
      method: request.method,
      headers: newHeaders,
      body: request.body,
      redirect: 'manual'
    });

    return fetch(proxyRequest);
  }
};
```

### 3. 部署与导入
1. 点击右上角 **保存并部署 (Save and deploy)**。
2.  将官方分配的Worker 域名绑定自定义域名 复制自定义域名（例如 `my-proxy.subdomain.workers.dev`）。
3. 使用 **第三节的 CF Worker 加速模板** 替换为你的 Worker 域名导入客户端使用。

---

## 💡 五、 优化与使用建议

1. **开启 Mux 多路复用**：
   * 在客户端节点配置中开启 **Mux 多路复用**，可在高延迟节点上大幅减少新建连接的握手等待耗时，提升网页多图与并发加载速度。
2. **更换优选 IP**：
   * 可将 Worker 节点的 Address 改为本地运营商测速最快、延迟最低的 Cloudflare 优选 IP（如 `icook.hk` 或其他第三方优选 IP 库）。
