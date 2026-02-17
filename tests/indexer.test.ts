import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { buildIndex } from '../src/indexer.js';
import { search } from '../src/search.js';

const TEST_DIR = '/tmp/codesearch-test';

describe('CodeSearch Indexer', () => {
  beforeAll(() => {
    // 创建测试项目
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, 'src'), { recursive: true });

    // 创建测试文件
    writeFileSync(join(TEST_DIR, 'src/utils.ts'), `
export function helper() {
  return "help";
}

export class MyClass {
  method() {
    helper();
  }
}
`);

    writeFileSync(join(TEST_DIR, 'src/main.ts'), `
import { helper, MyClass } from './utils';

function main() {
  helper();
  const obj = new MyClass();
  obj.method();
}

export { main };
`);
  });

  afterAll(() => {
    // 清理
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it('should build index successfully', async () => {
    await buildIndex(TEST_DIR);
    const indexPath = join(TEST_DIR, '.cindex', 'index.json');
    expect(existsSync(indexPath)).toBe(true);
  });

  it('should find function definitions', async () => {
    await buildIndex(TEST_DIR);
    const indexPath = join(TEST_DIR, '.cindex', 'index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    
    const helperDef = index.symbols.find(
      (s: any) => s.name === 'helper' && s.kind === 'def'
    );
    expect(helperDef).toBeDefined();
    expect(helperDef.type).toBe('function');
  });

  it('should find class definitions', async () => {
    await buildIndex(TEST_DIR);
    const indexPath = join(TEST_DIR, '.cindex', 'index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    
    const classDef = index.symbols.find(
      (s: any) => s.name === 'MyClass' && s.kind === 'def'
    );
    expect(classDef).toBeDefined();
    expect(classDef.type).toBe('class');
  });

  it('should find function references', async () => {
    await buildIndex(TEST_DIR);
    const indexPath = join(TEST_DIR, '.cindex', 'index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    
    const refs = index.symbols.filter(
      (s: any) => s.name === 'helper' && s.kind === 'ref'
    );
    expect(refs.length).toBeGreaterThan(0);
  });
});

describe('Incremental Indexing', () => {
  const INCR_TEST_DIR = '/tmp/codesearch-incr-test';

  beforeAll(() => {
    if (existsSync(INCR_TEST_DIR)) {
      rmSync(INCR_TEST_DIR, { recursive: true });
    }
    mkdirSync(INCR_TEST_DIR, { recursive: true });
    
    writeFileSync(join(INCR_TEST_DIR, 'file1.ts'), `export function foo() {}`);
    writeFileSync(join(INCR_TEST_DIR, 'file2.ts'), `export function bar() {}`);
  });

  afterAll(() => {
    if (existsSync(INCR_TEST_DIR)) {
      rmSync(INCR_TEST_DIR, { recursive: true });
    }
  });

  it('should store file metadata in index', async () => {
    await buildIndex(INCR_TEST_DIR);
    const indexPath = join(INCR_TEST_DIR, '.cindex', 'index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    
    expect(index.files).toBeDefined();
    expect(index.files.length).toBe(2);
    expect(index.files[0]).toHaveProperty('path');
    expect(index.files[0]).toHaveProperty('mtime');
    expect(index.files[0]).toHaveProperty('hash');
    expect(index.files[0]).toHaveProperty('size');
  });

  it('should skip unchanged files on rebuild', async () => {
    // 第一次构建
    await buildIndex(INCR_TEST_DIR);
    const indexPath = join(INCR_TEST_DIR, '.cindex', 'index.json');
    const firstIndex = JSON.parse(readFileSync(indexPath, 'utf-8'));
    const firstUpdated = firstIndex.updated;

    // 等待一小段时间
    await new Promise(r => setTimeout(r, 100));

    // 第二次构建（没有文件变化）
    await buildIndex(INCR_TEST_DIR);
    const secondIndex = JSON.parse(readFileSync(indexPath, 'utf-8'));

    // 索引应该相同（文件没变）
    expect(secondIndex.symbols.length).toBe(firstIndex.symbols.length);
    expect(secondIndex.files.length).toBe(firstIndex.files.length);
  });

  it('should reindex changed files', async () => {
    // 修改一个文件
    writeFileSync(join(INCR_TEST_DIR, 'file1.ts'), `export function foo() { return 1; }`);
    
    // 重新构建
    await buildIndex(INCR_TEST_DIR);
    const indexPath = join(INCR_TEST_DIR, '.cindex', 'index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));

    // 应该能找到新的符号或更新
    expect(index.files.length).toBe(2);
    expect(index.updated).toBeDefined();
  });

  it('should handle deleted files', async () => {
    // 删除一个文件
    rmSync(join(INCR_TEST_DIR, 'file2.ts'));
    
    // 重新构建
    await buildIndex(INCR_TEST_DIR);
    const indexPath = join(INCR_TEST_DIR, '.cindex', 'index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));

    // 应该只剩一个文件
    expect(index.files.length).toBe(1);
    expect(index.files[0].path).toBe('file1.ts');
    
    // 相关符号也应该被移除
    const barSymbols = index.symbols.filter((s: any) => s.name === 'bar');
    expect(barSymbols.length).toBe(0);
  });
});
