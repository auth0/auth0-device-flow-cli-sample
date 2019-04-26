const { Issuer } = require('openid-client');
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

  // fetches the .well-known endpoint for endpoints, issuer value etc.
  const auth0 = await Issuer.discover(`https://${response.domain}`);

  // instantiates a client
  const client = new auth0.Client({
    client_id: response.client_id,
    token_endpoint_auth_method: 'none',
    id_token_signed_response_alg: 'RS256',
  });

  // Device Authorization Request - https://tools.ietf.org/html/draft-ietf-oauth-device-flow-15#section-3.1
  const { body: deviceAuthorizationResponse } = await got.post(auth0.device_authorization_endpoint, {
    json: true, // parse the response as json
    form: true, // send the request body as application/x-www-form-urlencoded
    body: { client_id: client.client_id, scope: response.scope, audience: response.audience }, // no client authentication
  });

  const { verification_uri_complete, device_code, user_code, expires_in } = deviceAuthorizationResponse;
  let { interval } = deviceAuthorizationResponse;

  // use the interval specified or default to 5seconds as per the specification
  // interval
  //   OPTIONAL.  The minimum amount of time in seconds that the client
  //   SHOULD wait between polling requests to the token endpoint.  If no
  //   value is provided, clients MUST use 5 as the default.
  if (interval) {
    interval = interval * 1000;
  } else {
    interval = 5000;
  }

  await prompts({
    type: 'invisible',
    message: `Press any key to open up the browser to login or press ctrl-c to abort. You should see the following code: ${user_code}. It expires in ${expires_in % 60 === 0 ? `${expires_in / 60} minutes` : `${expires_in} seconds`}.`,
  });

  // opens the verification_uri_complete URL using the system-register handler for web links (browser)
  open(verification_uri_complete);

  let done;
  let tokens;
  let logged;

  while (!done && !tokens) {
    // Device Access Token Request https://tools.ietf.org/html/draft-ietf-oauth-device-flow-15#section-3.4
    tokens = await client.grant({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code,
    }).catch((err) => {
      switch (err.error) {
        case 'slow_down': // soft error, should re-try in the specified interval
        case 'authorization_pending': // soft error, should re-try in the specified interval
          if (!logged) {
            console.log('\n\nauthorization pending ...');
            logged = true
          }
          return wait(interval);
          break;
        case 'access_denied': // end-user declined the device confirmation prompt, consent or rules failed
          console.error('\n\ncancelled interaction');
          done = true;
          break;
        case 'expired_token': // end-user did not complete the interaction in time
          console.error('\n\ndevice flow expired');
          done = true;
          break;
        default:
          if (err.name === 'OpenIdConnectError') {
            console.error(`\n\nerror = ${err.error}; error_description = ${err.error_description}`);
            done = true;
          } else {
            throw err;
          }
      }
    });
  }

  if (tokens) {
    // requests without openid scope will not contain an id_token
    if (tokens.id_token) {
      await client.validateIdToken(tokens); // validate ID Token (mandatory claims and signature)
    }

    console.log('\n\nresult tokens', { ...tokens });
    console.log('\n\nID Token Claims', tokens.claims);
    console.log('\n\nUserInfo response', await client.userinfo(tokens));
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
})
