const http = require('http');
const net = require('net');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

process.on('uncaughtException', (err) => console.error('[Warning] Uncaught Exception:', err.message));
process.on('unhandledRejection', (reason) => console.error('[Warning] Unhandled Rejection:', reason));

const PORT = process.env.PORT || 3000;
const INTERNAL_PORT = 8080;

// 读取 config.json 中的 UUID，读取失败时自动使用默认 UUID
let UUID = 'e8a946c5-4089-4e78-a2cd-3e3c0ef3b4e6';
try {
  const configFile = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8');
  const configJson = JSON.parse(configFile);
  if (configJson.inbounds?.[0]?.users?.[0]?.uuid) {
    UUID = configJson.inbounds[0].users[0].uuid;
  }
} catch (e) {}

let currentCfDomain = '';

// 1. Web 服务：同时提供伪装与网页一键获取节点功能
const server = http.createServer((req, res) => {
  if (req.url === '/node-info') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const cfLink = currentCfDomain 
      ? `vless://${UUID}@${currentCfDomain}:443?encryption=none&security=tls&sni=${currentCfDomain}&type=ws&host=${currentCfDomain}&path=%2Fvless-ws#CF-Tunnel` 
      : '正在生成隧道中，请刷新页面...';
    
    res.end(`
      <h2>节点快捷获取页</h2>
      <p><b>UUID:</b> ${UUID}</p>
      <p><b>CF 隧道节点链接:</b></p>
      <textarea style="width:100%;height:80px;">${cfLink}</textarea>
    `);
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>Bot Engine Service</h1><p>Status: Active</p>');
});

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/vless-ws') {
    const targetSocket = net.connect(INTERNAL_PORT, '127.0.0.1', () => {
      targetSocket.write(
        `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` +
        Object.keys(req.headers).map(k => `${k}: ${req.headers[k]}`).join('\r\n') +
        '\r\n\r\n'
      );
      targetSocket.write(head);
      socket.pipe(targetSocket);
      targetSocket.pipe(socket);
    });
    targetSocket.on('error', () => socket.destroy());
    socket.on('error', () => targetSocket.destroy());
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`[Engine] Running on port ${PORT}`);
});

// 2. 解密 Base64 下载地址
const decode = (str) => Buffer.from(str, 'base64').toString('utf-8');
const URL_CORE = decode('aHR0cHM6Ly9naXRodWIuY29tL1NhZ2VyTmV0L3NpbmctYm94L3JlbGVhc2VzL2Rvd25sb2FkL3YxLjkuMy9zaW5nLWJveC0xLjkuMy1saW51eC1hbWQ2NC50YXIuZ3o=');
const URL_TUNNEL = decode('aHR0cHM6Ly9naXRodWIuY29tL2Nsb3VkZmxhcmUvY2xvdWRmbGFyZWQvcmVsZWFzZXMvbGF0ZXN0L2Rvd25sb2FkL2Nsb3VkZmxhcmVkLWxpbnV4LWFtZDY0');

const BIN_CORE = path.join(__dirname, 'web');
const BIN_TUNNEL = path.join(__dirname, 'npm-runner');

function prepareBinaries() {
  const ua = 'npm/9.6.7 node/v18.16.0 linux x64';
  if (!fs.existsSync(BIN_CORE)) {
    try {
      execSync(`curl -A "${ua}" -sSL "${URL_CORE}" | tar -xz -C /tmp && mv /tmp/sing-box-*/sing-box ${BIN_CORE} && chmod +x ${BIN_CORE}`);
    } catch (e) {}
  }
  if (!fs.existsSync(BIN_TUNNEL)) {
    try {
      execSync(`curl -A "${ua}" -sSL -o ${BIN_TUNNEL} "${URL_TUNNEL}" && chmod +x ${BIN_TUNNEL}`);
    } catch (e) {}
  }
}

try {
  prepareBinaries();

  if (fs.existsSync(BIN_CORE)) {
    const runCore = () => {
      const sb = spawn(BIN_CORE, ['run', '-c', 'config.json']);
      sb.on('exit', () => setTimeout(runCore, 3000));
      sb.stdout.on('data', () => {});
      sb.stderr.on('data', () => {});
    };
    runCore();
  }

  if (fs.existsSync(BIN_TUNNEL)) {
    const runTunnel = () => {
      const cf = spawn(BIN_TUNNEL, ['tunnel', '--url', `http://127.0.0.1:${INTERNAL_PORT}`]);
      cf.on('exit', () => setTimeout(runTunnel, 5000));
      cf.stderr.on('data', data => {
        const match = data.toString().match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match) {
          const fullUrl = match[0];
          currentCfDomain = fullUrl.replace('https://', '');
          
          const cfVlessLink = `vless://${UUID}@${currentCfDomain}:443?encryption=none&security=tls&sni=${currentCfDomain}&type=ws&host=${currentCfDomain}&path=%2Fvless-ws#CF-Tunnel`;
          const nativeTemplate = `vless://${UUID}@<公网IP或域名>:<公网端口>?encryption=none&security=none&type=ws&path=%2Fvless-ws#Native-Direct`;

          console.log('\n==================================================');
          console.log('🚀【CF 隧道加速节点链接】(可直接复制导入客户端):');
          console.log(cfVlessLink);
          console.log('\n⚡【原生直连节点链接模板】(需手动替换公网IP和端口):');
          console.log(nativeTemplate);
          console.log('==================================================\n');
        }
      });
    };
    runTunnel();
  }
} catch (err) {
  console.error('[Error]', err.message);
}

setInterval(() => {}, 100000);
