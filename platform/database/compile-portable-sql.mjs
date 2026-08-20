#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

function parseArgs(argv) {
  const args = {
    sourceMigrations: '',
    sourceSeed: '',
    target: 'postgres',
    outputDir: ''
  }

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]

    if (arg === '--source-migrations' && next) {
      args.sourceMigrations = next
      i += 1
    } else if (arg === '--source-seed' && next) {
      args.sourceSeed = next
      i += 1
    } else if (arg === '--target' && next) {
      args.target = next
      i += 1
    } else if (arg === '--output-dir' && next) {
      args.outputDir = next
      i += 1
    }
  }

  return args
}

function splitSqlStatements(sql) {
  const statements = []
  let current = ''
  let quote = null
  let lineComment = false
  let blockComment = false

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i]
    const next = sql[i + 1]

    if (lineComment) {
      current += char
      if (char === '\n') lineComment = false
      continue
    }

    if (blockComment) {
      current += char
      if (char === '*' && next === '/') {
        current += next
        i += 1
        blockComment = false
      }
      continue
    }

    if (!quote && char === '-' && next === '-') {
      current += char + next
      i += 1
      lineComment = true
      continue
    }

    if (!quote && char === '/' && next === '*') {
      current += char + next
      i += 1
      blockComment = true
      continue
    }

    if ((char === '\'' || char === '"') && !quote) {
      quote = char
      current += char
      continue
    }

    if (quote === char) {
      current += char
      if (next === char) {
        current += next
        i += 1
      } else {
        quote = null
      }
      continue
    }

    if (!quote && char === ';') {
      const trimmed = current.trim()
      if (trimmed) statements.push(trimmed)
      current = ''
      continue
    }

    current += char
  }

  const trimmed = current.trim()
  if (trimmed) statements.push(trimmed)

  return statements
}

function transformShared(sql) {
  return sql
    .replace(/\r\n/g, '\n')
    .replace(/\bdatetime\s*\(\s*'now'\s*\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bdatetime\s*\(\s*"now"\s*\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bdate\s*\(\s*'now'\s*\)/gi, 'CURRENT_DATE')
    .replace(/\bdate\s*\(\s*"now"\s*\)/gi, 'CURRENT_DATE')
}

function transformSqliteAuthoringStatementToPostgres(statement) {
  let transformed = transformShared(statement)

  if (/^\s*PRAGMA\b/i.test(transformed)) {
    return ''
  }

  if (/\bINSERT\s+OR\s+IGNORE\s+INTO\b/i.test(transformed)) {
    transformed = transformed.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/i, 'INSERT INTO')
    transformed = `${transformed}\nON CONFLICT DO NOTHING`
  }

  transformed = transformed.replace(/\bAUTOINCREMENT\b/gi, '')

  return transformed
}

function compileSql(sql, target) {
  if (target !== 'postgres') {
    throw new Error(`Unsupported target dialect: ${target}`)
  }

  const statements = splitSqlStatements(sql)
  const compiled = statements
    .map((statement) => transformSqliteAuthoringStatementToPostgres(statement))
    .filter(Boolean)

  return `${compiled.join(';\n\n')};\n`
}

async function listSqlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort()
}

async function main() {
  const args = parseArgs(process.argv)

  if (!args.sourceMigrations || !args.sourceSeed || !args.outputDir) {
    throw new Error(
      'Usage: node compile-portable-sql.mjs --source-migrations <dir> --source-seed <file> --target postgres --output-dir <dir>'
    )
  }

  const migrationsDir = path.resolve(args.sourceMigrations)
  const seedFile = path.resolve(args.sourceSeed)
  const outputDir = path.resolve(args.outputDir)
  const outputMigrationsDir = path.join(outputDir, 'migrations')

  await mkdir(outputMigrationsDir, { recursive: true })

  const migrationFiles = await listSqlFiles(migrationsDir)
  for (const filename of migrationFiles) {
    const source = await readFile(path.join(migrationsDir, filename), 'utf8')
    const compiled = compileSql(source, args.target)
    await writeFile(path.join(outputMigrationsDir, filename), compiled, 'utf8')
  }

  const seedSource = await readFile(seedFile, 'utf8')
  const compiledSeed = compileSql(seedSource, args.target)
  await writeFile(path.join(outputDir, 'seed.sql'), compiledSeed, 'utf8')

  const manifest = {
    target: args.target,
    sourceMigrations: args.sourceMigrations,
    sourceSeed: args.sourceSeed,
    generatedAt: new Date().toISOString(),
    migrationFiles
  }

  await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  console.log(`Compiled ${migrationFiles.length} migration files and seed.sql to ${outputDir}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
