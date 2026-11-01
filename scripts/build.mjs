/** Vite 构建封装（用 API 调用，避免命令行被判成长驻进程） */
import { build } from 'vite';

try {
  await build({ logLevel: 'info' });
  console.log('BUILD_DONE');
} catch (err) {
  console.error('BUILD_FAILED');
  console.error(err);
  process.exit(1);
}
