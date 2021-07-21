import fs from 'fs';
import { parse as parseJson } from 'json5';
import fetch from 'node-fetch';
import glob from 'glob';
import path from 'path';
import { execSync } from 'child_process';
import { getInput, setFailed } from '@actions/core';
import pythonStdLibList from './python_std_lib_list';

const category = getInput('category');
const repository = process.env.GITHUB_REPOSITORY;
const repo = repository.split('/')[1];
const pythonVersion = process.env.DEFAULT_PYTHON || 3.8;

function getManifest() {
  if (typeof getManifest.manifest === 'undefined') {
    const matches = glob.sync('**/manifest.json');
    if (matches.length === 1) {
      const manifestFileName = matches[0];
      const manifestFile = fs.readFileSync(manifestFileName);
      getManifest.manifest = parseJson(manifestFile);
    } else {
      getManifest.manifest = false;
    }
  }
  return getManifest.manifest;
}

function getRequirements() {
  if (getManifest()) {
    if ('requirements' in getManifest()) {
      return getManifest().requirements;
    }
    return false;
  }
  return false;
}

function getHacsConfig() {
  if (typeof getHacsConfig.hacsConfig === 'undefined') {
    if (fs.existsSync('hacs.json')) {
      getHacsConfig.hacsConfig = parseJson(fs.readFileSync('hacs.json'));
    } else {
      getHacsConfig.hacsConfig = false;
    }
  }
  return getHacsConfig.hacsConfig;
}

function checkURL(url) {
  return fetch(url, {
    method: 'HEAD',
  })
    .catch((error) => {
      setFailed(`Failed checking ${url}: ${error.message}`);
      return false;
    })
    .then((response) => {
      if ('ok' in response) {
        return response.ok;
      }
      return false;
    });
}

function checkFileExistsCaseInsensitive(requestedPath) {
  const names = fs.readdirSync(path.dirname(requestedPath));
  const requestedFileName = path.basename(requestedPath).toLowerCase();

  return names.find((value) => value.toLowerCase() === requestedFileName);
}

function whichInfoFile() {
  if (typeof whichInfoFile.infoFile === 'undefined') {
    if (getHacsConfig() && 'render_readme' in getHacsConfig() && getHacsConfig().render_readme) {
      whichInfoFile.infoFile = checkFileExistsCaseInsensitive('README.md') || checkFileExistsCaseInsensitive('README');
    } else {
      whichInfoFile.infoFile = checkFileExistsCaseInsensitive('INFO.md') || checkFileExistsCaseInsensitive('INFO');
    }
  }
  return whichInfoFile.infoFile;
}

