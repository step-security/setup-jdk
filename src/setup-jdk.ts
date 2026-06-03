import * as core from '@actions/core';
import * as installer from './installer';
import * as auth from './auth';
import * as gpg from './gpg';
import * as constants from './constants';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';

async function validateSubscription() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  let repoPrivate: boolean | undefined;

  if (eventPath && fs.existsSync(eventPath)) {
    const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    repoPrivate =
      eventData && eventData.repository && eventData.repository.private;
  }

  const upstream = 'joschi/setup-jdk';
  const action = process.env.GITHUB_ACTION_REPOSITORY;
  const docsUrl =
    'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions';

  core.info('');
  core.info('\u001b[1;36mStepSecurity Maintained Action\u001b[0m');
  core.info(`Secure drop-in replacement for ${upstream}`);
  if (repoPrivate === false)
    core.info('\u001b[32m\u2713 Free for public repositories\u001b[0m');
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
  core.info('');

  if (repoPrivate === false) return;

  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const body: Record<string, string> = {action: action || ''};
  if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl;
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body,
      {timeout: 3000}
    );
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      error.response &&
      error.response.status === 403
    ) {
      core.error(
        `\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`
      );
      core.error(
        `\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`
      );
      process.exit(1);
    }
    core.info('Timeout or API not reachable. Continuing to next step.');
  }
}

async function run() {
  await validateSubscription();

  try {
    // Type of release. Either a release version, known as General Availability ("ga") or an Early Access ("ea")
    const release_type = core.getInput(constants.INPUT_RELEASE_TYPE) || 'ga';
    // OpenJDK feature release version, example: "8", "11", "13".
    const javaVersion = core.getInput(constants.INPUT_JAVA_VERSION, {
      required: true
    });
    // OpenJDK implementation, example: "hotspot", "openj9".
    const openjdk_impl =
      core.getInput(constants.INPUT_OPENJDK_IMPL) || 'hotspot';
    // Architecture of the JDK, example: "x64", "x32", "arm", "ppc64", "s390x", "ppc64le", "aarch64", "sparcv9".
    const arch =
      core.getInput(constants.INPUT_ARCHITECTURE, {required: true}) || 'x64';
    // Heap size for OpenJ9, example: "normal", "large" (for heaps >=57 GiB).
    const heap_size =
      core.getInput(constants.INPUT_HEAP_SIZE, {required: false}) || 'normal';
    // Exact release of OpenJDK, example: "latest", "jdk-11.0.4+11.4", "jdk8u172-b00-201807161800".
    const release =
      core.getInput(constants.INPUT_RELEASE, {required: false}) || 'latest';
    // The image type (jre, jdk)
    const javaPackage =
      core.getInput(constants.INPUT_JAVA_PACKAGE, {
        required: true
      }) || 'jdk';
    const jdkFile = core.getInput(constants.INPUT_JDK_FILE, {required: false});

    await installer.getAdoptOpenJDK(
      release_type,
      javaVersion,
      javaPackage,
      openjdk_impl,
      arch,
      heap_size,
      release,
      jdkFile
    );

    const matchersPath = path.join(__dirname, '..', '..', '.github');
    console.log(`##[add-matcher]${path.join(matchersPath, 'java.json')}`);

    const id = core.getInput(constants.INPUT_SERVER_ID, {required: false});
    const username = core.getInput(constants.INPUT_SERVER_USERNAME, {
      required: false
    });
    const password = core.getInput(constants.INPUT_SERVER_PASSWORD, {
      required: false
    });
    const overwriteSettings =
      core.getInput(constants.INPUT_OVERWRITE_SETTINGS, {required: false}) ||
      'true';
    const gpgPrivateKey =
      core.getInput(constants.INPUT_GPG_PRIVATE_KEY, {required: false}) ||
      constants.INPUT_DEFAULT_GPG_PRIVATE_KEY;
    const gpgPassphrase =
      core.getInput(constants.INPUT_GPG_PASSPHRASE, {required: false}) ||
      (gpgPrivateKey ? constants.INPUT_DEFAULT_GPG_PASSPHRASE : undefined);

    if (gpgPrivateKey) {
      core.setSecret(gpgPrivateKey);
    }

    await auth.configAuthentication(
      id,
      username,
      password,
      overwriteSettings === 'true',
      gpgPassphrase
    );

    if (gpgPrivateKey) {
      core.info('importing private key');
      const keyFingerprint = (await gpg.importKey(gpgPrivateKey)) || '';
      core.saveState(
        constants.STATE_GPG_PRIVATE_KEY_FINGERPRINT,
        keyFingerprint
      );
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
