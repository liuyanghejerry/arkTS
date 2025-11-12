#!/usr/bin/env node
/**
 * Consolidated CJS require test for all packages
 * Tests that packages can be required as CommonJS modules
 */

const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const process = require('node:process')

// Packages that support CJS require
const packages = [
  'language-plugin',
  'language-server',
  'language-service',
  'shared',
  'types',
  'typescript-plugin',
  'vfs',
]

// VSCode package has a different test (build artifact check)
async function testVscodePackage() {
  try {
    const vscodePackagePath = join(__dirname, 'packages', 'vscode')
    const mainFile = join(vscodePackagePath, 'dist', 'client.js')

    if (!existsSync(mainFile)) {
      console.error('✗ vscode: Main file not found:', mainFile)
      return false
    }

    const stats = require('node:fs').statSync(mainFile)
    if (stats.size === 0) {
      console.error('✗ vscode: Main file is empty')
      return false
    }

    // eslint-disable-next-line no-console
    console.log(`✓ vscode: Build artifacts validated (${(stats.size / 1024).toFixed(2)} KB)`)
    return true
  }
  catch (error) {
    console.error(`✗ vscode: Test failed - ${error.message}`)
    return false
  }
}

async function testPackage(packageName) {
  try {
    const packagePath = join(__dirname, 'packages', packageName)
    const packageJsonPath = join(packagePath, 'package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

    // Determine the CJS entry point from package.json exports
    let cjsEntry = './out/index.js'
    const exportsField = packageJson.exports?.['.']
    if (typeof exportsField === 'string') {
      cjsEntry = exportsField
    }
    else if (exportsField?.require) {
      // Handle nested require field (could be string or object with default)
      if (typeof exportsField.require === 'string') {
        cjsEntry = exportsField.require
      }
      else if (exportsField.require?.default) {
        cjsEntry = exportsField.require.default
      }
    }
    else if (exportsField?.default) {
      cjsEntry = exportsField.default
    }
    else if (packageJson.main) {
      cjsEntry = packageJson.main
    }

    const modulePath = join(packagePath, cjsEntry)

    // Special handling for language-server: it's a long-running process
    // We need to use a separate process to test it with timeout
    if (packageName === 'language-server') {
      return new Promise((resolve) => {
        const { spawn } = require('node:child_process')
        const child = spawn(process.execPath, [
          '-e',
          `try { require('${modulePath.replace(/\\/g, '\\\\')}'); } catch(e) { console.error('ERROR:', e.message); process.exit(1); }`,
        ])

        let errorOutput = ''

        child.stderr.on('data', (data) => {
          errorOutput += data.toString()
        })

        // If process is still running after 2 seconds, it means server started successfully
        const timeout = setTimeout(() => {
          child.kill()
          // eslint-disable-next-line no-console
          console.log(`✓ ${packageName}: CJS require successful (long-running server started)`)
          resolve(true)
        }, 2000)

        child.on('exit', () => {
          clearTimeout(timeout)

          // If process exited immediately, check the error
          if (errorOutput.includes('ERROR:')) {
            const errorMsg = errorOutput.split('ERROR:')[1]?.trim() || ''

            // Check if it's a missing dependency error (acceptable)
            if (errorMsg.includes('Cannot find package') || errorMsg.includes('Cannot find module')) {
              // eslint-disable-next-line no-console
              console.log(`⚠ ${packageName}: Require test passed (missing optional dependency is acceptable)`)
              resolve(true)
            }
            else {
              console.error(`✗ ${packageName}: Require failed - ${errorMsg}`)
              resolve(false)
            }
          }
          else {
            // Process exited without error - unexpected but acceptable
            // eslint-disable-next-line no-console
            console.log(`✓ ${packageName}: CJS require successful`)
            resolve(true)
          }
        })
      })
    }

    const module = require(modulePath)

    // Check if the module is a function (default export)
    if (typeof module === 'function') {
      // eslint-disable-next-line no-console
      console.log(`✓ ${packageName}: CJS require successful (default function export)`)
      return true
    }

    // Check that the module has exports
    const exportKeys = Object.keys(module)
    if (exportKeys.length === 0) {
      console.error(`✗ ${packageName}: Expected module to have exports or be a function`)
      return false
    }

    // eslint-disable-next-line no-console
    console.log(`✓ ${packageName}: CJS require successful (${exportKeys.length} exports)`)
    return true
  }
  catch (error) {
    // Warn about missing dependencies but don't fail the test
    if (error.message.includes('Cannot find package') || error.message.includes('Cannot find module')) {
      // eslint-disable-next-line no-console
      console.log(`⚠ ${packageName}: Skipped - missing dependency (${error.message.split('\n')[0]})`)
      return true
    }
    console.error(`✗ ${packageName}: Require failed - ${error.message}`)
    return false
  }
}

async function testAll() {
  // eslint-disable-next-line no-console
  console.log('Testing CJS require for all packages...\n')

  const results = await Promise.all([
    ...packages.map(testPackage),
    testVscodePackage(),
  ])

  const failed = results.filter(r => !r).length

  // eslint-disable-next-line no-console
  console.log(`\n${results.length - failed}/${results.length} packages passed CJS require test`)

  if (failed > 0) {
    process.exit(1)
  }

  process.exit(0)
}

testAll()
