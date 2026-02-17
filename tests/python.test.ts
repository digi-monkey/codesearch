import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { buildIndex } from '../src/indexer.js';

const PYTHON_TEST_DIR = '/tmp/codesearch-python-test';

describe('Python Support', () => {
  beforeAll(() => {
    if (existsSync(PYTHON_TEST_DIR)) {
      rmSync(PYTHON_TEST_DIR, { recursive: true });
    }
    mkdirSync(PYTHON_TEST_DIR, { recursive: true });

    writeFileSync(join(PYTHON_TEST_DIR, 'utils.py'), `
def helper():
    return "help"

class MyClass:
    def method(self):
        helper()
        
    @staticmethod
    def static_method():
        pass
`);

    writeFileSync(join(PYTHON_TEST_DIR, 'main.py'), `
from utils import MyClass

def main():
    obj = MyClass()
    obj.method()
    print("Hello")

if __name__ == "__main__":
    main()
`);
  });

  afterAll(() => {
    if (existsSync(PYTHON_TEST_DIR)) {
      rmSync(PYTHON_TEST_DIR, { recursive: true });
    }
  });

  it('should index Python files', async () => {
    await buildIndex(PYTHON_TEST_DIR);
    const indexPath = join(PYTHON_TEST_DIR, '.cindex', 'index.json');
    
    expect(existsSync(indexPath)).toBe(true);
    
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    expect(index.languages).toContain('python');
    expect(index.symbols.length).toBeGreaterThan(0);
  });

  it('should find Python function definitions', async () => {
    await buildIndex(PYTHON_TEST_DIR);
    const indexPath = join(PYTHON_TEST_DIR, '.cindex', 'index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    
    const helperDef = index.symbols.find(
      (s: any) => s.name === 'helper' && s.kind === 'def' && s.language === 'python'
    );
    expect(helperDef).toBeDefined();
    expect(helperDef.type).toBe('function');
    expect(helperDef.file).toBe('utils.py');
  });

  it('should find Python class definitions', async () => {
    await buildIndex(PYTHON_TEST_DIR);
    const indexPath = join(PYTHON_TEST_DIR, '.cindex', 'index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    
    const classDef = index.symbols.find(
      (s: any) => s.name === 'MyClass' && s.kind === 'def' && s.language === 'python'
    );
    expect(classDef).toBeDefined();
    expect(classDef.type).toBe('class');
  });

  it('should find Python method definitions', async () => {
    await buildIndex(PYTHON_TEST_DIR);
    const indexPath = join(PYTHON_TEST_DIR, '.cindex', 'index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    
    const methodDef = index.symbols.find(
      (s: any) => s.name === 'method' && s.type === 'function' && s.language === 'python'
    );
    expect(methodDef).toBeDefined();
  });

  it('should handle mixed TypeScript and Python project', async () => {
    writeFileSync(join(PYTHON_TEST_DIR, 'helper.ts'), `
export function tsHelper() {
  return "TypeScript helper";
}
`);

    await buildIndex(PYTHON_TEST_DIR);
    const indexPath = join(PYTHON_TEST_DIR, '.cindex', 'index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    
    expect(index.languages).toContain('python');
    expect(index.languages).toContain('typescript');
    
    const pythonSymbol = index.symbols.find((s: any) => s.language === 'python');
    expect(pythonSymbol).toBeDefined();
    
    const tsSymbol = index.symbols.find((s: any) => s.language === 'typescript');
    expect(tsSymbol).toBeDefined();
  });
});
