#!/usr/bin/env node

import { Command } from 'commander';
import { buildIndex } from './indexer.js';
import { search } from './search.js';
import { resolve } from 'path';

const program = new Command();

program
  .name('csearch')
  .description('Lightweight code search with AST understanding')
  .version('0.1.0');

program
  .command('build')
  .description('Build code index for current project')
  .option('-d, --dir <path>', 'Project directory', '.')
  .action(async (options) => {
    const projectRoot = resolve(options.dir);
    try {
      await buildIndex(projectRoot);
    } catch (err) {
      console.error('Build failed:', err);
      process.exit(1);
    }
  });

program
  .command('search <query>')
  .description('Search code index')
  .option('-d, --dir <path>', 'Project directory', '.')
  .option('-t, --type <type>', 'Filter by type: def, ref')
  .action((query, options) => {
    const projectRoot = resolve(options.dir);
    search(projectRoot, query, {
      type: options.type as 'def' | 'ref'
    });
  });

// 简写：csearch <query> 直接搜索
program
  .argument('[query]', 'Search query')
  .option('-d, --dir <path>', 'Project directory', '.')
  .action((query, options) => {
    if (!query) {
      program.help();
      return;
    }
    const projectRoot = resolve(options.dir);
    search(projectRoot, query);
  });

program.parse();
