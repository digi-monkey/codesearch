import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import Python from 'tree-sitter-python';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { join, relative, extname } from 'path';
import { glob } from 'glob';
import { createHash } from 'crypto';

interface Symbol {
  name: string;
  type: 'function' | 'class' | 'interface' | 'export' | 'import' | 'variable';
  file: string;
  line: number;
  column: number;
  kind: 'def' | 'ref';
  language: string;
}

interface FileMeta {
  path: string;
  mtime: number;
  hash: string;
  size: number;
  language: string;
}

interface Index {
  version: string;
  created: string;
  updated: string;
  symbols: Symbol[];
  files: FileMeta[];
  languages: string[];
}

// 语言配置
interface LanguageConfig {
  name: string;
  extensions: string[];
  parser: any;
  nodeTypes: {
    functionDef: string[];
    classDef: string[];
    importDef: string[];
    callExpr: string[];
  };
}

const languages: LanguageConfig[] = [
  {
    name: 'typescript',
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    parser: TypeScript.typescript,
    nodeTypes: {
      functionDef: ['function_declaration', 'function', 'arrow_function', 'method_definition'],
      classDef: ['class_declaration', 'class'],
      importDef: ['import_statement', 'import_specifier', 'export_specifier'],
      callExpr: ['call_expression'],
    },
  },
  {
    name: 'python',
    extensions: ['.py'],
    parser: Python,
    nodeTypes: {
      functionDef: ['function_definition'],
      classDef: ['class_definition'],
      importDef: ['import_statement', 'import_from_statement'],
      callExpr: ['call'],
    },
  },
];

// 文件扩展名到语言的映射
const extToLanguage = new Map<string, LanguageConfig>();
for (const lang of languages) {
  for (const ext of lang.extensions) {
    extToLanguage.set(ext, lang);
  }
}

// 根据文件路径获取语言配置
function getLanguageForFile(filePath: string): LanguageConfig | null {
  const ext = extname(filePath);
  return extToLanguage.get(ext) || null;
}

/**
 * 计算文件内容的 hash
 */
function getFileHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * 加载已有索引
 */
function loadExistingIndex(projectRoot: string): Index | null {
  const indexPath = join(projectRoot, '.cindex', 'index.json');
  if (!existsSync(indexPath)) return null;

  try {
    const content = readFileSync(indexPath, 'utf-8');
    const index = JSON.parse(content) as Index;
    // 兼容旧版本索引
    if (!index.files) return null;
    return index;
  } catch {
    return null;
  }
}

/**
 * 从 AST 中提取符号（通用版）
 */
function extractSymbols(node: Parser.SyntaxNode, file: string, lang: LanguageConfig): Symbol[] {
  const symbols: Symbol[] = [];

  function traverse(node: Parser.SyntaxNode) {
    const start = node.startPosition;

    // 函数定义
    if (lang.nodeTypes.functionDef.includes(node.type)) {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        symbols.push({
          name: nameNode.text,
          type: 'function',
          file,
          line: start.row + 1,
          column: start.column,
          kind: 'def',
          language: lang.name,
        });
      }
    }

    // 类定义
    if (lang.nodeTypes.classDef.includes(node.type)) {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        symbols.push({
          name: nameNode.text,
          type: 'class',
          file,
          line: start.row + 1,
          column: start.column,
          kind: 'def',
          language: lang.name,
        });
      }
    }

    // 导入语句
    if (lang.nodeTypes.importDef.includes(node.type)) {
      // TypeScript/JavaScript 的导入处理
      if (lang.name === 'typescript') {
        if (node.type === 'import_specifier' || node.type === 'export_specifier') {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            symbols.push({
              name: nameNode.text,
              type: 'import',
              file,
              line: start.row + 1,
              column: start.column,
              kind: 'ref',
              language: lang.name,
            });
          }
        }
      }
      // Python 的导入处理
      if (lang.name === 'python') {
        // Python import 比较复杂，简化处理
        if (node.type === 'import_from_statement') {
          const moduleNode = node.childForFieldName('module_name');
          if (moduleNode) {
            symbols.push({
              name: moduleNode.text,
              type: 'import',
              file,
              line: start.row + 1,
              column: start.column,
              kind: 'ref',
              language: lang.name,
            });
          }
        }
      }
    }

    // 函数调用/引用
    if (lang.nodeTypes.callExpr.includes(node.type)) {
      const func = node.childForFieldName('function');
      if (func) {
        let funcName: string | null = null;
        
        // 直接调用: func()
        if (func.type === 'identifier') {
          funcName = func.text;
        }
        // 方法调用: obj.method()
        else if (func.type === 'member_expression' || func.type === 'attribute') {
          const prop = func.childForFieldName('property') || func.childForFieldName('attribute');
          if (prop) {
            funcName = prop.text;
          }
        }

        if (funcName) {
          symbols.push({
            name: funcName,
            type: 'function',
            file,
            line: start.row + 1,
            column: start.column,
            kind: 'ref',
            language: lang.name,
          });
        }
      }
    }

    // 递归遍历子节点
    for (const child of node.children) {
      traverse(child);
    }
  }

  traverse(node);
  return symbols;
}

/**
 * 解析单个文件
 */
