## @jscad/cli

## JSCAD Command Line Interface (CLI) - Contributing Guide

This package is part of the JSCAD Organization, and is maintained by a group of volunteers. We welcome and encourage anyone to pitch in but please take a moment to read the following guidelines.

* If you want to submit a bug report please make sure to follow the [Reporting Issues](https://github.com/jscad/OpenJSCAD.org/wiki/Reporting-Issues) guide. Bug reports are accepted as [Issues](https://github.com/jscad/OpenJSCAD.org/issues/) via GitHub.

* If you want to submit a change or a patch, please read the contents below on how to make changes. New contributions are accepted as [Pull Requests](https://github.com/jscad/OpenJSCAD.org/pulls/) via GithHub.

* We only accept bug reports and pull requests on **GitHub**.

* If you have a question about how to use JSCAD CLI, then please start a conversation at the [JSCAD User Group](https://jscad.xyz/forum). You might find the answer in the [JSCAD.org User Guide](https://openjscad.org/dokuwiki/doku.php).

* If you have a change or new feature in mind, please start a conversation with the [Core Developers](https://jscad.xyz/forum) and start contributing changes.

Thanks!

The JSCAD Organization

## Making Changes

The CLI package is part of the JSCAD project, and requires other packages to execute properly. Therefore, we suggest that you start by creating a fork of this repository.  This will keep your changes separate from the fast lane.  And make pull requests easier.

You can create a fork via GitHub.

Once forked, clone your copy of the OpenJSCAD.org repository to a local file system.

```
git clone https://github.com/myusername/OpenJSCAD.org.git
cd OpenJSCAD.org
```

The next steps require [NPM](https://www.npmjs.com/) and [Node.js](https://nodejs.org).
The JSCAD project always develops with the latest LTS releases.

Next, try to run the test suites to verify the installation.

```
npm install
npm test
```

This may take some time... relax... have some coffee.

If the tests ran successfully then changes can be made to any package. See the 'packages' directory.

NOTE: All packages and dependencies have been linked together by Lerna. No other magic is required.

The CLI can be executed manually from 'packages/cli'

```
cd packages/cli
node ./cli.js
```

There are test suites for the CLI, which can be executed. See *.test.js files for the test suites.

```
npm test
```

You can now make changes to any package, and check the changes by executing the CLI again. Now is a good time to add some test cases into the test suites.

Done? Great! Commit the changes, and push back to your fork at GitHub.

```
git commit changed-file
git add src/new-test.js
git commit src/new-test.js
git push
```

Finally, you can review your changes via GitHub, and create a pull request. 

TIPS for successful pull requests:
- Commit often, and comment well
- Follow the [JavaScript Standard Style](https://standardjs.com/index.html) when making changes
- Create test cases for all changes
- Finally, verify that ALL tests suites pass

WOW! Thanks for the cool code.

## Contributors

Thank you to all the people who have already contributed to the JSCAD project!
<a href="graphs/contributors"><img src="https://opencollective.com/openjscad/contributors.svg?width=890" /></a>