const { Issuer, OpenIdConnectError } = require('openid-client');
const prompts = require('prompts');
const got = require('got');
const open = require('open');
const questions = require('./questions');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const response = await prompts(questions);

  if (!response.audience) {
    delete response.audience;
  }
  response.scope = response.scope.join(' ');

  const auth0 = await Issuer.discover(`https://${response.domain}`);
  const client = new auth0.Client({
    client_id: response.client_id,
    token_endpoint_auth_method: 'none',
    id_token_signed_response_alg: 'RS256',
  });

  let verification_uri_complete, device_code, interval;
  ({ body: { verification_uri_complete, device_code, interval } } = await got.post(auth0.device_authorization_endpoint, {
    json: true,
    form: true,
    body: { client_id: client.client_id, scope: response.scope, audience: response.audience },
  }));
  
  if (interval) {
    interval = interval * 1000;
  } else {
    interval = 5000;
  }

  await prompts({
    type: 'invisible',
    message: 'Press any key to open up the browser to login or press ctrl-c to abort.',
  });

  open(verification_uri_complete);

  let done;
  let tokens;
  let logged;

  while (!done && !tokens) {
    tokens = await client.grant({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code,
    }).catch((err) => {
      switch (err.error) {
        case 'slow_down':
        case 'authorization_pending':
          if (!logged) {
            console.log('\n\nauthorization pending ...');
            logged = true
          }
          return wait(interval);
          break;
        case 'access_denied':
          console.error('\n\ncancelled interaction');
          done = true;
          break;
        case 'expired_token':
          console.error('\n\ndevice flow expired');
          done = true;
          break;
        default:
          if (err instanceof OpenIdConnectError) {
            console.error(`\n\nerror = ${err.error}; error_description = ${err.error_description}`);
            done = true;
          } else {
            throw err;
          }
      }
    });
  }

  if (tokens) {
    if (tokens.id_token) {
      await client.validateIdToken(tokens);
    }

    console.log('\n\nresult tokens', { ...tokens });
    console.log('\n\nID Token Claims', tokens.claims);
    console.log('\n\nUserInfo response', await client.userinfo(tokens));
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
})