function parseFile(filePath: string, projectRoot: string, lang: LanguageConfig): { symbols: Symbol[]; meta: FileMeta } | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const stats = statSync(filePath);
    
    const parser = new Parser();
    parser.setLanguage(lang.parser);
    
    const tree = parser.parse(content);
    const relativePath = relative(projectRoot, filePath);
    const symbols = extractSymbols(tree.rootNode, relativePath, lang);
    
    return {
      symbols,
      meta: {
        path: relativePath,
        mtime: stats.mtimeMs,
        hash: getFileHash(content),
        size: stats.size,
        language: lang.name,
      }
    };
  } catch (err) {
    console.error(`Error parsing ${filePath}:`, err);
    return null;
  }
}

/**
 * 判断文件是否需要重新索引
 */
function needsReindex(filePath: string, relativePath: string, existingFiles: Map<string, FileMeta>): boolean {
  if (!existingFiles.has(relativePath)) return true;

  const existing = existingFiles.get(relativePath)!;
  const stats = statSync(filePath);

  if (stats.mtimeMs !== existing.mtime) return true;
  if (stats.size !== existing.size) return true;

  const content = readFileSync(filePath, 'utf-8');
  const currentHash = getFileHash(content);
  if (currentHash !== existing.hash) return true;

  return false;
}

/**
 * 构建项目索引（支持增量更新和多语言）
 */
export async function buildIndex(projectRoot: string): Promise<void> {
  const startTime = Date.now();
  
  // 加载已有索引
  const existingIndex = loadExistingIndex(projectRoot);
  const existingFiles = new Map<string, FileMeta>();
  
  if (existingIndex) {
    console.log(`Found existing index (${existingIndex.symbols.length} symbols)`);
    for (const f of existingIndex.files) {
      existingFiles.set(f.path, f);
    }
  }

  // 构建 glob 模式（所有支持的扩展名）
  const allExtensions = languages.flatMap(l => l.extensions);
  const globPattern = `**/*{${allExtensions.join(',')}}`;

  // 查找所有文件
  const files = await glob(globPattern, {
    cwd: projectRoot,
    ignore: ['node_modules/**', 'dist/**', '.git/**', '__pycache__/**', '*.pyc'],
  });

  const currentFileSet = new Set(files);
  const allSymbols: Symbol[] = [];
  const allFiles: FileMeta[] = [];
  const usedLanguages = new Set<string>();
  
  let processedCount = 0;
  let skippedCount = 0;
  let deletedCount = 0;
  let errorCount = 0;

  for (const file of files) {
    const filePath = join(projectRoot, file);
    const lang = getLanguageForFile(filePath);
    
    if (!lang) {
      console.warn(`Unknown language for file: ${file}`);
      continue;
    }

    usedLanguages.add(lang.name);
    
    // 检查是否需要重新索引
    if (existingIndex && !needsReindex(filePath, file, existingFiles)) {
      const existingMeta = existingFiles.get(file)!;
      const existingSymbols = existingIndex.symbols.filter(s => s.file === file);
      allSymbols.push(...existingSymbols);
      allFiles.push(existingMeta);
      skippedCount++;
      continue;
    }

    // 重新解析文件
    const result = parseFile(filePath, projectRoot, lang);
    if (result) {
      allSymbols.push(...result.symbols);
      allFiles.push(result.meta);
      processedCount++;
    } else {
      errorCount++;
    }
  }

  // 检测已删除的文件
  if (existingIndex) {
    for (const oldFile of existingIndex.files) {
      if (!currentFileSet.has(oldFile.path)) {
        deletedCount++;
      }
    }
    if (deletedCount > 0) {
      console.log(`Detected ${deletedCount} deleted files`);
    }
  }

  // 创建索引
  const now = new Date().toISOString();
  const index: Index = {
    version: '0.3.0',
    created: existingIndex?.created || now,
    updated: now,
    symbols: allSymbols,
    files: allFiles,
    languages: Array.from(usedLanguages),
  };

  // 保存索引
  const indexDir = join(projectRoot, '.cindex');
  if (!existsSync(indexDir)) {
    mkdirSync(indexDir, { recursive: true });
  }

  const indexPath = join(indexDir, 'index.json');
  writeFileSync(indexPath, JSON.stringify(index, null, 2));

  const duration = Date.now() - startTime;

  // 输出统计
  console.log(`\n✓ Index updated in ${duration}ms`);
  console.log(`  Files: ${processedCount} processed, ${skippedCount} unchanged, ${deletedCount} removed` + (errorCount > 0 ? `, ${errorCount} errors` : ''));
  console.log(`  Languages: ${Array.from(usedLanguages).join(', ')}`);
  console.log(`  Symbols: ${allSymbols.length} total`);
  console.log(`    - Functions: ${allSymbols.filter(s => s.type === 'function').length}`);
  console.log(`    - Classes: ${allSymbols.filter(s => s.type === 'class').length}`);
  console.log(`    - Imports: ${allSymbols.filter(s => s.type === 'import').length}`);
  console.log(`    - References: ${allSymbols.filter(s => s.kind === 'ref').length}`);
  console.log(`\nIndex saved to: ${indexPath}`);
}
