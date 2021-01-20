const { Issuer, errors: { OPError } } = require('openid-client');
const prompts = require('prompts');
const open = require('open');
const questions = require('./questions');

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

  // Device Authorization Request - https://tools.ietf.org/html/rfc8628#section-3.1
  const handle = await client.deviceAuthorization({ scope: response.scope, audience: response.audience })

  // Device Authorization Response - https://tools.ietf.org/html/rfc8628#section-3.2
  const { verification_uri_complete, user_code, expires_in } = handle

  // User Interaction - https://tools.ietf.org/html/rfc8628#section-3.3
  await prompts({
    type: 'invisible',
    message: `Press any key to open up the browser to login or press ctrl-c to abort. You should see the following code: ${user_code}. It expires in ${expires_in % 60 === 0 ? `${expires_in / 60} minutes` : `${expires_in} seconds`}.`,
  });
  // opens the verification_uri_complete URL using the system-register handler for web links (browser)
  open(verification_uri_complete);

  // Device Access Token Request - https://tools.ietf.org/html/rfc8628#section-3.4
  // Device Access Token Response - https://tools.ietf.org/html/rfc8628#section-3.5
  let tokens;
  try {
    tokens = await handle.poll()
  } catch (err) {
    switch (err.error) {
      case 'access_denied': // end-user declined the device confirmation prompt, consent or rules failed
        console.error('\n\ncancelled interaction');
        break;
      case 'expired_token': // end-user did not complete the interaction in time
        console.error('\n\ndevice flow expired');
        break;
      default:
        if (err instanceof OPError) {
          console.error(`\n\nerror = ${err.error}; error_description = ${err.error_description}`);
        } else {
          throw err;
        }
    }
  }

  if (tokens) {
    console.log('\n\nresult tokens', { ...tokens });

    // requests without openid scope will not contain an id_token
    if (tokens.id_token) {
      console.log('\n\nID Token Claims', tokens.claims());
    }

    // try-catching this since resource may have been used and the access token may
    // not be eligible for accessing the UserInfo Response
    try {
      console.log('\n\nUserInfo response', await client.userinfo(tokens));
    } catch (err) {
      //
    }
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
})
