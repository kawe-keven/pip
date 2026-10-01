const fs = require('fs/promises');
const { createReadStream } = require('fs');
const path = require('path');

const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 512 * 1024;
const MAX_FILES = 3;
const TEXT_FILE_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.jsonc', '.js', '.jsx', '.mjs', '.cjs',
  '.ts', '.tsx', '.py', '.html', '.htm', '.css', '.scss', '.xml', '.yaml', '.yml', '.toml',
  '.log', '.sql', '.sh', '.bat', '.cmd', '.ps1', '.c', '.h', '.cpp', '.hpp', '.java', '.rs',
  '.go', '.php', '.rb', '.vue', '.svelte', '.ini', '.env', '.diff', '.patch',
]);

async function readBoundedFile(filePath) {
  const chunks = [];
  let size = 0;
  for await (const chunk of createReadStream(filePath, { highWaterMark: 64 * 1024 })) {
    size += chunk.byteLength;
    if (size > MAX_FILE_BYTES) throw new Error('Cada arquivo pode ter até 256 KB.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

async function readDroppedFiles(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length < 1 || filePaths.length > MAX_FILES) {
    throw new Error(`Solte de 1 a ${MAX_FILES} arquivos de texto por vez.`);
  }

  const attachments = [];
  let totalBytes = 0;
  for (const filePath of filePaths) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('Não consegui identificar um dos arquivos soltos.');
    const basename = path.basename(filePath);
    const lowerName = basename.toLowerCase();
    const extension = path.extname(lowerName).toLowerCase() || (lowerName.startsWith('.') ? lowerName : '');
    if (!TEXT_FILE_EXTENSIONS.has(extension)) throw new Error(`O formato ${extension || 'desse arquivo'} não é compatível. Solte um arquivo de texto ou código.`);

    let file;
    try {
      file = await fs.stat(filePath);
    } catch {
      throw new Error('Não consegui abrir um dos arquivos soltos.');
    }
    if (!file.isFile()) throw new Error('Solte arquivos individuais, não pastas.');
    if (file.size > MAX_FILE_BYTES) throw new Error('Cada arquivo pode ter até 256 KB.');

    let buffer;
    try {
      buffer = await readBoundedFile(filePath);
    } catch (error) {
      if (error.message === 'Cada arquivo pode ter até 256 KB.') throw error;
      throw new Error('Não consegui abrir um dos arquivos soltos.');
    }
    if (buffer.byteLength > MAX_FILE_BYTES) throw new Error('Cada arquivo pode ter até 256 KB.');
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('Os arquivos juntos podem ter até 512 KB.');
    if (buffer.includes(0)) throw new Error('Só consigo ler arquivos de texto codificados em UTF-8.');

    let content;
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      throw new Error('Só consigo ler arquivos de texto codificados em UTF-8.');
    }
    attachments.push({ name: basename, content, size: buffer.byteLength });
  }
  return attachments;
}

const FILE_DIALOG_EXTENSIONS = [...TEXT_FILE_EXTENSIONS]
  .map((extension) => extension.slice(1));

module.exports = { readDroppedFiles, FILE_DIALOG_EXTENSIONS, MAX_FILE_BYTES, MAX_TOTAL_BYTES, MAX_FILES };