const checks = [
  {
    group: 'repo',
    description: 'Repository checks',
    checks: [
      {
        name: 'description',
        description: 'The repository has a description',
        canSkip: true,
        ignore: () => false,
        check: (repositoryData) => repositoryData.description !== '',
        url: 'https://hacs.xyz/docs/publish/include#check-repository',
      },
      {
        name: 'archived',
        description: 'The repository is not archived',
        canSkip: true,
        ignore: () => false,
        check: (repositoryData) => !repositoryData.archived || 'The repository is archived',
        url: 'https://hacs.xyz/docs/publish/include#check-archived',
      },
      {
        name: 'topics',
        description: 'The repository has topics',
        canSkip: true,
        ignore: () => false,
        check: (repositoryData) => ('topics' in repositoryData && repositoryData.topics.length !== 0)
          || 'The repository is missing topics',
        url: 'https://hacs.xyz/docs/publish/include#check-repository',
      },
      {
        name: 'issues',
        description: 'The repository has issues enabled',
        canSkip: true,
        ignore: () => false,
        check: (repositoryData) => repositoryData.has_issues || 'The repository does not have issues enabled',
        url: 'https://hacs.xyz/docs/publish/include#check-repository',
      },
      {
        name: 'fork',
        description: 'The repository is not a fork',
        canSkip: true,
        neutral: true,
        ignore: () => repository !== 'hacs/default',
        check: (repositoryData) => !repositoryData.fork || 'The repository is a fork',
        url: 'https://hacs.xyz/docs/publish/include#check-repository',
      },
    ],
  },
  {
    group: 'file',
    description: 'File existence checks',
    checks: [
      {
        name: 'information',
        description: 'Information file exists',
        canSkip: true,
        ignore: () => false,
        check: () => {
          if (whichInfoFile() !== undefined) {
            return { pass: true, message: `${whichInfoFile()} exists` };
          }
          return 'Missing information file';
        },
        url: 'https://hacs.xyz/docs/publish/include#check-info',
      },
      {
        name: 'images',
        description: 'Information file has images',
        canSkip: true,
        ignore: () => !['plugin', 'theme'].includes(category),
        check: () => {
          if (whichInfoFile() !== undefined) {
            const found = fs.readFileSync(whichInfoFile()).match(/<img[^>]+>|!\[[^\]]+\]/gi);
            const ignoreURL = ['-shield', 'img.shields.io', 'buymeacoffee.com'];
            return (
              (found.length
                && !found.every((img) => ignoreURL.find((str) => img.includes(str)) !== undefined))
              || 'There should be images to show the user what they get'
            );
          }
          return 'There should be images to show the user what they get';
        },
        url: 'https://hacs.xyz/docs/publish/include#check-images',
      },
    ],
  },
  {
    group: 'json',
    description: 'JSON contents checks',
    checks: [
      {
        name: 'manifest',
        description: 'All required keys are present in manifest.json',
        canSkip: false,
        ignore: () => false,
        check: () => {
          const manifest = getManifest();
          if (manifest) {
            const requiredKeys = [
              'issue_tracker',
              'domain',
              'documentation',
              'codeowners',
              'version',
            ];

            const missingKeys = requiredKeys.filter((key) => !Object.keys(manifest).includes(key));
            if (missingKeys.length > 0) {
              return `manifest.json is missing the key(s): ${missingKeys.join(', ')}`;
            }
            return true;
          }
          return 'manifest.json file not found';
        },
        url: 'https://hacs.xyz/docs/publish/include#check-manifest',
      },
      {
        name: 'hacsjson',
        description: "hacs.json has the 'name' key set",
        canSkip: true,
        ignore: () => false,
        check: () => {
          if (getHacsConfig()) {
            return (
              ('name' in getHacsConfig() && getHacsConfig().name !== '')
              || "Missing 'name' from hacs.json"
            );
          }
          return 'hacs.json file not found in the root of the repository';
        },
        url: 'https://hacs.xyz/docs/publish/include#check-hacs-manifest',
      },
      {
        name: 'requirements',
        description: 'Requirements validation',
        canSkip: true,
        ignore: () => category !== 'integration' || !getRequirements() || !getRequirements().length,
        check: () => {
          const pipRegex = /^(--.+\s)?([-_.\w\d]+.*(?:==|>=|<=|~=|!=|<|>|===)?.*$)/;
          let failedRequirements = [];
          getRequirements().forEach((requirement) => {
            const matches = requirement.match(pipRegex);
            if (!matches) {
              failedRequirements.push(requirement);
              return;
            }

            const installArgs = matches[1] || '';
            const requirementArgs = matches[2];
            try {
              execSync(
                `pip --disable-pip-version-check install --quiet --no-warn-script-location --index https://wheels.home-assistant.io/alpine-3.12/amd64 --extra-index-url https://pypi.python.org/simple ${installArgs} ${requirementArgs}`,
              );
            } catch (error) {
              setFailed(`pip failed with: ${error}`);
              failedRequirements.push(requirement);
            }
          });

          if (failedRequirements.length !== 0) {
            return `These requirement(s) failed to parse or install: ${failedRequirements.join(
              ', ',
            )}`;
          }
          execSync('pip install pipdeptree');

          failedRequirements = [];

          const pipdeptreeRegex = /^(?:--.+\s)?([-_.\w\d]+).*(?:==|>=|<=|~=|!=|<|>|===)?.*$/;
          const pipdeptreeRequirements = getRequirements().map((requirement) => {
            const matches = requirement.match(pipdeptreeRegex);
            if (!matches) {
              failedRequirements.push(requirement);
              return false;
            }
            return matches[1].toLowerCase().replace('_', '-');
          });

          if (failedRequirements.length !== 0) {
            return `These requirement(s) string(s) failed to parse: ${failedRequirements.join(
              ', ',
            )}`;
          }

          if (pipdeptreeRequirements.length > 0) {
            const pythonStdLibs = pythonStdLibList(pythonVersion);
            const requirements = parseJson(
              execSync(
                `pipdeptree -w silence --packages ${pipdeptreeRequirements.join(',')} --json`,
              ).toString(),
            );
            failedRequirements = requirements.filter((req) => pythonStdLibs.includes(req));
          } else {
            return 'Something went wrong while checking requirements';
          }

          if (failedRequirements.length !== 0) {
            return `Packages: ${failedRequirements.join(
              ', ',
            )} are not compatible with Python standard libraries`;
          }

          return true;
        },
        url: 'https://hacs.xyz/docs/publish/include#check-requirements',
      },
    ],
  },
  {
    group: 'external',
    description: 'External repo checks',
    checks: [
      {
        name: 'brands',
        description: `${repository} is added to https://github.com/home-assistant/brands NICE!`,
        canSkip: true,
        ignore: () => category !== 'integration',
        check: async () => {
          const manifest = getManifest();
          if (manifest) {
            if (Object.keys(manifest).includes('domain')) {
              return checkURL(
                `https://github.com/home-assistant/brands/tree/master/custom_integrations/${manifest.domain}`,
              ).then(
                (valid) => valid
                  || `${manifest.domain} is not added to the custom_integration directory in https://github.com/home-assistant/brands`,
              );
            }
            return 'domain missing from manifest.json, cannot check brands';
          }
          return 'manifest.json file not found, cannot check brands';
        },
        url: 'https://hacs.xyz/docs/publish/include#check-brands',
      },
      {
        name: 'wheels',
        description: 'Python wheels',
        canSkip: true,
        ignore: () => category !== 'integration' || !getRequirements() || !getRequirements.length,
        check: async () => {
          const manifest = getManifest();
          if (manifest) {
            if (Object.keys(manifest).includes('domain')) {
              return checkURL(
                `https://raw.githubusercontent.com/home-assistant/wheels-custom-integrations/master/components/${manifest.domain}.json`,
              ).then((valid) => valid || 'Python Wheels');
            }
            return 'domain missing from manifest.json, cannot check wheels';
          }
          return 'manifest.json file not found, cannot check wheels';
        },
        url: 'https://hacs.xyz/docs/publish/include#check-wheels',
      },
    ],
  },
  {
    group: 'functionality',
    description: 'Functionality checks',
    checks: [
      {
        name: 'hacs',
        description: 'HACS load-ability check (does not try to load)',
        canSkip: true,
        ignore: () => false,
        check: () => {
          let matches = [];
          switch (category) {
            case 'appdaemon':
              matches = glob.sync('*.py');
              if (matches.length > 0) {
                return 'Should not be any python files in the root of the repository';
              }
              matches = glob.sync('apps/*.py');
              if (matches.length > 0) {
                return 'Should not be any python files in the apps directory of the repository';
              }
              matches = glob.sync('apps/*/');
              if (matches.length !== 1) {
                return 'Should only be one app in the apps directory of the repository';
              }
              matches = glob.sync('apps/*/*.py');
              if (matches.length === 0) {
                return 'The application python files are not present in the apps/APP_NAME/ directory of the repository';
              }
              return true;

            case 'integration':
              matches = glob.sync('*.py');
              if (matches.length > 0) {
                return 'Should not be any python files in the root of the repository';
              }
              matches = glob.sync('custom_components/*.py');
              if (matches.length > 0) {
                return 'Should not be any python files in the custom_components directory of the repository';
              }
              matches = glob.sync('custom_components/*/');
              if (matches.length !== 1) {
                return 'Should only be one app in the apps directory of the repository';
              }
              matches = glob.sync('custom_components/*/*.py');
              if (matches.length === 0) {
                return 'The application python files are not present in the apps/APP_NAME/ directory of the repository';
              }
              return true;

            case 'netdaemon':
              matches = glob.sync('*.cs');
              if (matches.length > 0) {
                return 'Should not be any cs files in the root of the repository';
              }
              matches = glob.sync('apps/*.cs');
              if (matches.length > 0) {
                return 'Should not be any cs files in the apps directory of the repository';
              }
              matches = glob.sync('apps/*/');
              if (matches.length !== 1) {
                return 'Should only be one app in the apps directory of the repository';
              }
              matches = glob.sync('apps/*/*.cs');
              if (matches.length === 0) {
                return 'The application cs files are not present in the apps/APP_NAME/ directory of the repository';
              }
              return true;

            case 'plugin':
              matches = glob.sync(`?(dist/)?(lovelace-)${repo}.js)`);
              if (matches.length !== 1) {
                return 'The plugin should follow the rules at https://hacs.xyz/docs/publish/plugin';
              }
              return true;

            case 'python_script':
              matches = glob.sync('*.py');
              if (matches.length > 0) {
                return 'Should not be any python files in the root of the repository';
              }
              matches = glob.sync('python_scripts/*.py');
              if (matches.length !== 1) {
                return 'Should only be one python file in the python_scripts directory of the repository';
              }
              return true;
            case 'themes':
              matches = glob.sync('*.py');
              if (matches.length > 0) {
                return 'Should not be any python files in the root of the repository';
              }
              matches = glob.sync('themes/*.yaml');
              if (matches.length !== 1) {
                return 'Should only be one yaml file in the themes directory of the repository';
              }
              return true;
            default:
              return 'Invalid category for HACS';
          }
        },
        url: 'https://hacs.xyz/docs/publish/include#check-hacs',
      },
    ],
  },
];

export default checks;
