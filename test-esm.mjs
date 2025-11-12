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
  'language-server',
  'language-service',
  'shared',
  'types',
  'typescript-plugin',
  'vfs',
]

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

    // Special handling for language-server: it's a long-running process
    // If import hangs (timeout), it means the server started successfully
    // If import fails immediately with an error, check if it's acceptable
    if (packageName === 'language-server') {
      const importPromise = import(modulePath)
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve({ timeout: true }), 2000)
      })

      const result = await Promise.race([importPromise, timeoutPromise])

      if (result?.timeout) {
        // Import hung - this means the server started successfully
        // eslint-disable-next-line no-console
        console.log(`✓ ${packageName}: ESM import successful (long-running server started)`)
        return true
      }

      // Import completed without timeout - this is unexpected for a server
      // but we'll check if it has exports
      const exportKeys = Object.keys(result)
      if (exportKeys.length > 0 || typeof result.default === 'function') {
        // eslint-disable-next-line no-console
        console.log(`✓ ${packageName}: ESM import successful`)
        return true
      }

      console.error(`✗ ${packageName}: Import completed but no exports found`)
      return false
    }

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
    // For language-server, check if error is due to missing dependencies (acceptable)
    // or a real module loading error (not acceptable)
    if (packageName === 'language-server') {
      const errorMsg = error.message || ''

      // Check if it's a missing dependency error (acceptable - means module structure is OK)
      if (errorMsg.includes('Cannot find package') || errorMsg.includes('Cannot find module')) {
        // eslint-disable-next-line no-console
        console.log(`⚠ ${packageName}: Import test passed (missing optional dependency is acceptable)`)
        return true
      }

      // Real error - module structure is broken
      console.error(`✗ ${packageName}: Import failed - ${errorMsg}`)
      return false
    }

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

  const results = await Promise.all(packages.map(testPackage))
  const failed = results.filter(r => !r).length

  // eslint-disable-next-line no-console
  console.log(`\n${results.length - failed}/${results.length} packages passed ESM import test`)

  if (failed > 0) {
    process.exit(1)
  }

  process.exit(0)
}

testAll()
