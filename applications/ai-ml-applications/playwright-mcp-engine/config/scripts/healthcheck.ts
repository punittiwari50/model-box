import http from 'node:http';
import process from 'node:process';

const req = http.get('http://localhost:8940/health', (res) => {
  res.destroy();
  const isOk = res.statusCode === 200;
  const exitActions: Record<string, () => never> = {
    true: () => process.exit(0),
    false: () => process.exit(1),
  };
  exitActions[String(isOk)]();
});

req.on('error', () => {
  process.exit(1);
});
