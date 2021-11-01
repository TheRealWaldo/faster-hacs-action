import {
  getInput, setFailed, info, getBooleanInput,
} from '@actions/core';
import { context } from '@actions/github';
import checks from './checks';

const ignore = getInput('ignore').split(' ') || [];
const githubToken = getInput('github-token');
const postComment = getBooleanInput('comment');

const { Octokit } = require('@octokit/action');

const octokit = new Octokit({ auth: githubToken });

const repository = process.env.GITHUB_REPOSITORY;
const [owner, repo] = repository.split('/');

const checkIcon = '✅';
const failIcon = '❌';
const skipIcon = '⚪';
const commentIdentifier = '<!-- Faster HACS action comment -->';

info(`Firing from ${context.eventName} on ${context.ref}`);

const pullRequestMessages = [commentIdentifier, '🎉 **Faster HACS repository validator action summary** 🎉\n'];

function setPassMessage(message) {
  const passMessage = `${checkIcon} ${message}`;
  info(passMessage);
  pullRequestMessages.push(passMessage);
}

function setFailMessage(message, url) {
  const failMessage = `${failIcon} ${message} (more-info: ${url})`;
  setFailed(failMessage);
  pullRequestMessages.push(failMessage);
}

function setNeutralMessage(message, url) {
  const neutralMessage = `${skipIcon} ${message} (more-info: ${url})`;
  info(neutralMessage);
  pullRequestMessages.push(neutralMessage);
}

function setIgnoreMessage(message) {
  const ignoreMessage = `${skipIcon} ${message}`;
  info(ignoreMessage);
  pullRequestMessages.push(ignoreMessage);
}

async function runChecks(checkGroup, data = null) {
  const checkPromises = checkGroup.checks.map((check) => new Promise((resolve, reject) => {
    if (ignore.includes(check.name) && check.canSkip) {
      setIgnoreMessage(`Ignored check: ${check.name}`);
      resolve();
    } else if (!check.ignore()) {
      Promise.resolve(check.check(data)).then((response) => {
        switch (typeof response) {
          case 'boolean':
            if (response) {
              setPassMessage(check.description);
            } else {
              setFailMessage(check.description, check.url);
            }
            break;
          case 'string':
            if (check.neutral) {
              setNeutralMessage(response, check.url);
            } else {
              setFailMessage(response, check.url);
            }
            break;
          case 'object':
            if (response.pass) {
              setPassMessage(response.message);
            } else if (check.neutral) {
              setNeutralMessage(response.message, check.url);
            } else {
              setFailMessage(response.message, check.url);
            }
            break;
          default:
            reject(new Error('Unknown check response type'));
            break;
        }
        resolve();
      });
    } else {
      resolve();
    }
  }));
  return Promise.all(checkPromises);
}

async function runCheckGroups(checkGroup) {
  switch (checkGroup.group) {
    case 'repo':
      return octokit
        .request('GET /repos/{owner}/{repo}', {
          headers: {
            accept: 'application/vnd.github.mercy-preview+json',
          },
          owner,
          repo,
        })
        .then((response) => runChecks(checkGroup, response.data));
    case 'file':
    case 'json':
    case 'external':
    case 'functionality':
      return runChecks(checkGroup);
    default:
      throw new Error(`Unknown check group ${checkGroup.group}`);
  }
}

const promises = checks.map((checkGroup) => runCheckGroups(checkGroup).catch((error) => {
  throw new Error(
    `Something went wrong when processing the ${checkGroup.description}: ${error.message}`,
  );
}));

Promise.all(promises).catch((reason) => { setFailed(reason); });

if (context.payload.pull_request != null && postComment) {
  Promise.all(promises).then(() => {
    pullRequestMessages.push('\nThis check was completed with https://github.com/TheRealWaldo/faster-hacs-action which is designed to rapidly assess your HACS addon.  If this is a release, we still recommend you use the official https://github.com/hacs/action/ action!');

    const pullRequestNumber = context.payload.pull_request.number;

    return octokit.paginate(octokit.rest.issues.listComments, {
      owner,
      repo,
      issue_number: pullRequestNumber,
    }).then((comments) => {
      const existingComment = comments.find((comment) => comment.body.includes(commentIdentifier));
      if (existingComment) {
        return octokit.issues.updateComment({
          owner,
          repo,
          comment_id: existingComment.id,
          body: pullRequestMessages.join('\n'),
        });
      }

      return octokit.issues.createComment({
        owner,
        repo,
        issue_number: pullRequestNumber,
        body: pullRequestMessages.join('\n'),
      });
    });
  }).catch((reason) => {
    setFailed(reason);
  });
}
