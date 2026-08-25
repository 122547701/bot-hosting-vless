const http = require('http');
const net = require('net');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 防止未捕获异常导致 Node 主进程直接崩溃
process.on('uncaughtException', (err) => console.error('[Warning] Uncaught Exception:', err.message));
process.on('unhandledRejection', (reason) => console.error('[Warning] Unhandled Rejection:', reason));

const PORT = process.env.PORT || 3000;
const INTERNAL_PORT = 8080;

// 1. Web 伪装服务与 WS 转发
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>Bot Runtime Active</h1>');
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
  console.log(`[Engine] Port: ${PORT}`);
});

// 2. 地址解密
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

  // 3. 守护式启动子进程，挂掉后自动在内部重启，防止容器崩溃
  if (fs.existsSync(BIN_CORE)) {
    const runCore = () => {
      const sb = spawn(BIN_CORE, ['run', '-c', 'config.json']);
      sb.on('exit', () => setTimeout(runCore, 3000)); // 挂掉后3秒自动重启
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
          console.log(`\n[Node Active] CF Tunnel: ${match[0]}\n`);
        }
      });
    };
    runTunnel();
  }
} catch (err) {
  console.error('[Error]', err.message);
}

// 维持进程防挂断
setInterval(() => {}, 100000);
