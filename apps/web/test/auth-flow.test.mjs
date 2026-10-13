import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { createTRPCClient, httpLink } from '@trpc/client';

const url = process.env.AUTH_TEST_URL ?? 'http://localhost:3000/trpc';
const origin = process.env.AUTH_TEST_ORIGIN ?? 'http://localhost:5173';

function client(initialCookie = '', requestOrigin = origin) {
  let cookie = initialCookie;
  let accessToken = '';
  const rpc = createTRPCClient({
    links: [httpLink({
      url,
      headers: () => ({
        origin: requestOrigin,
        ...(cookie ? { cookie } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      }),
      fetch: async (input, options) => {
        const response = await fetch(input, options);
        const setCookie = response.headers.get('set-cookie');
        if (setCookie?.startsWith('refresh_token=')) cookie = setCookie.split(';', 1)[0];
        return response;
      },
    })],
  });
  return {
    rpc,
    get cookie() { return cookie; },
    set accessToken(value) { accessToken = value; },
  };
}

async function rejectsWithCode(operation, code) {
  await assert.rejects(operation, (error) => error?.data?.code === code);
}

test('signup, login, refresh rotation, logout and origin checks', async () => {
  const loginId = `t${randomBytes(6).toString('hex')}`;
  const password = 'correct-horse-42';
  const browser = client();
  const signup = await browser.rpc.auth.signup.mutate({ loginId, password, passwordConfirm: password });
  assert.equal(signup.user.loginId, loginId);
  assert.ok(browser.cookie.startsWith('refresh_token='));
  browser.accessToken = signup.accessToken;
  assert.equal((await browser.rpc.auth.me.query()).userId, signup.user.userId);
  const jwtParts = signup.accessToken.split('.');
  jwtParts[2] = `${jwtParts[2][0] === 'a' ? 'b' : 'a'}${jwtParts[2].slice(1)}`;
  browser.accessToken = jwtParts.join('.');
  await rejectsWithCode(() => browser.rpc.auth.me.query(), 'UNAUTHORIZED');
  browser.accessToken = signup.accessToken;

  await rejectsWithCode(
    () => browser.rpc.auth.signup.mutate({ loginId: `${loginId}new`, password, passwordConfirm: 'different' }),
    'BAD_REQUEST',
  );

  await rejectsWithCode(
    () => browser.rpc.auth.signup.mutate({ loginId, password, passwordConfirm: password }),
    'CONFLICT',
  );
  const badId = await browser.rpc.auth.login.mutate({ loginId: `${loginId}x`, password }).catch((error) => error);
  const badPassword = await browser.rpc.auth.login.mutate({ loginId, password: 'wrong-password' }).catch((error) => error);
  assert.equal(badId.data.code, 'UNAUTHORIZED');
  assert.equal(badId.message, badPassword.message);

  const login = await browser.rpc.auth.login.mutate({ loginId, password });
  browser.accessToken = login.accessToken;
  const previousCookie = browser.cookie;
  const first = client(previousCookie);
  const second = client(previousCookie);
  const attempts = await Promise.allSettled([
    first.rpc.auth.refresh.mutate(),
    second.rpc.auth.refresh.mutate(),
  ]);
  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter((attempt) => attempt.status === 'rejected').length, 1);
  await rejectsWithCode(() => client(previousCookie).rpc.auth.refresh.mutate(), 'UNAUTHORIZED');

  const winner = attempts[0].status === 'fulfilled' ? first : second;
  assert.notEqual(winner.cookie, previousCookie);
  const rotatedCookie = winner.cookie;
  await winner.rpc.auth.logout.mutate();
  await rejectsWithCode(() => client(rotatedCookie).rpc.auth.refresh.mutate(), 'UNAUTHORIZED');
  await winner.rpc.auth.logout.mutate();

  await rejectsWithCode(
    () => client('', 'http://invalid.example').rpc.auth.login.mutate({ loginId, password }),
    'FORBIDDEN',
  );
});
