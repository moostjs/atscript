import 'zx/globals'
import { readFileSync, writeFileSync } from 'fs'

import { dye } from '@prostojs/dye'
import inquirer from 'inquirer'

import pkg from '../package.json' with { type: 'json' }
import { getWorkspaceFolders } from './utils.js'

let i = 1
const info = dye('blue').attachConsole()
const step = dye('cyan')
  .prefix(() => `\n${i++}. `)
  .attachConsole()
const done = dye('green')
  .prefix(() => ` ✅ `)
  .attachConsole()

// Function to sync workspace package versions to the new version
function syncVersions(newVersion) {
  const workspaces = getWorkspaceFolders()
  for (const ws of workspaces) {
    const packagePath = `./packages/${ws}/package.json`
    const packageData = JSON.parse(readFileSync(packagePath, 'utf8'))
    packageData.version = newVersion
    writeFileSync(packagePath, JSON.stringify(packageData, null, 2))
    done(`Updated ${ws} to version ${newVersion}`)
  }
}

async function main() {
  try {
    // Step 0: Check for uncommitted changes
    step('Checking for uncommitted changes...')
    const { stdout: status } = await $`git status --porcelain`
    if (status.trim() !== '') {
      info('❌ You have uncommitted changes. Please commit or stash them before releasing.')
      process.exit(1)
    }
    done('No uncommitted changes found.')

    // Step 1: Read the current version
    step('Reading current version...')
    const currentVersion = pkg.version
    const [major, minor, patch] = currentVersion.split('.').map(Number)

    // Step 2: Define new versions for each bump type
    step('Calculating new versions...')
    const versions = {
      patch: `${major}.${minor}.${patch + 1}`,
      minor: `${major}.${minor + 1}.0`,
      major: `${major + 1}.0.0`,
    }

    // Step 3: Determine the version bump — non-interactive via CLI arg
    // (`node ./scripts/versions patch|minor|major`), falling back to a prompt.
    step('Selecting version bump type...')
    const argBump = process.argv[2]
    let bump
    if (argBump) {
      if (!['patch', 'minor', 'major'].includes(argBump)) {
        info(`❌ Invalid bump type "${argBump}" (expected patch | minor | major).`)
        process.exit(1)
      }
      bump = argBump
    } else {
      ;({ bump } = await inquirer.prompt([
        {
          type: 'list',
          name: 'bump',
          message: `Current version: ${currentVersion}. Select version bump:`,
          choices: [
            { name: `Patch (${currentVersion} → ${versions.patch})`, value: 'patch' },
            { name: `Minor (${currentVersion} → ${versions.minor})`, value: 'minor' },
            { name: `Major (${currentVersion} → ${versions.major})`, value: 'major' },
          ],
        },
      ]))
    }

    step(`🚀 Bumping version: ${bump} (${currentVersion} → ${versions[bump]})\n`)

    // Step 4: Run pnpm version without creating Git tags and commits
    step('Running pnpm version...')
    await $`pnpm version ${bump} --no-git-tag-version`
    done('Version bumped successfully.')

    // Step 5: Read the updated version from root package.json
    step('Reading updated version...')
    const updatedPkg = JSON.parse(readFileSync('./package.json', 'utf8'))
    const newVersion = updatedPkg.version

    // Step 6: Sync the new version across all workspace packages
    step('Syncing workspace versions...')
    syncVersions(newVersion)
    done('Workspace versions synchronized.')

    // Step 7: Stage all changed package.json files
    step('Staging changes...')
    await $`git add package.json packages/*/package.json`
    done('Changes staged.')

    // Step 8: Commit the version changes
    step('Committing changes...')
    await $`git commit -m "chore: release version ${newVersion}"`
    done('Changes committed.')

    // Step 9: Create an annotated Git tag for the new version
    step('Creating Git tag...')
    await $`git tag v${newVersion} -m "Release version ${newVersion}"`
    done('Git tag created.')

    // Step 10: Push commits and tags to the remote repository
    step('Pushing to remote repository...')
    await $`git push --follow-tags`
    done('Pushed to git successfully!')
  } catch (error) {
    info('\n❌ Failed version update:', error)
    process.exit(1)
  }
}

await main()
