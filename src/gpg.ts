import * as exec from '@actions/exec';
import {ExecOptions} from '@actions/exec/lib/interfaces';

const PRIVATE_KEY_FINGERPRINT_REGEX = /\w{40}/;

export async function importKey(privateKey: string) {
  let output = '';

  const options: ExecOptions = {
    silent: true,
    input: Buffer.from(privateKey, 'utf-8'),
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      }
    }
  };

  await exec.exec(
    'gpg',
    ['--batch', '--import-options', 'import-show', '--import'],
    options
  );

  const match = output.match(PRIVATE_KEY_FINGERPRINT_REGEX);
  return match && match[0];
}

export async function deleteKey(keyFingerprint: string) {
  await exec.exec(
    'gpg',
    ['--batch', '--yes', '--delete-secret-keys', keyFingerprint],
    {silent: true}
  );
  await exec.exec(
    'gpg',
    ['--batch', '--yes', '--delete-keys', keyFingerprint],
    {silent: true}
  );
}
