const { spawn } = require('child_process');
const http = require('http');

const child = spawn('npm', ['start'], { stdio: ['ignore', 'pipe', 'pipe'] });

let stdout = '';
child.stdout.on('data', (data) => {
  const output = data.toString();
  stdout += output;
  process.stdout.write(output);
  // Relaxed the condition to match "running"
  if (output.toLowerCase().includes('running')) {
    checkServer();
  }
});

child.stderr.on('data', (data) => {
  process.stderr.write(data.toString());
});

function checkServer() {
  http.get('http://127.0.0.1:3000/', (res) => {
    console.log('HTTP Status:', res.statusCode);
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      const hasTitle = body.includes('<title>') && body.includes('Tiles');
      console.log('HTML title includes "Tiles":', hasTitle);
      child.kill();
      process.exit(res.statusCode === 200 && hasTitle ? 0 : 1);
    });
  }).on('error', (err) => {
    console.error('Fetch error:', err.message);
    child.kill();
    process.exit(1);
  });
}

setTimeout(() => {
  console.error('Timeout waiting for server to start');
  child.kill();
  process.exit(1);
}, 10000);
