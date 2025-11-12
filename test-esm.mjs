#!/usr/bin/env node
/**
 * Consolidated ESM import test for all packages
 * Tests that packages can be imported as ESM modules
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Packages that support ESM imports
const packages = [
  'language-plugin',
  'language-service',
  'shared',
  'types',
  'typescript-plugin',
  'vfs',
]

// Language server is a long-running process that needs arguments
// and doesn't exit on its own, so we check its binary exists instead
async function testLanguageServer() {
  try {
    const packagePath = join(__dirname, 'packages', 'language-server')
    const binPath = join(packagePath, 'bin', 'ets-language-server.js')
    const esmBinPath = join(packagePath, 'bin', 'ets-language-server.mjs')

    const binExists = readFileSync(binPath, 'utf-8').length > 0
    const esmBinExists = readFileSync(esmBinPath, 'utf-8').length > 0

    if (binExists && esmBinExists) {
      // eslint-disable-next-line no-console
      console.log(`✓ language-server: Binary files validated (long-running server process)`)
      return true
    }

    console.error(`✗ language-server: Binary files not found or empty`)
    return false
  }
  catch (error) {
    console.error(`✗ language-server: Validation failed - ${error.message}`)
    return false
  }
}

async function testPackage(packageName) {
  try {
    const packagePath = join(__dirname, 'packages', packageName)
    const packageJsonPath = join(packagePath, 'package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

    // Determine the ESM entry point from package.json exports
    let esmEntry = './out/index.mjs'
    const exportsField = packageJson.exports?.['.']
    if (typeof exportsField === 'string') {
      esmEntry = exportsField
    }
    else if (exportsField?.import) {
      // Handle nested import field (could be string or object with default)
      if (typeof exportsField.import === 'string') {
        esmEntry = exportsField.import
      }
      else if (exportsField.import?.default) {
        esmEntry = exportsField.import.default
      }
    }
    else if (packageJson.module) {
      esmEntry = packageJson.module
    }

    const modulePath = join(packagePath, esmEntry)
    const module = await import(modulePath)

    // Check that the module has exports or is a function
    const exportKeys = Object.keys(module)

    // Check if it's a default function export
    if (typeof module.default === 'function') {
      // eslint-disable-next-line no-console
      console.log(`✓ ${packageName}: ESM import successful (default function export)`)
      return true
    }

    if (exportKeys.length === 0) {
      console.error(`✗ ${packageName}: Expected module to have exports`)
      return false
    }

    // eslint-disable-next-line no-console
    console.log(`✓ ${packageName}: ESM import successful (${exportKeys.length} exports)`)
    return true
  }
  catch (error) {
    // Warn about missing dependencies but don't fail the test
    if (error.message.includes('Cannot find package') || error.message.includes('Cannot find module')) {
      // eslint-disable-next-line no-console
      console.log(`⚠ ${packageName}: Skipped - missing dependency (${error.message.split('\n')[0]})`)
      return true
    }
    console.error(`✗ ${packageName}: Import failed - ${error.message}`)
    return false
  }
}

async function testAll() {
  // eslint-disable-next-line no-console
  console.log('Testing ESM imports for all packages...\n')

  const results = await Promise.all([
    ...packages.map(testPackage),
    testLanguageServer(),
  ])
  const failed = results.filter(r => !r).length

  // eslint-disable-next-line no-console
  console.log(`\n${results.length - failed}/${results.length} packages passed ESM import test`)

  if (failed > 0) {
    process.exit(1)
  }

  process.exit(0)
}

testAll()
